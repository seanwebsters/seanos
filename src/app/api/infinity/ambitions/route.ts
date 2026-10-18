import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { createTask } from "@/lib/engine";
import { audit } from "@/lib/audit";
import { newId, nowIso } from "@/lib/util";

/** "Here's where I want to be…": records the ambition and asks the strategist to build the plan. */
export const POST = route(async (req: Request) => {
  const b = await body<{ statement: string; horizon?: string; why?: string }>(req);
  const statement = (b.statement ?? "").trim();
  if (statement.length < 8) throw new HttpError(400, "Describe where you want to be.");
  const db = getDb();
  const a = await db.insert("ambitions", { id: newId("amb"), statement: statement.slice(0, 600), horizon: (b.horizon ?? "5 years").slice(0, 40), why: (b.why ?? "").slice(0, 1000), success: [], assumptions: [], risks: [], status: "drafting", task_id: null, created_at: nowIso(), updated_at: nowIso() });
  const task = await createTask({ title: `Strategy: ${statement.slice(0, 60)}`, instruction: statement, kind: "ambition_plan", params: { ambition_id: a.id }, contextRef: { type: "ambition", id: a.id, title: statement.slice(0, 80) } });
  await db.update("ambitions", a.id, { task_id: task.id });
  await audit("sean", "ambition.create", `ambition:${a.id}`, statement);
  return json({ ambition: a, task });
});
