import "server-only";
import { getDb } from "@/lib/db";
import { AGENTS } from "@/lib/ai/agents";

export type AgentState = "working" | "waiting" | "blocked" | "idle" | "off";

/** Agent status derived entirely from real task, step and approval rows. */
export async function agentStates() {
  const db = getDb();
  const [steps, tasks, approvals, overrides, usage] = await Promise.all([
    db.list("task_steps", { orderBy: { column: "started_at", ascending: false } }),
    db.list("tasks"),
    db.list("approvals", { where: { status: "pending" } }),
    db.list("agent_overrides"),
    db.list("usage"),
  ]);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  return AGENTS.map((a) => {
    const mine = steps.filter((s) => s.agent === a.key);
    const current = mine.find((s) => s.status === "running" && taskById.get(s.task_id)?.status === "running");
    const blockedTask = tasks.find((t) => t.status === "blocked" && (t.agent === a.key || mine.some((s) => s.task_id === t.id && s.status !== "done")));
    const waiting = approvals.filter((p) => p.agent === a.key);
    const last = mine.find((s) => s.status === "done");
    const off = overrides.find((o) => o.id === a.key)?.enabled === false;
    const state: AgentState = off ? "off" : current ? "working" : blockedTask ? "blocked" : waiting.length ? "waiting" : "idle";
    return {
      ...a,
      state,
      current: current ? { title: current.title, task: taskById.get(current.task_id)! } : null,
      blocked: blockedTask ?? null,
      waiting: waiting.length,
      last: last ? { title: last.title, at: last.finished_at, taskId: last.task_id } : null,
      completed: mine.filter((s) => s.status === "done").length,
      cost: usage.filter((u) => u.agent === a.key).reduce((s, u) => s + u.cost_cents, 0),
    };
  });
}
