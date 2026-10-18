import "server-only";
import * as z from "zod/v4";
import { getDb } from "@/lib/db";
import type { Insight, StrategyItem } from "@/lib/db/types";
import { callAgent } from "@/lib/ai/llm";
import { AGENTS, type AgentKey } from "@/lib/ai/agents";
import { getProfile } from "@/lib/bootstrap";
import { newId, nowIso } from "@/lib/util";
import { addDays, londonDate } from "@/lib/time";
import { registerWorkflow } from "@/lib/engine/jobs";
import { syncGraph } from "@/lib/graph/workflows";
import { changesSince, convergences, describePath, ideaOverlaps, loadWorld, missingLinks, worldSummary } from "@/lib/graph/query";
import { financeContext } from "@/lib/engine/workflows/finance";
import { COUNTERS, progressOf } from "./core";

const counterKeys = ["manual", ...Object.keys(COUNTERS)] as [string, ...string[]];
const agentKeys = AGENTS.map((a) => a.key) as [AgentKey, ...AgentKey[]];

const MetricZ = z.object({ name: z.string(), target: z.number(), unit: z.string(), source: z.enum(counterKeys).describe("A built-in counter if one measures it exactly, else manual") });
const ActionZ = z.object({ title: z.string(), instruction: z.string().describe("A concrete instruction the team can carry out now (research, draft, plan, find, build)"), owner_agent: z.enum(agentKeys) });
const PlanZ = z.object({
  success: z.array(z.string()).describe("3-5 measurable statements of what success looks like at the horizon"),
  assumptions: z.array(z.string()),
  risks: z.array(z.string()),
  stop_doing: z.array(z.string()).describe("Things Sean should stop or deprioritise, grounded in the context"),
  strategies: z.array(z.object({
    title: z.string(), description: z.string(), rationale: z.string(),
    objectives: z.array(z.object({
      title: z.string(), description: z.string(), due: z.string().nullable().describe("YYYY-MM-DD"), metrics: z.array(MetricZ),
      initiatives: z.array(z.object({
        title: z.string(), description: z.string(),
        projects: z.array(z.object({ title: z.string(), description: z.string(), owner_agent: z.enum(agentKeys), actions: z.array(ActionZ) })),
      })),
    })),
  })).describe("2-3 strategies"),
});
const CritiqueZ = z.object({
  weak_assumptions: z.array(z.string()),
  missing: z.array(z.string()).describe("Important things the plan ignores"),
  overcomplicated: z.array(z.string()),
  verdict: z.string(),
});

async function context() {
  const db = getDb();
  const p = await getProfile();
  const memories = (await db.list("memories")).filter((m) => ["goal", "project", "decision", "preference", "fact"].includes(m.kind)).slice(0, 60).map((m) => `- ${m.category}: ${m.content}`);
  const w = await loadWorld();
  const fin = await financeContext();
  const ideas = (await db.list("ideas")).filter((i) => i.status !== "archived").slice(0, 20).map((i) => `${i.title} (${i.verdict ?? "unrated"})`);
  return `About Sean: ${p.bio}\nAmbitions on file: ${p.ambitions.join("; ")}\nVerified credentials: ${p.speaker.achievements.join("; ")}\nMemory:\n${memories.join("\n")}\nIdeas: ${ideas.join("; ") || "none"}\nFinances (for resources and runway): ${fin.hasData ? fin.text.split("\n").slice(0, 9).join(" ") : "not recorded"}\n\nWorld model:\n${worldSummary(w, 80)}`;
}

