import "server-only";
import { getDb } from "@/lib/db";
import type { Metric, StrategyItem } from "@/lib/db/types";
import { getSettings } from "@/lib/bootstrap";
import { createTask } from "@/lib/engine/jobs";
import { audit } from "@/lib/audit";
import { nowIso } from "@/lib/util";
import type { AgentKey } from "@/lib/ai/agents";
import { isAgentKey } from "@/lib/ai/agents";

export const LEVELS = ["strategy", "objective", "initiative", "project", "action"] as const;

/** Built-in counters a metric can track automatically, from real records. */
export const COUNTERS: Record<string, { label: string; count: () => Promise<number> }> = {
  published_pieces: { label: "Pieces published or approved", count: async () => getDb().count("drafts", { status: ["approved", "scheduled", "published"] }) },
  talks_applied: { label: "Speaking applications made", count: async () => getDb().count("speaking", { status: ["applied", "accepted", "contacted"] }) },
  talks_accepted: { label: "Talks accepted", count: async () => getDb().count("speaking", { status: "accepted" }) },
  people_met: { label: "New relationships (contacted or met)", count: async () => getDb().count("people", { status: ["contacted", "met"] }) },
  outreach_sent: { label: "Outreach sent", count: async () => getDb().count("outreach", { status: ["sent", "replied"] }) },
  replies: { label: "Outreach replies", count: async () => getDb().count("outreach", { status: "replied" }) },
  ideas_validated: { label: "Ideas validated", count: async () => getDb().count("ideas", { status: "validated" }) },
  partnerships_in_talks: { label: "Partnerships in talks", count: async () => getDb().count("partnerships", { status: "in_talks" }) },
  tasks_completed: { label: "Tasks completed", count: async () => getDb().count("tasks", { status: "completed" }) },
};

export async function metricValue(m: Metric): Promise<number> {
  const c = COUNTERS[m.source];
  return c ? c.count() : m.current;
}

/** Progress of an item: metrics if it has them, else its children, else its tasks. */
export async function progressOf(item: StrategyItem, all: StrategyItem[], memo = new Map<string, number>()): Promise<number> {
  if (memo.has(item.id)) return memo.get(item.id)!;
  let p = 0;
  if (item.status === "done") p = 1;
  else if (item.metrics.length) {
    const vals = await Promise.all(item.metrics.map(async (m) => Math.min(1, (await metricValue(m)) / Math.max(1e-9, m.target))));
    p = vals.reduce((s, v) => s + v, 0) / vals.length;
  } else {
    const kids = all.filter((x) => x.parent_id === item.id && x.status !== "dropped");
    if (kids.length) p = (await Promise.all(kids.map((k) => progressOf(k, all, memo)))).reduce((s, v) => s + v, 0) / kids.length;
    else if (item.task_ids.length) {
      const tasks = (await Promise.all(item.task_ids.map((t) => getDb().get("tasks", t)))).filter(Boolean);
      p = tasks.filter((t) => t!.status === "completed").length / Math.max(1, tasks.length);
    }
  }
  memo.set(item.id, p);
  return p;
}

/** Starts an action as a real task, linked back to the strategy. */
export async function startAction(item: StrategyItem, actor = "sean") {
  const db = getDb();
  const settings = await getSettings();
  if (settings.halted) throw new Error("SEAN ∞ is stopped. Resume it in Trust & autonomy first.");
  const task = await createTask({
    title: item.title.slice(0, 80),
    instruction: `${item.instruction ?? item.title}\n\nThis advances "${item.title}" in Sean's strategy. Prepare the work; anything external needs his approval.`,
    kind: "freeform",
    agent: (isAgentKey(item.owner_agent) ? item.owner_agent : "chief_of_staff") as AgentKey,
    contextRef: { type: "strategy", id: item.id, title: item.title },
  });
  await db.update("strategy_items", item.id, { task_ids: [...item.task_ids, task.id], status: item.status === "approved" ? "active" : item.status, updated_at: nowIso() });
  await audit(actor, "strategy.start_action", `strategy:${item.id}`, item.title);
  return task;
}

/**
 * Approving an item approves its subtree. At autonomy level 3+ the approved
 * actions start as internal tasks straight away; at 1–2 they wait for Sean.
 */
export async function approveItem(id: string) {
  const db = getDb();
  const all = await db.list("strategy_items");
  const root = all.find((x) => x.id === id);
  if (!root) throw new Error("Not found");
  const subtree: StrategyItem[] = [];
  const walk = (x: StrategyItem) => { subtree.push(x); for (const k of all.filter((y) => y.parent_id === x.id)) walk(k); };
  walk(root);
  for (const x of subtree) if (x.status === "proposed") await db.update("strategy_items", x.id, { status: "approved", updated_at: nowIso() });
  const ambition = await db.get("ambitions", root.ambition_id);
  if (ambition && ["drafting", "proposed"].includes(ambition.status)) await db.update("ambitions", ambition.id, { status: "active", updated_at: nowIso() });
  await audit("sean", "strategy.approve", `strategy:${id}`, `${root.title} (+${subtree.length - 1} below)`);
  const settings = await getSettings();
  const started: string[] = [];
  if (settings.autonomy_level >= 3 && !settings.halted) {
    for (const x of subtree.filter((s) => s.level === "action" && s.task_ids.length === 0 && s.status !== "dropped").slice(0, 8)) {
      const fresh = (await db.get("strategy_items", x.id))!;
      started.push((await startAction(fresh, "autonomy:3")).id);
    }
  }
  return { approved: subtree.length, started };
}
