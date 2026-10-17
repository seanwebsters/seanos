import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { nextRunAt } from "@/lib/engine/schedule";

export const POST = route(async (req: Request) => {
  const { id } = await body<{ id: string }>(req);
  const db = getDb();
  const a = await db.get("automations", id);
  if (!a) throw new HttpError(404, "Not found");
  await db.update("automations", id, { next_run_at: nextRunAt(a).toISOString() });
  return json({ ok: true });
});
