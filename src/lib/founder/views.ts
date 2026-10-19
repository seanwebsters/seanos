import "server-only";
import { getDb } from "@/lib/db";
import type { FinModel, Venture, VentureDoc } from "@/lib/db/types";
import { addDays, londonDate } from "@/lib/time";
import { STREAMS, runModel, type StreamKey } from "./finmodel";
import { portfolioSignals } from "./core";

export const FOUNDER_KINDS = ["venture_build", "cfo_model", "investor_research", "fundraising_plan", "founder_briefing", "venture_review", "commercial_analysis", "copilot", "growth_plan", "growth_review"];

export const STAGE_GROUPS: Record<string, { label: string; stages: Venture["stage"][] }> = {
  all: { label: "All", stages: ["concept", "researching", "validating", "building", "launched", "paused"] },
  building: { label: "Actively building", stages: ["validating", "building"] },
  live: { label: "Live", stages: ["launched"] },
  research: { label: "Research", stages: ["researching"] },
  concept: { label: "Concepts", stages: ["concept"] },
};

/** How far through the build a venture is, from what actually exists. */
export function progressOf(v: Venture, docs: VentureDoc[], m: FinModel | undefined, tasks: { status: string }[]) {
  const has = (k: string) => docs.some((d) => d.venture_id === v.id && d.kind === k);
  const steps = [Boolean(v.thesis), has("strategy"), Boolean(m && m.version > 0), has("funding_plan"), has("readiness"), has("plan_90"), has("legal")];
  const base = steps.filter(Boolean).length / steps.length;
  const t = tasks.length ? tasks.filter((x) => x.status === "done").length / tasks.length : 0;
  return Math.round((base * 0.7 + t * 0.3) * 100);
}

export function nextLabel(v: Venture, docs: VentureDoc[], m: FinModel | undefined) {
  const has = (k: string) => docs.some((d) => d.venture_id === v.id && d.kind === k);
  if (v.status === "running" || v.status === "researching") return "Agents working";
  if (!has("strategy")) return "Build the business";
  if (!m || m.version === 0) return "Build the model";
  if (!has("funding_plan")) return "Plan funding";
  return v.stage.charAt(0).toUpperCase() + v.stage.slice(1);
}

