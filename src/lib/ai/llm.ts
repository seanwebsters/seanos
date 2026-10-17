import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type * as z from "zod/v4";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/bootstrap";
import { newId, nowIso } from "@/lib/util";
import { londonDate, londonTimeToUtc } from "@/lib/time";
import { AGENT_BY_KEY, HOUSE_RULES, type AgentKey } from "./agents";
import { BlockedError, RetryableError } from "./errors";
import { buildContext } from "./context";

/** USD per million tokens [input, output]. Web search $10 / 1k. */
const PRICES: Record<string, [number, number]> = {
  "claude-fable-5-1": [10, 50],
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};
export const MODELS = Object.keys(PRICES);

export interface UsageTotals { input_tokens: number; output_tokens: number; cache_read: number; cache_write: number; web_searches: number }

export function costCents(model: string, u: UsageTotals): number {
  const [i, o] = PRICES[model] ?? [4, 20];
  const usd = (u.input_tokens * i + u.output_tokens * o + u.cache_read * i * 0.1 + u.cache_write * i * 1.25) / 1e6 + u.web_searches * 0.01;
  return Math.round(usd * 10000) / 100;
}

export interface TransportRequest {
  agent: AgentKey;
  model: string;
  effort: "low" | "medium" | "high";
  system: Anthropic.Beta.Messages.BetaTextBlockParam[];
  content: Anthropic.Beta.Messages.BetaContentBlockParam[];
  jsonSchema: { type: "json_schema"; schema: Record<string, unknown> } | null;
  webSearch: boolean;
  maxTokens: number;
}
export interface TransportResponse { text: string; model: string; usage: UsageTotals; sources: { title: string; url: string }[] }
export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

let client: Anthropic | null = null;

const anthropicTransport: Transport = async (req) => {
  if (!env.anthropicApiKey) throw new BlockedError("ANTHROPIC_API_KEY", "Connect an Anthropic API key so your agents can work. Add ANTHROPIC_API_KEY to the server environment.");
  client ??= new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 2 });
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: req.content }];
  const usage: UsageTotals = { input_tokens: 0, output_tokens: 0, cache_read: 0, cache_write: 0, web_searches: 0 };
  const sources: { title: string; url: string }[] = [];
  let text = "";
  let model = req.model;
  const fallback = req.model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
  try {
    // Server tools (web search) can pause a long turn; resume until done.
    for (let turn = 0; turn < 6; turn++) {
      const stream = client.beta.messages.stream({
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages,
        output_config: { effort: req.effort, ...(req.jsonSchema ? { format: req.jsonSchema } : {}) },
        ...(req.webSearch ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }] } : {}),
        ...fallback,
      } as unknown as Anthropic.Beta.Messages.MessageCreateParamsStreaming);
      const msg = await stream.finalMessage();
      model = msg.model;
      const u = msg.usage as unknown as Record<string, unknown>;
      usage.input_tokens += Number(u.input_tokens ?? 0);
      usage.output_tokens += Number(u.output_tokens ?? 0);
      usage.cache_read += Number(u.cache_read_input_tokens ?? 0);
      usage.cache_write += Number(u.cache_creation_input_tokens ?? 0);
      usage.web_searches += Number((u.server_tool_use as Record<string, number> | null)?.web_search_requests ?? 0);
      for (const b of msg.content as unknown as Record<string, unknown>[]) {
        if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
          for (const r of b.content as Record<string, unknown>[]) if (typeof r.url === "string") sources.push({ title: String(r.title ?? r.url), url: r.url });
        }
      }
      if (msg.stop_reason === "refusal") throw new Error("The model declined this request.");
      if (msg.stop_reason === "max_tokens") throw new RetryableError("The model ran out of room before finishing.");
      text += msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      if (msg.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: msg.content as unknown as Anthropic.Beta.Messages.BetaContentBlockParam[] });
    }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new BlockedError("ANTHROPIC_API_KEY", `Anthropic rejected the API key (${err.status}). Check ANTHROPIC_API_KEY.`);
    }
    if (err instanceof Anthropic.RateLimitError) throw new RetryableError("Anthropic rate limit", 60_000);
    if (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500) throw new RetryableError(`Anthropic is unavailable (${err.status}).`);
    if (err instanceof Anthropic.APIConnectionError) throw new RetryableError("Couldn't reach Anthropic.");
    throw err;
  }
  return { text: text.trim(), model, usage, sources };
};

