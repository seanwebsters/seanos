import "server-only";
import { getDb } from "@/lib/db";
import { AGENT_BY_KEY, type AgentKey } from "@/lib/ai/agents";
import { londonDate } from "@/lib/time";

/** The Founder OS team, in seating order. Chief of Staff sits at the front desk. */
export const OFFICE_AGENTS: AgentKey[] = ["chief_of_staff", "strategist", "research", "analyst", "growth", "bizdev", "cfo", "fundraising", "investors", "operations", "legal"];

export interface OfficeAgent {
  key: string;
  name: string;
  role: string;
  glyph: string;
  hue: string;
  /** Derived only from task and step records: nothing is animated without a real task behind it. */
  state: "working" | "queued" | "waiting" | "blocked" | "idle";
  task: { id: string; title: string; step: string | null; progress: number } | null;
  doneToday: number;
  last: { id: string; title: string; at: string } | null;
}

export interface OfficeState { agents: OfficeAgent[]; running: number; queued: number; at: string }

export async function officeState(): Promise<OfficeState> {
  const db = getDb();
  const tasks = await db.list("tasks", { orderBy: { column: "updated_at", ascending: false }, limit: 300 });
  const live = tasks.filter((t) => ["running", "queued", "awaiting_approval", "blocked"].includes(t.status));
  const steps = new Map<string, { agent: string; title: string }>();
  for (const t of live.filter((x) => x.status === "running")) {
    const s = (await db.list("task_steps", { where: { task_id: t.id } })).filter((x) => x.status === "running").sort((a, b) => b.idx - a.idx)[0];
    if (s) steps.set(t.id, { agent: s.agent, title: s.title });
  }
  const today = londonDate();
  const doneSteps = (await db.list("task_steps", { where: { status: "done" } })).filter((s) => s.finished_at && londonDate(new Date(s.finished_at)) === today);
  const agents = OFFICE_AGENTS.map((key): OfficeAgent => {
    const def = AGENT_BY_KEY[key];
    // The agent doing the work is the running step's agent, else the task's owner.
    const working = live.find((t) => t.status === "running" && (steps.get(t.id)?.agent ?? t.agent) === key);
    const queued = live.find((t) => t.status === "queued" && t.agent === key);
    const waiting = live.find((t) => t.status === "awaiting_approval" && t.agent === key);
    const blocked = live.find((t) => t.status === "blocked" && t.agent === key);
    const t = working ?? waiting ?? queued ?? blocked;
    const last = tasks.find((x) => x.status === "completed" && x.agent === key);
    return {
      key, name: def.name, role: def.role, glyph: def.glyph, hue: def.hue,
      state: working ? "working" : waiting ? "waiting" : queued ? "queued" : blocked ? "blocked" : "idle",
      task: t ? { id: t.id, title: t.title, step: working ? steps.get(t.id)?.title ?? null : t.status === "blocked" ? t.blocked_on ?? t.error : null, progress: t.progress } : null,
      doneToday: doneSteps.filter((s) => s.agent === key).length,
      last: last ? { id: last.id, title: last.title, at: last.completed_at ?? last.updated_at } : null,
    };
  });
  return { agents, running: live.filter((t) => t.status === "running").length, queued: live.filter((t) => t.status === "queued").length, at: new Date().toISOString() };
}
