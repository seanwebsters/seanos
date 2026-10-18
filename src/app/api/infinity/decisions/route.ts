import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { createTask } from "@/lib/engine";
import { createDecision } from "@/lib/council/workflows";
import { audit } from "@/lib/audit";

/** Put an important decision to the Intelligence Council. */
export const POST = route(async (req: Request) => {
  const b = await body<{ question: string; context?: string; options?: string[]; scenario_id?: string }>(req);
  const question = (b.question ?? "").trim();
  if (question.length < 8) throw new HttpError(400, "What are you deciding?");
  const d = await createDecision(question, { context: (b.context ?? "").slice(0, 3000), options: (b.options ?? []).map((o) => String(o).trim()).filter(Boolean).slice(0, 5), scenario_id: b.scenario_id ?? null });
  const task = await createTask({ title: `Council: ${question.slice(0, 64)}`, instruction: question, kind: "council", params: { decision_id: d.id }, contextRef: { type: "decision", id: d.id, title: question.slice(0, 80) } });
  await getDb().update("decisions", d.id, { task_id: task.id });
  if (b.scenario_id) await getDb().update("scenarios", b.scenario_id, { decision_id: d.id });
  await audit("sean", "council.submit", `decision:${d.id}`, question);
  return json({ decision: d, task });
});
