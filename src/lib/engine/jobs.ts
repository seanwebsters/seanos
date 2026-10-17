import "server-only";
import { getDb } from "@/lib/db";
import type { Approval, Deliverable, Ref, Source, Task, TaskStep } from "@/lib/db/types";
import { newId, nowIso } from "@/lib/util";
import { BlockedError, RetryableError } from "@/lib/ai/errors";
import type { AgentKey } from "@/lib/ai/agents";
import { notify } from "@/lib/services/notify";

export interface RunContext {
  task: Task;
  /** Run (or resume) a named step. Completed steps return their saved output. */
  step<T>(agent: AgentKey, title: string, fn: () => Promise<T>): Promise<T>;
  log(message: string, agent?: AgentKey, level?: "info" | "warn" | "error"): Promise<void>;
  progress(p: number): Promise<void>;
  deliver(d: Deliverable): void;
  cite(sources: Source[]): void;
  needsApproval(a: Omit<Approval, "id" | "status" | "created_at" | "decided_at" | "task_id">): Promise<void>;
}

export interface WorkflowResult { summary: string; awaitingApproval?: boolean }
export interface Workflow {
  kind: string;
  title: string;
  agent: AgentKey;
  run(ctx: RunContext): Promise<WorkflowResult>;
}

const registry = new Map<string, Workflow>();
export function registerWorkflow(w: Workflow) {
  registry.set(w.kind, w);
}
export function getWorkflow(kind: string) {
  return registry.get(kind);
}
export function workflowKinds() {
  return [...registry.keys()];
}

export interface CreateTaskInput {
  title: string;
  instruction?: string;
  kind: string;
  params?: Record<string, unknown>;
  agent?: AgentKey;
  contextRef?: Ref | null;
  automationId?: string | null;
  scheduledFor?: Date;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const wf = getWorkflow(input.kind);
  const at = nowIso();
  const task: Task = {
    id: newId("task"),
    title: input.title,
    instruction: input.instruction ?? input.title,
    kind: input.kind,
    params: input.params ?? {},
    status: "queued",
    agent: input.agent ?? wf?.agent ?? "chief_of_staff",
    progress: 0,
    summary: null,
    deliverables: [],
    citations: [],
    context_ref: input.contextRef ?? null,
    automation_id: input.automationId ?? null,
    attempts: 0,
    max_attempts: 3,
    scheduled_for: (input.scheduledFor ?? new Date()).toISOString(),
    lease_until: null,
    error: null,
    blocked_on: null,
    cost_cents: 0,
    created_at: at,
    updated_at: at,
    started_at: null,
    completed_at: null,
  };
  await getDb().insert("tasks", task);
  await addLog(task.id, "Task created", task.agent);
  kick();
  return task;
}

export async function addLog(taskId: string, message: string, agent: string | null = null, level: "info" | "warn" | "error" = "info") {
  await getDb().insert("task_logs", { id: newId("log"), task_id: taskId, agent, level, message, at: nowIso() });
}

const BACKOFF_MS = [60_000, 5 * 60_000, 20 * 60_000];
const LEASE_MS = 15 * 60_000;
const CONCURRENCY = 2;
const running = new Set<string>();

/** Claim and run due tasks. Safe to call from the heartbeat, cron and API. */
export async function tick(): Promise<number> {
  const db = getDb();
  const now = new Date();
  const due = (await db.list("tasks", { where: { status: ["queued", "running"] }, orderBy: { column: "scheduled_for", ascending: true } })).filter(
    (t) => !running.has(t.id) && t.scheduled_for <= now.toISOString() && (!t.lease_until || t.lease_until < now.toISOString()),
  );
  const slots = Math.max(0, CONCURRENCY - running.size);
  const batch = due.slice(0, slots);
  await Promise.all(batch.map((t) => runTask(t.id)));
  return batch.length;
}

let kickTimer: NodeJS.Timeout | null = null;
/** Start work promptly after a task is created (no wait for the heartbeat). */
export function kick() {
  if (process.env.VITEST || kickTimer) return;
  kickTimer = setTimeout(() => {
    kickTimer = null;
    void tick().catch((e) => console.error(JSON.stringify({ level: "error", scope: "kick", message: String(e) })));
  }, 250);
}