registerWorkflow({
  kind: "ambition_plan",
  title: "Build a strategy",
  agent: "strategist",
  async run(ctx) {
    const db = getDb();
    const a = await db.get("ambitions", String(ctx.task.params.ambition_id ?? ""));
    if (!a) throw new Error("Ambition not found.");
    await syncGraph(true);
    const ctxText = await context();
    const plan = await ctx.step("strategist", "Translating the ambition into a strategy", async () =>
      (await callAgent({
        agent: "strategist", taskId: ctx.task.id, effort: "high", schema: PlanZ, webSearch: Boolean(ctx.task.params.research ?? true), maxTokens: 32000,
        prompt: `Sean's ambition (${a.horizon}): "${a.statement}"\nWhy it matters to him: ${a.why || "not stated"}\n\nBuild a coherent, measurable strategy: Ambition → Strategies → Objectives (with measurable metrics and due dates) → Initiatives → Projects → first Actions. Ground it in his real resources, relationships and work below; use web search to check what credibility looks like in this field today.\nOptimise for meaningful outcomes, not activity. Prefer few, high-leverage objectives. Actions must be things the team can prepare now; anything external will need Sean's approval.\nToday is ${londonDate()}.\n\n${ctxText}`,
      })).data,
    );
    await ctx.progress(0.55);
    const critique = await ctx.step("strategist", "Challenging the plan (sceptic pass)", async () =>
      (await callAgent({
        agent: "strategist", taskId: ctx.task.id, effort: "medium", schema: CritiqueZ,
        prompt: `Act as a rigorous sceptic. Challenge this plan for Sean: weak or optimistic assumptions, important things it ignores, and where it's overcomplicated. Be specific and brief.\nAmbition: ${a.statement}\nPlan:\n${plan.strategies.map((s) => `* ${s.title}: ${s.objectives.map((o) => o.title).join("; ")}`).join("\n")}\nAssumptions: ${plan.assumptions.join("; ")}`,
      })).data,
    );
    const old = await db.list("strategy_items", { where: { ambition_id: a.id, status: "proposed" } });
    for (const o of old) await db.remove("strategy_items", o.id);
    let pos = 0;
    const add = async (level: StrategyItem["level"], parent: string | null, x: { title: string; description?: string; rationale?: string; metrics?: z.infer<typeof MetricZ>[]; due?: string | null; owner_agent?: AgentKey; instruction?: string }) => {
      const row: StrategyItem = {
        id: newId("si"), ambition_id: a.id, parent_id: parent, level, title: x.title, description: x.description ?? "", rationale: x.rationale ?? "",
        metrics: (x.metrics ?? []).map((m) => ({ ...m, current: 0 })), status: "proposed", owner_agent: x.owner_agent ?? "chief_of_staff", instruction: x.instruction ?? null,
        task_ids: [], evidence: [], due: x.due ?? null, position: pos++, created_at: nowIso(), updated_at: nowIso(),
      };
      await db.insert("strategy_items", row);
      return row.id;
    };
    for (const s of plan.strategies) {
      const sid = await add("strategy", null, s);
      for (const o of s.objectives) {
        const oid = await add("objective", sid, o);
        for (const i of o.initiatives) {
          const iid = await add("initiative", oid, i);
          for (const p of i.projects) {
            const pid = await add("project", iid, p);
            for (const act of p.actions) await add("action", pid, { title: act.title, instruction: act.instruction, owner_agent: act.owner_agent });
          }
        }
      }
    }
    await db.update("ambitions", a.id, {
      success: plan.success, status: "proposed", updated_at: nowIso(),
      assumptions: [...plan.assumptions, ...critique.weak_assumptions.map((x) => `Sceptic: ${x}`)],
      risks: [...plan.risks, ...critique.missing.map((x) => `Overlooked: ${x}`), ...critique.overcomplicated.map((x) => `Simplify: ${x}`), ...plan.stop_doing.map((x) => `Stop doing: ${x}`)],
    });
    await ctx.needsApproval({ type: "strategy", ref_id: a.id, title: `Strategy: ${a.statement.slice(0, 70)}`, summary: `${plan.strategies.length} strategies, ${plan.strategies.reduce((n, s) => n + s.objectives.length, 0)} objectives. ${critique.verdict}`, agent: "strategist" });
    ctx.deliver({ type: "ambition", id: a.id, title: a.statement.slice(0, 80) });
    return { summary: `Proposed ${plan.strategies.length} strategies for "${a.statement}". Sceptic: ${critique.verdict}`, awaitingApproval: true };
  },
});

const ReviewZ = z.object({
  progress: z.string().describe("What meaningful progress was made, specifically. Say so plainly if there was little."),
  blockers: z.array(z.string()),
  new_information: z.array(z.string()).describe("New information that changes the strategy, if any"),
  stop_doing: z.array(z.string()),
  highest_leverage: z.object({ title: z.string(), why: z.string(), instruction: z.string() }).nullable(),
  adjustments: z.array(z.string()),
});

