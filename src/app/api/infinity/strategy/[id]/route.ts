import { getDb } from "@/lib/db";
import type { Metric } from "@/lib/db/types";
import { body, HttpError, json, route } from "@/lib/api";
import { approveItem, startAction } from "@/lib/strategy/core";
import { createTask } from "@/lib/engine";
import { audit } from "@/lib/audit";
import { newId, nowIso } from "@/lib/util";

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const b = await body<{ action: string; metrics?: Metric[]; title?: string; instruction?: string }>(req);
  const db = getDb();
  if (b.action === "replan" || b.action === "review") {
    const a = await db.get("ambitions", id);
    if (!a) throw new HttpError(404, "Not found");
    const task = b.action === "replan"
      ? await createTask({ title: `Strategy: ${a.statement.slice(0, 60)}`, instruction: a.statement, kind: "ambition_plan", params: { ambition_id: a.id }, contextRef: { type: "ambition", id: a.id, title: a.statement.slice(0, 80) } })
      : await createTask({ title: `Review: ${a.statement.slice(0, 60)}`, kind: "strategy_review", params: { ambition_id: a.id } });
    return json({ task });
  }
  if (b.action === "approve_all") {
    const roots = await db.list("strategy_items", { where: { ambition_id: id, parent_id: null } });
    const res = { approved: 0, started: [] as string[] };
    for (const r of roots) if (r.status === "proposed") { const x = await approveItem(r.id); res.approved += x.approved; res.started.push(...x.started); }
    for (const p of await db.list("approvals", { where: { type: "strategy", ref_id: id, status: "pending" } })) await db.update("approvals", p.id, { status: "approved", decided_at: nowIso() });
    return json(res);
  }
  const item = await db.get("strategy_items", id);
  if (!item) throw new HttpError(404, "Not found");
  switch (b.action) {
    case "approve": return json(await approveItem(id));
    case "start": return json({ task: await startAction(item) });
    case "add_action": {
      if (!b.title) throw new HttpError(400, "Give the action a title");
      const row = await db.insert("strategy_items", { ...item, id: newId("si"), parent_id: item.id, level: "action", title: b.title, description: "", rationale: "", metrics: [], status: "approved", instruction: b.instruction ?? b.title, task_ids: [], evidence: [], position: 9999, created_at: nowIso(), updated_at: nowIso() });
      return json({ row });
    }
    case "metrics":
      await db.update("strategy_items", id, { metrics: (b.metrics ?? []).slice(0, 6).map((m) => ({ name: String(m.name), target: Number(m.target) || 0, current: Number(m.current) || 0, unit: String(m.unit ?? ""), source: String(m.source ?? "manual") })), updated_at: nowIso() });
      break;
    case "done": case "pause": case "drop": case "resume":
      await db.update("strategy_items", id, { status: b.action === "done" ? "done" : b.action === "pause" ? "paused" : b.action === "drop" ? "dropped" : "active", updated_at: nowIso() });
      break;
    case "prepare": {
      const task = await createTask({ title: `Prepare: ${item.title.slice(0, 60)}`, instruction: `Prepare the work for the ${item.level} "${item.title}": ${item.description}. Produce concrete deliverables.`, kind: "freeform", contextRef: { type: "strategy", id: item.id, title: item.title } });
      await db.update("strategy_items", id, { task_ids: [...item.task_ids, task.id], updated_at: nowIso() });
      return json({ task });
    }
    default: throw new HttpError(400, "Unknown action");
  }
  await audit("sean", `strategy.${b.action}`, `strategy:${id}`, item.title);
  return json({ ok: true });
});