export async function runTask(taskId: string): Promise<Task> {
  const db = getDb();
  if (running.has(taskId)) return (await db.get("tasks", taskId)) as Task;
  running.add(taskId);
  try {
    let task = (await db.get("tasks", taskId)) as Task;
    const wf = getWorkflow(task.kind);
    if (!wf) {
      return await db.update("tasks", taskId, { status: "failed", error: `Unknown task type "${task.kind}".`, updated_at: nowIso() });
    }
    task = await db.update("tasks", taskId, {
      status: "running", attempts: task.attempts + 1, lease_until: new Date(Date.now() + LEASE_MS).toISOString(),
      started_at: task.started_at ?? nowIso(), error: null, blocked_on: null, updated_at: nowIso(),
    });
    await addLog(taskId, task.attempts > 1 ? `Attempt ${task.attempts} started` : "Started", task.agent);

    const existing = await db.list("task_steps", { where: { task_id: taskId }, orderBy: { column: "idx", ascending: true } });
    let idx = 0;
    const deliverables: Deliverable[] = [...task.deliverables];
    const citations: Source[] = [...task.citations];
    const ctx: RunContext = {
      task,
      async step(agent, title, fn) {
        const myIdx = idx++;
        const prev = existing.find((s) => s.idx === myIdx && s.title === title);
        if (prev?.status === "done") return prev.output as never;
        const fresh = await db.get("tasks", taskId);
        if (fresh && (fresh.status === "cancelled" || fresh.status === "paused")) throw new StopSignal(fresh.status);
        const stepId = prev?.id ?? newId("step");
        const base: TaskStep = { id: stepId, task_id: taskId, idx: myIdx, agent, title, status: "running", output: null, cost_cents: 0, started_at: nowIso(), finished_at: null, error: null };
        await db.upsert("task_steps", base);
        await addLog(taskId, title, agent);
        const before = await taskSpend(taskId);
        try {
          const out = await fn();
          const cost = (await taskSpend(taskId)) - before;
          await db.update("task_steps", stepId, { status: "done", output: out as unknown, finished_at: nowIso(), cost_cents: cost });
          return out;
        } catch (e) {
          await db.update("task_steps", stepId, { status: "failed", error: errMsg(e), finished_at: nowIso() });
          throw e;
        }
      },
      async log(message, agent, level = "info") {
        await addLog(taskId, message, agent ?? null, level);
      },
      async progress(p) {
        await db.update("tasks", taskId, { progress: Math.max(0, Math.min(1, p)), updated_at: nowIso() });
      },
      deliver(d) {
        if (!deliverables.some((x) => x.type === d.type && x.id === d.id)) deliverables.push(d);
      },
      cite(sources) {
        for (const s of sources) if (!citations.some((c) => c.url === s.url)) citations.push(s);
      },
      async needsApproval(a) {
        const row: Approval = { ...a, id: newId("apr"), task_id: taskId, status: "pending", created_at: nowIso(), decided_at: null };
        await db.insert("approvals", row);
      },
    };

    try {
      const result = await wf.run(ctx);
      const cost = await taskSpend(taskId);
      task = await db.update("tasks", taskId, {
        status: result.awaitingApproval ? "awaiting_approval" : "completed", progress: 1, summary: result.summary,
        deliverables, citations: citations.slice(0, 60), cost_cents: cost, lease_until: null, completed_at: nowIso(), updated_at: nowIso(),
      });
      await addLog(taskId, result.awaitingApproval ? "Finished. Waiting for your approval." : "Completed", task.agent);
      await notify({
        title: result.awaitingApproval ? `Ready for review: ${task.title}` : `Done: ${task.title}`,
        body: result.summary.slice(0, 180),
        href: `/tasks/${taskId}`,
        importance: result.awaitingApproval ? 2 : task.automation_id ? 1 : 2,
      });
      return task;
    } catch (e) {
      const cost = await taskSpend(taskId);
      const common = { deliverables, citations, cost_cents: cost, lease_until: null, updated_at: nowIso() };
      if (e instanceof StopSignal) return await db.update("tasks", taskId, { ...common, status: e.status });
      if (e instanceof BlockedError) {
        await addLog(taskId, e.message, task.agent, "warn");
        await notify({ title: `Blocked: ${task.title}`, body: e.message, href: `/tasks/${taskId}`, importance: 3 });
        return await db.update("tasks", taskId, { ...common, status: "blocked", blocked_on: e.need, error: e.message });
      }
      const retryable = e instanceof RetryableError || isTransient(e);
      if (retryable && task.attempts < task.max_attempts) {
        const wait = Math.max(e instanceof RetryableError ? e.retryAfterMs : 0, BACKOFF_MS[task.attempts - 1] ?? 20 * 60_000);
        await addLog(taskId, `${errMsg(e)} Retrying in ${Math.round(wait / 60000)} min.`, task.agent, "warn");
        return await db.update("tasks", taskId, { ...common, status: "queued", error: errMsg(e), scheduled_for: new Date(Date.now() + wait).toISOString() });
      }
      await addLog(taskId, errMsg(e), task.agent, "error");
      await notify({ title: `Failed: ${task.title}`, body: errMsg(e), href: `/tasks/${taskId}`, importance: 2 });
      return await db.update("tasks", taskId, { ...common, status: "failed", error: errMsg(e) });
    }
  } finally {
    running.delete(taskId);
  }
}

class StopSignal extends Error {
  constructor(public readonly status: "cancelled" | "paused") {
    super(status);
  }
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function isTransient(e: unknown) {
  const m = errMsg(e);
  return /ECONNRESET|ETIMEDOUT|fetch failed|socket hang up/i.test(m);
}

async function taskSpend(taskId: string) {
  const rows = await getDb().list("usage", { where: { task_id: taskId } });
  return Math.round(rows.reduce((s, r) => s + r.cost_cents, 0) * 100) / 100;
}

/** Task controls. */
export async function controlTask(taskId: string, action: "pause" | "resume" | "cancel" | "retry" | "repeat", when?: string) {
  const db = getDb();
  const t = await db.get("tasks", taskId);
  if (!t) throw new Error("Task not found");
  const at = nowIso();
  switch (action) {
    case "pause":
      if (["queued", "running", "blocked"].includes(t.status)) await db.update("tasks", taskId, { status: "paused", updated_at: at });
      break;
    case "cancel":
      if (!["completed", "cancelled"].includes(t.status)) await db.update("tasks", taskId, { status: "cancelled", updated_at: at });
      break;
    case "resume":
    case "retry":
      await db.update("tasks", taskId, {
        status: "queued", error: null, blocked_on: null, attempts: action === "retry" ? 0 : t.attempts,
        scheduled_for: when ?? at, lease_until: null, updated_at: at,
      });
      kick();
      break;
    case "repeat":
      return createTask({ title: t.title, instruction: t.instruction, kind: t.kind, params: t.params, agent: t.agent as AgentKey, contextRef: t.context_ref, scheduledFor: when ? new Date(when) : undefined });
  }
  const verbs = { pause: "Paused", resume: "Resumed", cancel: "Cancelled", retry: "Retried" } as const;
  await addLog(taskId, `${verbs[action]} by Sean`);
  return db.get("tasks", taskId);
}
