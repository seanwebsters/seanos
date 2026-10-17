import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { controlTask } from "@/lib/engine";

export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const db = getDb();
  const task = await db.get("tasks", id);
  if (!task) throw new HttpError(404, "Task not found");
  const steps = await db.list("task_steps", { where: { task_id: id }, orderBy: { column: "idx", ascending: true } });
  return json({ task, steps });
});

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const b = await body<{ action: string; when?: string }>(req);
  if (!["pause", "resume", "cancel", "retry", "repeat"].includes(b.action)) throw new HttpError(400, "Unknown action");
  const res = await controlTask(id, b.action as "pause", b.when);
  return json(b.action === "repeat" ? { task: res } : { ok: true });
});
