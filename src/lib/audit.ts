import "server-only";
import { getDb } from "@/lib/db";
import { newId, nowIso } from "@/lib/util";

/** Append-only record of consequential changes and who made them. */
export async function audit(actor: string, action: string, target: string, detail = "") {
  await getDb().insert("audit_log", { id: newId("aud"), at: nowIso(), actor, action, target, detail: detail.slice(0, 2000) });
}
