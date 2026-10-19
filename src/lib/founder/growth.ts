import "server-only";
import * as z from "zod/v4";
import { getDb } from "@/lib/db";
import type { Experiment, GrowthMetricKey, Venture } from "@/lib/db/types";
import { callAgent } from "@/lib/ai/llm";
import { HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { newId, nowIso } from "@/lib/util";
import { londonDate } from "@/lib/time";
import { registerWorkflow, type RunContext } from "@/lib/engine/jobs";
import { notify } from "@/lib/services/notify";
import { SEARCH_RULE, SourceVerifier, SourceZ, toSources } from "@/lib/engine/workflows/common";
import { METRICS, METRIC_KEYS, addDaysIso, committedThisMonth, fmt, scoreExperiment, windowValue } from "./growth-core";
import { upsertDoc } from "./core";
import { founderContext } from "./workflows";

const metricEnum = METRIC_KEYS as [GrowthMetricKey, ...GrowthMetricKey[]];

/** What the team knows from real numbers: last 28 days against the 28 before, and past experiment results. */
export async function growthEvidence(ventureId: string) {
  const db = getDb();
  const today = londonDate();
  const rows = await db.list("growth_metrics", { where: { venture_id: ventureId } });
  const exps = await db.list("experiments", { where: { venture_id: ventureId } });
  const cur = [addDaysIso(today, -27), today] as const, prev = [addDaysIso(today, -55), addDaysIso(today, -28)] as const;
  const lines = METRIC_KEYS.map((k) => {
    const a = windowValue(rows, k, ...cur), b = windowValue(rows, k, ...prev);
    return a === null && b === null ? null : `${METRICS[k].label}: ${a === null ? "no data" : fmt(a, k)} in the last 28 days${b !== null ? ` (previous 28: ${fmt(b, k)})` : ""}`;
  }).filter(Boolean);
  const history = exps.filter((e) => e.result).map((e) => `- ${e.title} [${e.channel}]: ${e.result!.verdict}. ${e.result!.note}`);
  return { rows, exps, today, text: `${lines.length ? lines.join("\n") : "No metrics recorded yet. Treat everything as unvalidated."}${history.length ? `\nPast experiments:\n${history.join("\n")}` : ""}` };
}

export function capLeft(v: Venture, exps: Experiment[], today = londonDate()) {
  const cap = v.growth_cap ?? 0;
  return { cap, committed: committedThisMonth(exps, today.slice(0, 7)), left: Math.max(0, cap - committedThisMonth(exps, today.slice(0, 7))) };
}

/* ------------------------------ Growth plan ------------------------------ */

const GrowthZ = z.object({
  positioning: z.string().describe("One sentence: for whom, what, and why it beats the alternative"),
  icp: z.string().describe("The specific first users to win, and where they already gather"),
  channels: z.array(z.object({ channel: z.string(), why: z.string(), effort: z.enum(["low", "medium", "high"]), cost: z.string() })).describe("Ranked; 3-5 channels"),
  launch_plan: z.array(z.object({ days: z.string().describe("e.g. 'Days 1-3'"), actions: z.array(z.string()) })).describe("A two-week plan Sean can run alongside a full-time job"),
  experiments: z.array(z.object({
    title: z.string(), hypothesis: z.string(), channel: z.string(),
    steps: z.array(z.string()).describe("What Sean does, concretely"),
    budget: z.number().describe("GBP; 0 for free experiments"),
    metric: z.enum(metricEnum), target: z.number().describe("Total over the experiment window (or the level for active/paying users)"), duration_days: z.number(),
    assets: z.array(z.object({ kind: z.enum(["post", "ad", "aso", "email", "pitch", "landing", "script"]), title: z.string(), body: z.string() })).describe("Ready-to-use drafts for this experiment"),
  })).describe("3-5 experiments, cheapest and fastest first"),
  aso: z.object({ title: z.string(), subtitle: z.string(), keywords: z.string(), description: z.string() }).nullable().describe("App store listing if this is an app, else null"),
  tracking: z.array(z.string()).describe("Which numbers Sean should record and where they come from"),
  sources: z.array(SourceZ),
});

export async function planGrowth(ctx: RunContext, v: Venture) {
  const db = getDb();
  const ev = await growthEvidence(v.id);
  const cap = capLeft(v, ev.exps, ev.today);
  const strategy = (await db.list("venture_docs", { where: { venture_id: v.id, kind: "strategy" } }))[0];
  const r = await ctx.step("growth", `Growth plan for ${v.name}`, async () => {
    const res = await callAgent({
      agent: "growth", taskId: ctx.task.id, webSearch: true, schema: GrowthZ, effort: "high",
      prompt: `Sean wants ${v.name} to start making money. Design how to get its first real users and revenue, cheaply and quickly, as a solo founder with a full-time job.
Research comparable products and channels that work for them now. Then give positioning, the first users to win, ranked channels, a two-week launch plan and 3-5 experiments with concrete steps, a budget, ONE metric from the list, a target and a duration. Write the drafts each experiment needs (posts, ad copy, store listing, pitch emails).
Spend: Sean's monthly growth cap is £${cap.cap} with £${cap.left} left this month. Free experiments first; never propose more paid spend than is left.
Rules: drafts only, for Sean to publish himself. No fake reviews, bought followers, spam, fake accounts or anything against a platform's rules. Don't invent traction or testimonials.
${ctx.task.instruction && ctx.task.instruction !== ctx.task.title ? `Sean says: ${ctx.task.instruction}\n` : ""}
${await founderContext(v)}
${strategy ? `Strategy:\n${strategy.body.slice(0, 4000)}\n` : ""}Real numbers so far:\n${ev.text}\n${SEARCH_RULE}`,
    });
    return { ...res.data, found: res.sources };
  });
  const ver = new SourceVerifier();
  ver.add(r.found);
  const sources = toSources(ver.filter(r.sources));
  const body = `## Positioning\n${r.positioning}\n\n## First users\n${r.icp}\n\n## Channels\n${r.channels.map((c, i) => `${i + 1}. **${c.channel}** (${c.effort} effort, ${c.cost}): ${c.why}`).join("\n")}\n\n## Two-week launch plan\n${r.launch_plan.map((p) => `**${p.days}**\n${p.actions.map((a) => `- ${a}`).join("\n")}`).join("\n\n")}\n\n## What to track\n${r.tracking.map((t) => `- ${t}`).join("\n")}${r.aso ? `\n\n## Store listing (draft)\n**${r.aso.title}**: ${r.aso.subtitle}\n\nKeywords: ${r.aso.keywords}\n\n${r.aso.description}` : ""}\n\n*Drafts for you to review and publish. Results will only be judged on numbers you record.*`;
  await upsertDoc(v.id, "growth_plan", { title: `${v.name}: growth plan`, body, sources, basis: "estimate", data: { channels: r.channels, aso: r.aso } }, "growth", ctx.task.id);
  // Replace earlier proposals that were never approved.
  for (const old of ev.exps.filter((e) => e.status === "proposed")) {
    await db.update("experiments", old.id, { status: "rejected", updated_at: nowIso() });
    if (old.approval_id) await db.update("approvals", old.approval_id, { status: "rejected", decided_at: nowIso() });
  }
  let budgetLeft = cap.left;
  let created = 0;
  for (const x of r.experiments.slice(0, 5)) {
    const budget = Math.max(0, Math.round(x.budget));
    if (budget > budgetLeft) {
      await ctx.log(`Skipped "${x.title}": £${budget} is more than the £${budgetLeft} left under your growth cap.`, "growth", "warn");
      continue;
    }
    budgetLeft -= budget;
    const e: Experiment = {
      id: newId("exp"), venture_id: v.id, title: x.title, hypothesis: x.hypothesis, channel: x.channel, steps: x.steps, assets: x.assets, budget, metric: x.metric,
      baseline: windowValue(ev.rows, x.metric, addDaysIso(ev.today, -Math.max(1, Math.round(x.duration_days)) + 1), ev.today),
      target: Math.max(0, x.target), duration_days: Math.min(60, Math.max(3, Math.round(x.duration_days))), status: "proposed", started_at: null, ends_at: null, spent: 0, result: null,
      approval_id: null, agent: "growth", task_id: ctx.task.id, created_at: nowIso(), updated_at: nowIso(),
    };
    await db.insert("experiments", e);
    await ctx.needsApproval({ type: "experiment", ref_id: e.id, title: `${v.name}: ${e.title}`, summary: `${e.channel} · ${budget ? `£${budget}` : "free"} · ${e.duration_days} days · target ${fmt(e.target, e.metric)} ${METRICS[e.metric].label.toLowerCase()}`, agent: "growth" });
    const a = (await db.list("approvals", { where: { ref_id: e.id } }))[0];
    if (a) await db.update("experiments", e.id, { approval_id: a.id });
    created++;
  }
  ctx.cite(sources);
  ctx.deliver({ type: "venture", id: v.id, title: v.name });
  return { created, positioning: r.positioning };
}

/** Approving an experiment starts it; paid ones must fit under the venture's cap. */
export async function decideExperiment(id: string, decision: "approved" | "rejected") {
  const db = getDb();
  const e = await db.get("experiments", id);
  if (!e) throw new HttpError(404, "Experiment not found");
  if (e.status !== "proposed") return e;
  if (decision === "rejected") return db.update("experiments", id, { status: "rejected", updated_at: nowIso() });
  const v = (await db.get("ventures", e.venture_id))!;
  const cap = capLeft(v, await db.list("experiments", { where: { venture_id: v.id } }));
  if (e.budget > cap.left) throw new HttpError(409, cap.cap === 0 ? `This experiment costs £${e.budget}. Set a monthly growth cap for ${v.name} first.` : `£${e.budget} is more than the £${cap.left} left of your £${cap.cap} cap this month.`);
  const today = londonDate();
  await audit("sean", "experiment.start", `experiment:${id}`, `${e.title} (£${e.budget})`);
  return db.update("experiments", id, { status: "running", started_at: today, ends_at: addDaysIso(today, e.duration_days - 1), updated_at: nowIso() });
}

/* ------------------------------ Review ------------------------------ */

export async function reviewGrowth(ctx: RunContext, v: Venture) {
  const db = getDb();
  const ev = await growthEvidence(v.id);
  const closed: Experiment[] = [];
  for (const e of ev.exps.filter((x) => x.status === "running")) {
    const result = scoreExperiment(e, ev.rows, ev.today);
    const finished = e.ends_at! < ev.today;
    await db.update("experiments", e.id, { result, status: finished ? "done" : "running", updated_at: nowIso() });
    if (finished) closed.push({ ...e, result, status: "done" });
  }
  const running = (await db.list("experiments", { where: { venture_id: v.id } })).filter((e) => e.status === "running" || closed.some((c) => c.id === e.id));
  if (!running.length && !ev.rows.length) return { summary: `${v.name}: nothing to review yet. Record some numbers or start an experiment.` };
  const r = await ctx.step("growth", `Growth review for ${v.name}`, async () => (await callAgent({
    agent: "growth", taskId: ctx.task.id, effort: "medium",
    schema: z.object({ title: z.string(), body: z.string().describe("Markdown: What the numbers say, Experiments (keep / kill / scale, using the verdicts given), What to try next, What to record"), next: z.array(z.string()).describe("Up to 3 next experiments to propose, one line each") }),
    prompt: `Weekly growth review for ${v.name}. Verdicts below were computed from Sean's recorded numbers; don't change them, and don't claim results that aren't shown. If data is missing, say what to record.\nNumbers:\n${ev.text}\nExperiments:\n${running.map((e) => { const res = closed.find((c) => c.id === e.id)?.result ?? e.result; return `- ${e.title} [${e.channel}, £${e.budget} budget, £${e.spent} spent, ${e.started_at}→${e.ends_at}]: ${res ? `${res.verdict}. ${res.note}` : "not scored yet"}`; }).join("\n") || "none running"}`,
  })).data);
  await upsertDoc(v.id, "growth_review", { title: r.title, body: `${r.body}${r.next.length ? `\n\n## Ideas for next round\n${r.next.map((n) => `- ${n}`).join("\n")}` : ""}`, basis: "verified", data: { closed: closed.map((c) => ({ id: c.id, verdict: c.result?.verdict })) } }, "growth", ctx.task.id);
  for (const c of closed) await notify({ title: `${v.name}: "${c.title}" finished`, body: `${c.result!.verdict === "win" ? "Hit its target" : c.result!.verdict === "no_data" ? "No numbers recorded" : c.result!.verdict === "loss" ? "Missed its target" : "Close to target"}. ${c.result!.note}`, href: `/founder/v/${v.id}?tab=growth`, importance: 2 });
  return { summary: `${v.name}: ${closed.length} experiment${closed.length === 1 ? "" : "s"} closed, ${running.length - closed.length} still running. ${r.title}` };
}

registerWorkflow({
  kind: "growth_plan",
  title: "Growth plan",
  agent: "growth",
  async run(ctx) {
    const v = await getDb().get("ventures", String(ctx.task.params.venture_id ?? ""));
    if (!v) throw new Error("Venture not found.");
    const out = await planGrowth(ctx, v);
    return { summary: `${v.name}: ${out.positioning} ${out.created} experiment${out.created === 1 ? "" : "s"} waiting for your approval.`, awaitingApproval: out.created > 0 };
  },
});

registerWorkflow({
  kind: "growth_review",
  title: "Growth results",
  agent: "growth",
  async run(ctx) {
    const db = getDb();
    const id = ctx.task.params.venture_id ? String(ctx.task.params.venture_id) : null;
    const running = new Set((await db.list("experiments", { where: { status: "running" } })).map((e) => e.venture_id));
    const active = id ? ([await db.get("ventures", id)].filter(Boolean) as Venture[]) : (await db.list("ventures")).filter((v) => running.has(v.id));
    if (!active.length) return { summary: "No growth experiments running." };
    const out: string[] = [];
    for (const v of active) out.push((await reviewGrowth(ctx, v)).summary);
    return { summary: out.join("\n") };
  },
});
