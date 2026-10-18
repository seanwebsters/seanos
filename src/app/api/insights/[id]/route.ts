import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { createTask } from "@/lib/engine";
import { audit } from "@/lib/audit";

/** Act on an insight (delegates its recommendation as a real task) or dismiss it. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { action } = await body<{ action: "act" | "dismiss" }>(req);
  const db = getDb();
  const i = await db.get("insights", id);
  if (!i) throw new HttpError(404, "Not found");
  if (action === "dismiss") {
    await db.update("insights", id, { status: "dismissed" });
    await db.insert("memories", { id: `mem_${Date.now().toString(36)}`, category: "Strategy", content: `Dismissed insight: "${i.title}"`, kind: "feedback", scope: "personal", source: "feedback", provenance: `insight:${id}`, confidence: 1, pinned: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    return json({ ok: true });
  }
  if (!i.recommendation) throw new HttpError(400, "Nothing to act on");
  const task = await createTask({ title: i.recommendation.label.slice(0, 80), instruction: `${i.recommendation.instruction}\n\nWhy: ${i.insight}`, kind: "freeform", contextRef: { type: "insight", id: i.id, title: i.title } });
  await db.update("insights", id, { status: "acted", task_id: task.id });
  await audit("sean", "insight.act", `insight:${id}`, i.title);
  return json({ task });
});
