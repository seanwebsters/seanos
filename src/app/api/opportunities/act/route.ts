import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { createTask } from "@/lib/engine";

/** Delegates one action of a connected opportunity as a real task. */
export const POST = route(async (req: Request) => {
  const { id, index } = await body<{ id: string; index: number }>(req);
  const db = getDb();
  const o = await db.get("opportunities", id);
  const a = o?.actions[index];
  if (!o || !a) throw new HttpError(404, "Action not found");
  const task = await createTask({ title: a.label, instruction: `${a.instruction}\n\nPart of the opportunity "${o.title}": ${o.thesis}`, kind: "freeform", contextRef: { type: "opportunity", id: o.id, title: o.title } });
  const actions = o.actions.map((x, i) => (i === index ? { ...x, done: true } : x));
  await db.update("opportunities", id, { actions, status: o.status === "new" ? "active" : o.status });
  return json({ task });
});
