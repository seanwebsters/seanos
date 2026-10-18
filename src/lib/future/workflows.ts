import "server-only";
import * as z from "zod/v4";
import { getDb } from "@/lib/db";
import type { Scenario } from "@/lib/db/types";
import { callAgent } from "@/lib/ai/llm";
import { getProfile } from "@/lib/bootstrap";
import { newId, nowIso } from "@/lib/util";
import { registerWorkflow } from "@/lib/engine/jobs";
import { SEARCH_RULE, SourceVerifier, SourceZ, toSources } from "@/lib/engine/workflows/common";
import { financeContext } from "@/lib/engine/workflows/finance";
import { ASSUMPTION_KEYS, ASSUMPTION_META, type AssumptionKey } from "./model";

const KeyZ = z.enum(ASSUMPTION_KEYS as unknown as [AssumptionKey, ...AssumptionKey[]]);
const ModelZ = z.object({
  summary: z.string().describe("What this question really hinges on, in two sentences"),
  model_fit: z.string().describe("How the cash-flow and time model maps onto the question, and what it cannot capture"),
  assumptions: z.array(z.object({ key: KeyZ, value: z.number(), basis: z.enum(["estimate", "sourced"]), note: z.string().describe("Why this value"), source_url: z.string().nullable(), low: z.number(), high: z.number() })).describe("Base-case values for every model input"),
  paths: z.array(z.object({
    name: z.enum(["conservative", "base", "optimistic", "alternative"]),
    title: z.string(), narrative: z.string(),
    overrides: z.array(z.object({ key: KeyZ, value: z.number() })).describe("Only the inputs that differ from the base case"),
    milestones: z.array(z.string()), risks: z.array(z.string()), dependencies: z.array(z.string()),
  })).describe("Exactly four: conservative, base, optimistic and an alternative strategy"),
  qualitative: z.array(z.object({ dimension: z.string(), conservative: z.number(), base: z.number(), optimistic: z.number(), alternative: z.number(), note: z.string() })).describe("Non-financial outcomes scored 1-10 (judgement), e.g. reputation, learning, career optionality, wellbeing"),
  capabilities: z.array(z.string()).describe("Capabilities Sean would need"),
  market: z.string().describe("Relevant market conditions, sourced where possible"),
  sources: z.array(SourceZ),
});

registerWorkflow({
  kind: "scenario",
  title: "Future Engine",
  agent: "futurist",
  async run(ctx) {
    const db = getDb();
    let sc = ctx.task.params.scenario_id ? await db.get("scenarios", String(ctx.task.params.scenario_id)) : null;
    if (!sc) {
      sc = { id: newId("scn"), question: ctx.task.instruction.slice(0, 500), summary: "", model_fit: "", assumptions: [], paths: [], qualitative: [], capabilities: [], market: "", sources: [], decision_id: (ctx.task.params.decision_id as string) ?? null, status: "modelling", task_id: ctx.task.id, created_at: nowIso(), updated_at: nowIso() } satisfies Scenario;
      await db.insert("scenarios", sc);
      await db.update("tasks", ctx.task.id, { params: { ...ctx.task.params, scenario_id: sc.id } });
    }
    const p = await getProfile();
    const fin = await financeContext();
    const v = new SourceVerifier();
    const r = await ctx.step("futurist", "Building the scenario model", async () => {
      const res = await callAgent({
        agent: "futurist", taskId: ctx.task.id, webSearch: true, schema: ModelZ, effort: "high",
        prompt: `Sean asks: "${sc!.question}"\nModel the plausible futures. Fill every input of this monthly model (GBP):\n${ASSUMPTION_KEYS.map((k) => `- ${k}: ${ASSUMPTION_META[k].label} (${ASSUMPTION_META[k].unit}). ${ASSUMPTION_META[k].help}`).join("\n")}\nFor questions that aren't a business (a move, a career change), use the inputs for the financial side (e.g. price × customers = freelance income, other_monthly_income = salary change, monthly_cost = living-cost change) and put the rest in qualitative dimensions. Explain the fit honestly.\nGive low/high bounds you'd consider plausible for each input. Mark an input "sourced" only with a URL you found. These are scenarios, not predictions.\n\nAbout Sean: ${p.bio}\nHis finances: ${fin.hasData ? fin.text.split("\n").slice(0, 8).join(" ") : "not recorded (assume he has a full-time job)"}\n${SEARCH_RULE}`,
      });
      return { ...res.data, found: res.sources };
    });
    v.add(r.found);
    const assumptions = r.assumptions.map((a) => ({ ...a, basis: a.basis === "sourced" && v.has(a.source_url) ? ("sourced" as const) : ("estimate" as const), source_url: a.basis === "sourced" && v.has(a.source_url) ? a.source_url : null, low: Math.min(a.low, a.value), high: Math.max(a.high, a.value) }));
    const order = ["conservative", "base", "optimistic", "alternative"];
    const paths = [...r.paths].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name)).map((x) => ({ ...x, overrides: Object.fromEntries(x.overrides.map((o) => [o.key, o.value])) }));
    const sources = toSources(v.filter(r.sources));
    await db.update("scenarios", sc.id, { summary: r.summary, model_fit: r.model_fit, assumptions, paths, qualitative: r.qualitative, capabilities: r.capabilities, market: r.market, sources, status: "ready", updated_at: nowIso() });
    if (sc.decision_id) await db.update("decisions", sc.decision_id, { scenario_id: sc.id, updated_at: nowIso() });
    ctx.cite(sources);
    ctx.deliver({ type: "scenario", id: sc.id, title: sc.question.slice(0, 80) });
    return { summary: `${r.summary} Four paths modelled; ${assumptions.filter((a) => a.basis === "sourced").length} of ${assumptions.length} inputs are sourced, the rest are labelled estimates.` };
  },
});
