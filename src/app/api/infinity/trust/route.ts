import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { nowIso } from "@/lib/util";

/** Autonomy level and the emergency stop. */
export const POST = route(async (req: Request) => {
  const b = await body<{ autonomy_level?: number; halted?: boolean }>(req);
  const db = getDb();
  const patch: Record<string, unknown> = { updated_at: nowIso() };
  if (b.autonomy_level !== undefined) {
    if (![1, 2, 3, 4, 5].includes(b.autonomy_level)) throw new HttpError(400, "Level must be 1–5");
    patch.autonomy_level = b.autonomy_level;
  }
  if (typeof b.halted === "boolean") {
    patch.halted = b.halted;
    if (b.halted) for (const t of await db.list("tasks", { where: { status: ["queued", "running"] } })) await db.update("tasks", t.id, { status: "paused", updated_at: nowIso() });
  }
  await db.update("settings", "app", patch as never);
  await audit("sean", b.halted === true ? "trust.emergency_stop" : b.halted === false ? "trust.resume" : "trust.autonomy", "settings", JSON.stringify(b));
  return json({ ok: true });
});
