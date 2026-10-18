import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { ASSUMPTION_KEYS } from "@/lib/future/model";
import { audit } from "@/lib/audit";
import { nowIso } from "@/lib/util";

/** Save Sean's own values for assumptions; they're marked as his, not the model's. */
export const PATCH = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { values } = await body<{ values: Record<string, number> }>(req);
  const db = getDb();
  const s = await db.get("scenarios", id);
  if (!s) throw new HttpError(404, "Not found");
  const assumptions = s.assumptions.map((a) => {
    const v = values?.[a.key];
    if (!(ASSUMPTION_KEYS as readonly string[]).includes(a.key) || typeof v !== "number" || !Number.isFinite(v) || v === a.value) return a;
    return { ...a, value: v, basis: "user" as const, note: `Set by you (model suggested ${a.value})`, low: Math.min(a.low, v), high: Math.max(a.high, v) };
  });
  await db.update("scenarios", id, { assumptions, updated_at: nowIso() });
  await audit("sean", "future.assumptions", `scenario:${id}`, Object.keys(values ?? {}).join(", "));
  return json({ ok: true });
});
