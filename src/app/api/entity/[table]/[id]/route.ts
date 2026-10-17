import { getDb } from "@/lib/db";
import type { TableName } from "@/lib/db/types";
import { body, HttpError, json, route } from "@/lib/api";
import { ENTITIES, pick } from "@/lib/services/entities";
import { nowIso } from "@/lib/util";

export const PATCH = route(async (req: Request, { params }: { params: Promise<{ table: string; id: string }> }) => {
  const { table, id } = await params;
  const spec = ENTITIES[table as TableName];
  if (!spec) throw new HttpError(404, "Not editable");
  const db = getDb();
  const t = table as TableName;
  const patch: Record<string, unknown> = pick(await body(req), spec.patch);
  if (spec.touch) patch[spec.touch] = nowIso();
  const existing = await db.get(t, id);
  if (!existing) {
    if (t === "agent_overrides") {
      const row = await db.insert("agent_overrides", { id, instructions: null, model: null, enabled: true, updated_at: nowIso(), ...patch } as never);
      return json({ row });
    }
    throw new HttpError(404, "Not found");
  }
  if (t === "drafts" && typeof patch.body === "string" && patch.body !== (existing as { body: string }).body) {
    patch.version = (existing as { version: number }).version + 1;
  }
  const row = await db.update(t, id, patch as never);
  return json({ row });
});

export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ table: string; id: string }> }) => {
  const { table, id } = await params;
  const spec = ENTITIES[table as TableName];
  if (!spec?.remove) throw new HttpError(404, "Not deletable");
  await getDb().remove(table as TableName, id);
  return json({ ok: true });
});
