import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { nowIso, newId } from "@/lib/util";
import { approveItem } from "@/lib/strategy/core";
import { audit } from "@/lib/audit";

/**
 * Approving never sends or publishes anything. It marks the item ready so
 * Sean can copy, post or send it himself.
 */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { decision, note } = await body<{ decision: "approved" | "rejected"; note?: string }>(req);
  if (!["approved", "rejected"].includes(decision)) throw new HttpError(400, "Invalid decision");
  const db = getDb();
  const a = await db.get("approvals", id);
  if (!a) throw new HttpError(404, "Approval not found");
  await db.update("approvals", id, { status: decision, decided_at: nowIso() });
  await audit("sean", `approval.${decision}`, `${a.type}:${a.ref_id}`, a.title);
  if (a.type === "draft") {
    const d = await db.get("drafts", a.ref_id);
    if (d) {
      await db.update("drafts", d.id, { status: decision === "approved" ? "approved" : "rejected", updated_at: nowIso() });
      if (decision === "rejected" && note) {
        await db.insert("memories", { id: newId("mem"), category: "Writing", content: `Rejected draft "${d.title}": ${note}`, kind: "feedback", scope: "personal", source: "feedback", provenance: `Draft ${d.id}`, confidence: 1, pinned: false, created_at: nowIso(), updated_at: nowIso() });
      }
    }
  } else if (a.type === "strategy") {
    const roots = await db.list("strategy_items", { where: { ambition_id: a.ref_id, parent_id: null } });
    if (decision === "approved") for (const r of roots) if (r.status === "proposed") await approveItem(r.id);
    if (decision === "rejected") {
      for (const r of await db.list("strategy_items", { where: { ambition_id: a.ref_id, status: "proposed" } })) await db.update("strategy_items", r.id, { status: "dropped", updated_at: nowIso() });
      await db.update("ambitions", a.ref_id, { status: "drafting", updated_at: nowIso() });
    }
  } else if (a.type === "outreach") {
    const o = await db.get("outreach", a.ref_id);
    if (o) await db.update("outreach", o.id, { status: decision === "approved" ? "approved" : "declined", approved_at: decision === "approved" ? nowIso() : null, updated_at: nowIso() });
  }
  // A task stays "awaiting approval" until all its approvals are decided.
  if (a.task_id && (await db.count("approvals", { task_id: a.task_id, status: "pending" })) === 0) {
    const t = await db.get("tasks", a.task_id);
    if (t?.status === "awaiting_approval") await db.update("tasks", t.id, { status: "completed", updated_at: nowIso() });
  }
  return json({ ok: true });
});