registerWorkflow({
  kind: "strategy_review",
  title: "Weekly strategic review",
  agent: "chief_of_staff",
  async run(ctx) {
    const db = getDb();
    const ambitions = (await db.list("ambitions", { where: { status: "active" } })).filter((a) => !ctx.task.params.ambition_id || a.id === ctx.task.params.ambition_id);
    if (!ambitions.length) return { summary: "No active ambitions to review. Approve a strategy first." };
    await syncGraph(true);
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const changes = await changesSince(since);
    const out: string[] = [];
    for (const a of ambitions) {
      const items = await db.list("strategy_items", { where: { ambition_id: a.id } });
      const memo = new Map<string, number>();
      const lines: string[] = [];
      for (const it of items.filter((x) => x.level !== "action" && x.status !== "dropped")) {
        const tasks = (await Promise.all(it.task_ids.map((t) => db.get("tasks", t)))).filter(Boolean);
        lines.push(`${"  ".repeat(["strategy", "objective", "initiative", "project"].indexOf(it.level))}${it.level}: ${it.title} [${it.status}, ${Math.round((await progressOf(it, items, memo)) * 100)}%]${it.metrics.map((m) => ` ${m.name} ${m.current}/${m.target}${m.unit}`).join(",")}${tasks.length ? ` tasks: ${tasks.map((t) => `${t!.title} (${t!.status})`).join("; ")}` : ""}`);
      }
      const actions = items.filter((x) => x.level === "action");
      const doneThisWeek = (await Promise.all(actions.flatMap((x) => x.task_ids).map((t) => db.get("tasks", t)))).filter((t) => t && t.status === "completed" && (t.completed_at ?? "") >= since).map((t) => `${t!.title}: ${(t!.summary ?? "").slice(0, 160)}`);
      const r = await ctx.step("chief_of_staff", `Reviewing "${a.statement.slice(0, 50)}"`, async () =>
        (await callAgent({
          agent: "chief_of_staff", taskId: ctx.task.id, effort: "medium", schema: ReviewZ,
          prompt: `Weekly strategic review for Sean's ambition: "${a.statement}" (${a.horizon}).\nAnswer: What meaningful progress have we made? What is blocking us? What new information changes our strategy? What should we stop doing? What is the single highest-leverage action available now?\nDon't reward activity for its own sake. Be honest if progress was thin.\n\nStrategy tree:\n${lines.join("\n")}\n\nCompleted this week: ${doneThisWeek.join("\n") || "nothing linked to this strategy"}\nWorld model changes this week: ${changes.added.length} new entities (${changes.added.slice(0, 15).map((n) => n.name).join(", ")}), ${changes.edges.length} new relationships, ${changes.conflicts.length} contradictions.`,
        })).data,
      );
      const id = newId("rev");
      await db.insert("strategy_reviews", { id, ambition_id: a.id, date: londonDate(), progress: r.progress, blockers: r.blockers, new_information: r.new_information, stop_doing: r.stop_doing, highest_leverage: r.highest_leverage, adjustments: r.adjustments, task_id: ctx.task.id, created_at: nowIso() });
      if (r.highest_leverage) {
        await db.insert("insights", { id: newId("ins"), run_id: ctx.task.id, kind: "next_best_move", title: r.highest_leverage.title, insight: r.highest_leverage.why, recommendation: { label: r.highest_leverage.title, instruction: r.highest_leverage.instruction }, evidence: [{ id: `ambition:${a.id}`, label: a.statement.slice(0, 60), href: `/infinity/strategy/${a.id}` }], impact: 5, confidence: 0.7, status: "new", next_best_move: true, task_id: null, created_at: nowIso() });
      }
      out.push(`${a.statement.slice(0, 50)}: ${r.progress.slice(0, 160)}`);
    }
    return { summary: out.join("\n") };
  },
});

/* --------------------------- What am I missing? --------------------------- */

const MissingZ = z.object({
  findings: z.array(z.object({
    kind: z.enum(["opportunity", "risk", "weak_assumption", "contradiction", "attention", "collaborator", "possibility", "neglected", "connection", "overcomplication"]),
    title: z.string(),
    insight: z.string().describe("Plain, specific, 1-3 sentences"),
    evidence: z.array(z.string()).describe("Signal ids from the evidence pack that support this"),
    impact: z.number().describe("1-5"),
    confidence: z.number().describe("0-1"),
    recommendation: z.object({ label: z.string(), instruction: z.string() }),
  })).describe("Only findings important enough to interrupt Sean. Zero is a valid answer."),
  next_best_move: z.object({ title: z.string(), why: z.string(), instruction: z.string(), evidence: z.array(z.string()) }).nullable(),
});

