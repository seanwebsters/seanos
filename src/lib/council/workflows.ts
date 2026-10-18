import "server-only";
import * as z from "zod/v4";
import { getDb } from "@/lib/db";
import type { CouncilView, Decision, Lens } from "@/lib/db/types";
import { callAgent } from "@/lib/ai/llm";
import { getProfile } from "@/lib/bootstrap";
import { newId, nowIso } from "@/lib/util";
import { registerWorkflow, type RunContext } from "@/lib/engine/jobs";
import { SEARCH_RULE, SourceVerifier, SourceZ, mapLimit } from "@/lib/engine/workflows/common";
import { financeContext } from "@/lib/engine/workflows/finance";
import { loadWorld, neighbourhood } from "@/lib/graph/query";
import { searchNodes } from "@/lib/graph/search";
import { simulate } from "@/lib/future/model";

export const LENSES: { key: Lens; name: string; brief: string }[] = [
  { key: "visionary", name: "The Visionary", brief: "Explore the most ambitious version of this and unconventional approaches. What could this become if it works? What bolder or stranger option is being missed?" },
  { key: "investor", name: "The Investor", brief: "Examine commercial viability: market size, willingness to pay, capital required, time to returns, comparable outcomes. Separate evidence from estimates." },
  { key: "operator", name: "The Operator", brief: "Evaluate execution: complexity, timeline, dependencies, the hours Sean actually has, what has to go right in what order." },
  { key: "creative", name: "The Creative Director", brief: "Evaluate originality, taste, positioning and cultural relevance. Is this distinctive, or one of many? Does it fit the work Sean wants to be known for?" },
  { key: "researcher", name: "The Researcher", brief: "Check the evidence and assumptions. What is actually known, what is assumed, and what competing explanations exist? Flag claims with no support." },
  { key: "sceptic", name: "The Sceptic", brief: "Challenge weak arguments, optimistic assumptions and hidden risks. What is the most likely way this fails? What is being glossed over?" },
  { key: "strategist", name: "The Personal Strategist", brief: "Judge fit with Sean's goals, circumstances, appetite for risk and past decisions. Does this move him towards where he wants to be, or distract from it?" },
];

const FrameZ = z.object({
  options: z.array(z.string()).describe("2-4 real options, including the status quo or 'not now' where relevant"),
  unknowns: z.array(z.object({ question: z.string(), finding: z.string().describe("What research found; say 'unclear' if it stays unknown"), sources: z.array(SourceZ) })).describe("The 3 most decision-relevant unknowns, researched"),
  evidence: z.array(z.object({ claim: z.string(), source_url: z.string().nullable() })),
});

const ViewZ = z.object({
  stance: z.enum(["support", "oppose", "conditional"]),
  score: z.number().describe("1-10 from this lens"),
  summary: z.string().describe("Two sentences"),
  points: z.array(z.string()).describe("The key arguments, specific"),
  risks: z.array(z.string()),
  assumptions: z.array(z.string()).describe("Assumptions this view depends on"),
  questions: z.array(z.string()).describe("What this lens would need answered"),
  preferred_option: z.string().nullable(),
});

const SynthesisZ = z.object({
  disagreements: z.array(z.object({ topic: z.string(), positions: z.array(z.string()) })),
  tradeoffs: z.array(z.string()),
  recommendation: z.object({ option: z.string(), confidence: z.number().describe("0-1"), rationale: z.string() }),
  would_change: z.array(z.string()).describe("Specific evidence or events that would change the recommendation"),
  next_steps: z.array(z.object({ label: z.string(), instruction: z.string() })).describe("1-3 actions the team can take to reduce the biggest uncertainty"),
});

async function personalContext() {
  const db = getDb();
  const p = await getProfile();
  const ambitions = (await db.list("ambitions", { where: { status: ["active", "proposed"] } })).map((a) => `- ${a.statement} (${a.horizon})`);
  const decisions = (await db.list("memories", { where: { kind: ["decision", "preference", "feedback"] } })).slice(0, 25).map((m) => `- ${m.content}`);
  const fin = await financeContext();
  return `About Sean: ${p.bio}\nAmbitions:\n${ambitions.join("\n") || "- none set"}\nPreferences, feedback and past decisions:\n${decisions.join("\n") || "- none recorded"}\nFinances: ${fin.hasData ? fin.text.split("\n").slice(0, 8).join(" ") : "not recorded"}`;
}

