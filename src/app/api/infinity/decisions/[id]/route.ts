import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { createTask } from "@/lib/engine";
import { audit } from "@/lib/audit";
import { newId, nowIso } from "@/lib/util";

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const b = await body<{ action: "decide" | "rerun" | "model" | "archive"; option?: string; note?: string }>(req);
  const db = getDb();
  const d = await db.get("decisions", id);
  if (!d) throw new HttpError(404, "Not found");
  if (b.action === "rerun") {
    const task = await createTask({ title: `Council: ${d.question.slice(0, 64)}`, instruction: d.question, kind: "council", params: { decision_id: d.id }, contextRef: { type: "decision", id: d.id, title: d.question.slice(0, 80) } });
    await db.update("decisions", id, { status: "deliberating", task_id: task.id, updated_at: nowIso() });
    return json({ task });
  }
  if (b.action === "model") {
    const task = await createTask({ title: `Futures: ${d.question.slice(0, 64)}`, instruction: d.question, kind: "scenario", params: { decision_id: d.id }, contextRef: { type: "decision", id: d.id, title: d.question.slice(0, 80) } });
    return json({ task });
  }
  if (b.action === "archive") {
    await db.update("decisions", id, { status: "archived", updated_at: nowIso() });
    return json({ ok: true });
  }
  if (b.action !== "decide" || !b.option) throw new HttpError(400, "Choose an option");
  const note = (b.note ?? "").slice(0, 1000);
  await db.update("decisions", id, { status: "decided", decided_option: b.option, decision_note: note, updated_at: nowIso() });
  // The strategic twin learns from where Sean's choices differ from the council's.
  const rec = d.recommendation?.option;
  const differs = rec && rec.toLowerCase() !== b.option.toLowerCase();
  await db.insert("memories", {
    id: newId("mem"), category: "Decisions", kind: "decision", scope: "personal", source: "user", provenance: `decision:${id}`, confidence: 1, pinned: false, created_at: nowIso(), updated_at: nowIso(),
    content: `Decided "${b.option}" on "${d.question}"${differs ? ` (the council recommended "${rec}")` : rec ? " (in line with the council)" : ""}${note ? `. Reason: ${note}` : ""}.`,
  });
  await audit("sean", "council.decide", `decision:${id}`, `${b.option}${differs ? " (differs from council)" : ""}`);
  return json({ ok: true });
});