export async function evidencePack() {
  const db = getDb();
  const today = londonDate();
  const w = await loadWorld();
  const pack: { id: string; text: string; label: string; href: string | null }[] = [];
  const nodeHref = (id: string) => `/infinity/node/${id}`;
  convergences(w, 6).forEach((c, i) => pack.push({ id: `conv${i + 1}`, label: c.node.name, href: nodeHref(c.node.id), text: `Convergence around ${c.node.name}: ${c.legs.map((l) => `${l.kind} via ${describePath(w, l.path, c.node.id)}`).join(" | ")}` }));
  ideaOverlaps(w, 5).forEach((o, i) => pack.push({ id: `overlap${i + 1}`, label: `${o.a.name} & ${o.b.name}`, href: nodeHref(o.a.id), text: `Ideas "${o.a.name}" and "${o.b.name}" share ${o.shared.map((s) => s.name).join(", ")}` }));
  missingLinks(w, 5).forEach((m, i) => pack.push({ id: `link${i + 1}`, label: `${m.a.name} ~ ${m.b.name}`, href: nodeHref(m.a.id), text: `${m.a.name} (${m.a.type}) and ${m.b.name} (${m.b.type}) aren't linked but both connect to ${m.via.map((v) => v.name).join(", ")}` }));
  const items = await db.list("strategy_items", { where: { status: ["approved", "active"] } });
  const tasks = await db.list("tasks");
  const fortnight = new Date(Date.now() - 14 * 86400000).toISOString();
  for (const it of items.filter((x) => x.level === "objective" || x.level === "project")) {
    const kids = items.filter((x) => x.parent_id === it.id || x.id === it.id).flatMap((x) => x.task_ids);
    const recent = tasks.filter((t) => kids.includes(t.id) && t.updated_at >= fortnight).length;
    if (!recent && it.updated_at < fortnight) pack.push({ id: `neglect_${it.id}`, label: it.title, href: `/infinity/strategy/${it.ambition_id}`, text: `Approved ${it.level} "${it.title}" has had no activity in 14+ days.` });
  }
  const month = new Date(Date.now() - 30 * 86400000).toISOString();
  const recentTasks = tasks.filter((t) => t.created_at >= month);
  const linked = recentTasks.filter((t) => t.context_ref?.type === "strategy").length;
  const byKind = [...recentTasks.reduce((m, t) => m.set(t.kind, (m.get(t.kind) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const spend = recentTasks.reduce((s, t) => s + t.cost_cents, 0);
  pack.push({ id: "attention", label: "Last 30 days of work", href: "/tasks", text: `Last 30 days: ${recentTasks.length} tasks (${linked} linked to approved strategy), $${(spend / 100).toFixed(2)} spent. Most common: ${byKind.map(([k, n]) => `${k} ×${n}`).join(", ") || "none"}.` });
  for (const [k, c] of Object.entries(COUNTERS)) pack.push({ id: `count_${k}`, label: c.label, href: null, text: `${c.label}: ${await c.count()} to date.` });
  for (const s of (await db.list("speaking", { where: { status: ["discovered", "saved", "drafting"] } })).filter((x) => x.deadline && x.deadline >= today && x.deadline <= addDays(today, 14))) pack.push({ id: `deadline_${s.id}`, label: s.name, href: `/speaking/${s.id}`, text: `Speaker deadline for ${s.name} is ${s.deadline}; no application yet.` });
  const stale = (await db.list("approvals", { where: { status: "pending" } })).filter((a) => a.created_at < new Date(Date.now() - 3 * 86400000).toISOString());
  if (stale.length) pack.push({ id: "approvals", label: `${stale.length} approvals waiting`, href: "/approvals", text: `${stale.length} items have waited 3+ days for Sean's approval: ${stale.slice(0, 5).map((a) => a.title).join("; ")}` });
  const conflicts = await db.count("graph_conflicts", { status: "open" });
  if (conflicts) pack.push({ id: "conflicts", label: `${conflicts} contradictions`, href: "/infinity/world?view=conflicts", text: `${conflicts} contradictions in the world model are unresolved.` });
  for (const a of await db.list("ambitions", { where: { status: ["active", "proposed"] } })) pack.push({ id: `ambition_${a.id}`, label: a.statement.slice(0, 60), href: `/infinity/strategy/${a.id}`, text: `Ambition (${a.status}): ${a.statement}. Assumptions: ${a.assumptions.slice(0, 4).join("; ")}` });
  const opps = (await db.list("opportunities", { where: { status: "new" } })).filter((o) => o.created_at < new Date(Date.now() - 7 * 86400000).toISOString());
  for (const o of opps.slice(0, 4)) pack.push({ id: `opp_${o.id}`, label: o.title, href: `/opportunities/${o.id}`, text: `Connected opportunity "${o.title}" (score ${o.score}/10) untouched for a week: ${o.thesis}` });
  for (const i of (await db.list("ideas", { where: { status: ["captured", "developing"] } })).slice(0, 10)) pack.push({ id: `idea_${i.id}`, label: i.title, href: `/ideas/${i.id}`, text: `Idea "${i.title}" (${i.status}, verdict ${i.verdict ?? "none"}): ${i.one_liner}` });
  return pack;
}

registerWorkflow({
  kind: "missing",
  title: "What am I missing?",
  agent: "chief_of_staff",
  async run(ctx) {
    const db = getDb();
    await ctx.step("curator", "Refreshing your world model", () => syncGraph(true));
    const pack = await evidencePack();
    const byId = new Map(pack.map((p) => [p.id, p]));
    const r = await ctx.step("chief_of_staff", "Looking for blind spots", async () =>
      (await callAgent({
        agent: "chief_of_staff", taskId: ctx.task.id, effort: "high", schema: MissingZ,
        prompt: `Sean asked: "What am I missing?"\nUsing ONLY the evidence pack below, identify what genuinely matters: overlooked opportunities, unconsidered risks, weak assumptions, contradictions between goals and actions, things consuming too much attention, potential collaborators, new strategic possibilities, neglected tasks, unexpected connections, or places he's overcomplicating things.\nRules: cite evidence ids for every finding. Prioritise by evidence and impact. Do not manufacture insights to seem clever. If nothing clears the bar, return an empty list. Give one actionable recommendation per finding.\nAlso give the single Next Best Move if one is clearly supported (else null).\n\nEvidence pack:\n${pack.map((p) => `[${p.id}] ${p.text}`).join("\n") || "(empty: the world model has little in it yet)"}`,
      })).data,
    );
    const kept: Insight[] = [];
    for (const f of r.findings) {
      const ev = f.evidence.map((e) => byId.get(e)).filter(Boolean);
      if (!ev.length) continue; // no traceable evidence → not shown
      kept.push({ id: newId("ins"), run_id: ctx.task.id, kind: f.kind, title: f.title, insight: f.insight, recommendation: f.recommendation, evidence: ev.map((e) => ({ id: e!.id, label: e!.label, href: e!.href })), impact: Math.max(1, Math.min(5, Math.round(f.impact))), confidence: Math.max(0, Math.min(1, f.confidence)), status: "new", next_best_move: false, task_id: null, created_at: nowIso() });
    }
    kept.sort((a, b) => b.impact * b.confidence - a.impact * a.confidence);
    for (const k of kept) await db.insert("insights", k);
    if (r.next_best_move) {
      const ev = r.next_best_move.evidence.map((e) => byId.get(e)).filter(Boolean);
      if (ev.length) await db.insert("insights", { id: newId("ins"), run_id: ctx.task.id, kind: "next_best_move", title: r.next_best_move.title, insight: r.next_best_move.why, recommendation: { label: r.next_best_move.title, instruction: r.next_best_move.instruction }, evidence: ev.map((e) => ({ id: e!.id, label: e!.label, href: e!.href })), impact: 5, confidence: 0.7, status: "new", next_best_move: true, task_id: null, created_at: nowIso() });
    }
    const dropped = r.findings.length - kept.length;
    return { summary: kept.length ? `${kept.length} thing${kept.length > 1 ? "s" : ""} worth your attention${dropped ? ` (${dropped} dropped for lack of evidence)` : ""}.` : "Nothing important enough to surface right now." };
  },
});