export async function deliberate(ctx: RunContext, d: Decision) {
  const db = getDb();
  const verifier = new SourceVerifier();
  const frame = await ctx.step("council", "Framing the decision and researching the unknowns", async () => {
    const r = await callAgent({ agent: "council", taskId: ctx.task.id, webSearch: true, schema: FrameZ, prompt: `Sean is deciding: "${d.question}"\n${d.context ? `Context: ${d.context}\n` : ""}${d.options.length ? `Options he's considering: ${d.options.join(" | ")}\n` : ""}Frame the real options and research the three unknowns that most affect the decision. ${SEARCH_RULE}` });
    return { ...r.data, found: r.sources };
  });
  verifier.add(frame.found);
  const options = d.options.length ? d.options : frame.options;
  const unknowns = frame.unknowns.map((u) => ({ question: u.question, finding: `${u.finding}${verifier.filter(u.sources).length ? "" : " (unsourced)"}` }));
  const evidence = frame.evidence.map((e) => ({ claim: e.claim, source_url: e.source_url && verifier.has(e.source_url) ? e.source_url : null, kind: (e.source_url && verifier.has(e.source_url) ? "sourced" : "record") as "sourced" | "record" }));
  await ctx.progress(0.2);

  const w = await loadWorld();
  const seeds = (await searchNodes([...w.nodes.values()], d.question, 4)).map((n) => n.id);
  const graphLines = seeds.flatMap((s) => neighbourhood(w, s, 1, 12).edges.slice(0, 12).map((e) => `${w.nodes.get(e.from)?.name} —${e.label}→ ${w.nodes.get(e.to)?.name}`));
  const scenario = d.scenario_id ? await db.get("scenarios", d.scenario_id) : null;
  const scenarioText = scenario ? scenario.paths.map((p) => {
    const base = Object.fromEntries(scenario.assumptions.map((a) => [a.key, a.value]));
    const o = simulate({ ...base, ...p.overrides });
    return `${p.name}: ${p.title}. Net after opportunity cost £${Math.round(o.net_after_opportunity)}, revenue at horizon £${Math.round(o.mrr_end)}/mo, break-even ${o.break_even_month ? `month ${o.break_even_month}` : "not within horizon"}.`;
  }).join("\n") : "";
  const brief = `Decision: "${d.question}"\nOptions: ${options.join(" | ")}\n${d.context ? `Context: ${d.context}\n` : ""}\nResearch on the unknowns:\n${unknowns.map((u) => `- ${u.question}: ${u.finding}`).join("\n")}\nEvidence:\n${evidence.map((e) => `- ${e.claim}${e.source_url ? ` (${e.source_url})` : " (unsourced)"}`).join("\n") || "- none"}\n${graphLines.length ? `From Sean's world model:\n${graphLines.join("\n")}\n` : ""}${scenarioText ? `Scenario model (estimates, not predictions):\n${scenarioText}\n` : ""}\n${await personalContext()}`;

  // Each lens works independently: none sees another's view.
  const views = await mapLimit(LENSES, 3, (lens) =>
    ctx.step("council", `Council: ${lens.name}`, async () => {
      const r = await callAgent({ agent: "council", taskId: ctx.task.id, effort: "medium", schema: ViewZ, prompt: `Your lens: ${lens.name}. ${lens.brief}\nGive your independent, structured critique. Use only the material below; say when something is unknown.\n\n${brief}` });
      return { lens: lens.key, ...r.data, score: Math.max(1, Math.min(10, Math.round(r.data.score))) } as CouncilView;
    }),
  );
  await ctx.progress(0.8);
  const scores = views.map((v) => v.score);
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const spread = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length);
  const synth = await ctx.step("council", "Synthesising a recommendation", async () =>
    (await callAgent({
      agent: "council", taskId: ctx.task.id, effort: "high", schema: SynthesisZ,
      prompt: `Synthesise the council's independent views into a recommendation for Sean. Name the real disagreements (score spread is ${spread.toFixed(1)}), the trade-offs, and exactly what evidence would change your recommendation. Don't average the views; weigh them by the strength of their evidence.\nOptions: ${options.join(" | ")}\n\n${views.map((v) => `${LENSES.find((l) => l.key === v.lens)!.name} [${v.stance}, ${v.score}/10, prefers ${v.preferred_option ?? "n/a"}]: ${v.summary}\nPoints: ${v.points.join("; ")}\nRisks: ${v.risks.join("; ")}\nAssumes: ${v.assumptions.join("; ")}`).join("\n\n")}`,
    })).data,
  );
  const updated = await db.update("decisions", d.id, {
    options, unknowns, evidence, views, disagreements: synth.disagreements, tradeoffs: synth.tradeoffs,
    recommendation: { ...synth.recommendation, confidence: Math.max(0, Math.min(1, synth.recommendation.confidence)) },
    would_change: synth.would_change, next_steps: synth.next_steps, status: "ready", updated_at: nowIso(),
  });
  ctx.cite(frame.unknowns.flatMap((u) => verifier.filter(u.sources).map((s) => ({ title: s.title, url: s.url, publisher: s.publisher, date: s.date }))));
  ctx.deliver({ type: "decision", id: d.id, title: d.question.slice(0, 80) });
  return updated;
}

export async function createDecision(question: string, extra: Partial<Decision> = {}) {
  const row: Decision = {
    id: newId("dec"), question: question.slice(0, 500), context: "", options: [], status: "deliberating", evidence: [], unknowns: [], views: [], disagreements: [], tradeoffs: [],
    recommendation: null, would_change: [], next_steps: [], scenario_id: null, decided_option: null, decision_note: "", context_ref: null, task_id: null, created_at: nowIso(), updated_at: nowIso(), ...extra,
  };
  await getDb().insert("decisions", row);
  return row;
}

registerWorkflow({
  kind: "council",
  title: "Intelligence Council",
  agent: "council",
  async run(ctx) {
    const db = getDb();
    let d = ctx.task.params.decision_id ? await db.get("decisions", String(ctx.task.params.decision_id)) : null;
    if (!d) {
      d = await createDecision(ctx.task.instruction, { context_ref: ctx.task.context_ref, task_id: ctx.task.id });
      await db.update("tasks", ctx.task.id, { params: { ...ctx.task.params, decision_id: d.id } });
    }
    const done = await deliberate(ctx, d);
    const rec = done.recommendation;
    return { summary: rec ? `Council recommends: ${rec.option} (${Math.round(rec.confidence * 100)}% confidence). ${rec.rationale.slice(0, 220)}` : "The council couldn't reach a recommendation." };
  },
});