let transport: Transport = anthropicTransport;
/** Test hook: swap the HTTP transport for scripted responses. */
export function setTransport(t: Transport | null) {
  transport = t ?? anthropicTransport;
}

export async function spentSince(since: Date): Promise<number> {
  const rows = await getDb().list("usage");
  return rows.filter((r) => r.created_at >= since.toISOString()).reduce((s, r) => s + r.cost_cents, 0);
}

export async function budgetStatus() {
  const s = await getSettings();
  const today = londonDate();
  const day = await spentSince(londonTimeToUtc(today, 0, 0));
  const month = await spentSince(londonTimeToUtc(`${today.slice(0, 7)}-01`, 0, 0));
  return { day, month, dayCap: s.daily_budget_cents, monthCap: s.monthly_budget_cents };
}

async function assertBudget() {
  const b = await budgetStatus();
  if (b.day >= b.dayCap) throw new BlockedError("budget", `Today's AI budget ($${(b.dayCap / 100).toFixed(2)}) is used up. Raise it in Settings or wait until tomorrow.`);
  if (b.month >= b.monthCap) throw new BlockedError("budget", `This month's AI budget ($${(b.monthCap / 100).toFixed(2)}) is used up. Raise it in Settings.`);
}

export interface AgentCall<T> {
  agent: AgentKey;
  taskId: string | null;
  prompt: string;
  schema?: z.ZodType<T>;
  webSearch?: boolean;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  images?: { mime: string; data: string }[];
  /** Extra context to include (already scope-checked by the caller). */
  context?: string;
}

export interface AgentResult<T> { data: T; text: string; sources: { title: string; url: string }[]; cost_cents: number }

export async function callAgent<T = string>(call: AgentCall<T>): Promise<AgentResult<T>> {
  const db = getDb();
  const def = AGENT_BY_KEY[call.agent];
  const override = await db.get("agent_overrides", call.agent);
  if (override && !override.enabled) throw new BlockedError(`agent:${call.agent}`, `${def.name} is switched off in Agents.`);
  await assertBudget();
  const settings = await getSettings();
  const model = override?.model || (def.fast ? settings.fast_model : settings.default_model);
  const memory = await buildContext(call.agent);
  const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [
    { type: "text", text: `${HOUSE_RULES}\n\n${override?.instructions || def.instructions}` },
    { type: "text", text: memory, cache_control: { type: "ephemeral" } },
  ];
  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [
    ...(call.images ?? []).map((img) => ({ type: "image" as const, source: { type: "base64" as const, media_type: img.mime as "image/jpeg", data: img.data } })),
    { type: "text", text: `${call.context ? `${call.context}\n\n` : ""}Today is ${londonDate()} (Europe/London).\n\n${call.prompt}` },
  ];
  const fmt = call.schema ? zodOutputFormat(call.schema as z.ZodType) : null;
  const res = await transport({
    agent: call.agent,
    model,
    effort: call.effort ?? "medium",
    system,
    content,
    jsonSchema: fmt ? { type: "json_schema", schema: (fmt as unknown as { schema: Record<string, unknown> }).schema } : null,
    webSearch: Boolean(call.webSearch),
    maxTokens: call.maxTokens ?? 32000,
  });
  const cost = costCents(res.model, res.usage);
  await db.insert("usage", {
    id: newId("use"), task_id: call.taskId, agent: call.agent, provider: "anthropic", model: res.model,
    operation: call.webSearch ? "research" : call.schema ? "structured" : "text",
    input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens, web_searches: res.usage.web_searches,
    images: call.images?.length ?? 0, cost_cents: cost, created_at: nowIso(),
  });
  let data: T;
  if (call.schema) {
    try {
      data = call.schema.parse(JSON.parse(res.text));
    } catch (e) {
      throw new RetryableError(`${def.name} returned output that didn't match the expected shape: ${String(e).slice(0, 200)}`);
    }
  } else data = res.text as T;
  return { data, text: res.text, sources: res.sources, cost_cents: cost };
}