export async function dashboardData(opts: { filter: string; finVenture: string | null }) {
  const db = getDb();
  const today = londonDate();
  const sig = await portfolioSignals();
  const ventures = (await db.list("ventures")).filter((v) => v.stage !== "archived" && !v.merged_into).sort((a, b) => b.priority - a.priority);
  const docs = await db.list("venture_docs");
  const models = await db.list("fin_models");
  const vtasks = await db.list("venture_tasks");
  const pipeline = await db.list("investor_pipeline");
  const investors = new Map((await db.list("investors")).map((i) => [i.id, i]));
  const tasks = (await db.list("tasks", { orderBy: { column: "updated_at", ascending: false }, limit: 200 })).filter((t) => FOUNDER_KINDS.includes(t.kind));
  const events = (await db.list("events")).filter((e) => e.start.slice(0, 10) >= today && e.start.slice(0, 10) <= addDays(today, 7));
  const partnerships = (await db.list("partnerships")).filter((p) => p.status !== "passed").slice(0, 6);
  const briefing = docs.find((d) => d.venture_id === "portfolio" && d.kind === "briefing") ?? null;
  const ranking = docs.find((d) => d.venture_id === "portfolio" && d.kind === "ranking") ?? null;
  const modelOf = (id: string) => models.find((m) => m.venture_id === id && m.version > 0);

  const group = STAGE_GROUPS[opts.filter] ?? STAGE_GROUPS.all;
  const counts = Object.fromEntries(Object.entries(STAGE_GROUPS).map(([k, g]) => [k, ventures.filter((v) => g.stages.includes(v.stage)).length]));
  const cards = ventures.filter((v) => group.stages.includes(v.stage)).map((v) => {
    const vt = vtasks.filter((t) => t.venture_id === v.id);
    return { v, progress: progressOf(v, docs, modelOf(v.id), vt), next: nextLabel(v, docs, modelOf(v.id)) };
  }).sort((a, b) => b.progress - a.progress || b.v.priority - a.v.priority);

  // Forecasts by quarter, by stream, for one venture or all modelled ventures (GBP only; USD models are converted at their dated rate).
  const modelled = ventures.filter((v) => modelOf(v.id));
  const finScope = opts.finVenture ? modelled.filter((v) => v.id === opts.finVenture) : modelled;
  const byQuarter = Array.from({ length: 12 }, (_, q) => {
    const out = Object.fromEntries(Object.keys(STREAMS).map((s) => [s, 0])) as Record<StreamKey, number>;
    for (const v of finScope) {
      const m = modelOf(v.id)!;
      const rate = m.currency === "USD" ? 1 / m.fx.gbp_usd : 1;
      for (const r of runModel(m).months.slice(q * 3, q * 3 + 3)) for (const s of Object.keys(out) as StreamKey[]) out[s] += r.revenue[s] * rate;
    }
    return out;
  });
  const y1 = modelled.reduce((s, v) => { const m = modelOf(v.id)!; return s + runModel(m).kpis.revenue_y1 * (m.currency === "USD" ? 1 / m.fx.gbp_usd : 1); }, 0);

  // Cash: only real figures Sean entered as actuals.
  const actualCash = sig.rows.filter((r) => r.model?.actualCash !== null && r.model?.actualCash !== undefined);
  const cash = actualCash.length ? actualCash.reduce((s, r) => s + (r.model!.actualCash ?? 0), 0) : null;

  // Fundraising focus: the most important venture that has a funding plan.
  const focus = ventures.find((v) => docs.some((d) => d.venture_id === v.id && d.kind === "funding_plan")) ?? null;
  const fundraising = focus ? (() => {
    const d = (k: string) => docs.find((x) => x.venture_id === focus.id && x.kind === k);
    const plan = d("funding_plan")!;
    const round = (plan.data as { round?: { target: number; currency: "GBP" | "USD"; instrument: string } }).round ?? null;
    const p = pipeline.filter((x) => x.venture_id === focus.id);
    const contacted = p.filter((x) => !["researching", "shortlisted"].includes(x.stage)).length;
    const meetings = p.filter((x) => ["meeting", "diligence", "term_sheet", "committed"].includes(x.stage)).length;
    const pct = (doc?: VentureDoc) => (doc?.checklist.length ? doc.checklist.filter((c) => c.status === "done").length / Math.max(1, doc.checklist.filter((c) => c.status !== "na").length) : 0);
    const readiness = pct(d("readiness"));
    const items = [
      { label: "Pitch deck", value: d("deck") ? (d("deck")!.status === "final" ? "final" : `draft v${d("deck")!.version}`) : "not started", done: d("deck")?.status === "final" },
      { label: "Financial model", value: modelOf(focus.id) ? `v${modelOf(focus.id)!.version}` : "not started", done: Boolean(modelOf(focus.id)) },
      { label: "Investor shortlist", value: `${p.length} researched`, done: p.length >= 10 },
      { label: "Outreach", value: `${contacted}/${p.length || 0} contacted`, done: p.length > 0 && contacted >= Math.min(10, p.length) },
      { label: "Meetings", value: `${meetings} logged`, done: meetings >= 3 },
      { label: "Data room", value: `${Math.round(pct(d("data_room")) * 100)}% ready`, done: pct(d("data_room")) >= 1 },
    ];
    return { venture: focus, round, readiness, items };
  })() : null;

  const upcoming = vtasks.filter((t) => t.status !== "done" && t.due && t.due <= addDays(today, 7)).sort((a, b) => (a.due ?? "").localeCompare(b.due ?? "")).slice(0, 8);
  const overdue = vtasks.filter((t) => t.status !== "done" && t.due && t.due < today).length;
  const opportunities = pipeline.filter((p) => p.stage !== "passed").sort((a, b) => b.fit_score - a.fit_score).slice(0, 6).map((p) => ({ p, inv: investors.get(p.investor_id)!, venture: ventures.find((v) => v.id === p.venture_id) })).filter((x) => x.inv);
  const deliverables = docs.filter((d) => d.venture_id !== "portfolio" && ["deck", "funding_requirements", "strategy", "plan_90"].includes(d.kind)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 3);

  return {
    today, sig, ventures, cards, counts, briefing, ranking, modelled, byQuarter, y1, cash, fundraising, upcoming, overdue, opportunities, deliverables,
    activity: tasks.slice(0, 6), runningAgents: tasks.filter((t) => t.status === "running").length, queued: tasks.filter((t) => t.status === "queued").length,
    events, partnerships, investorsCount: pipeline.filter((p) => p.stage !== "passed").length,
    ventureName: (id: string) => ventures.find((v) => v.id === id)?.name ?? "",
  };
}
