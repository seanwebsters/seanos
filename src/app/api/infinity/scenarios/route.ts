import { body, HttpError, json, route } from "@/lib/api";
import { createTask } from "@/lib/engine";
import { audit } from "@/lib/audit";

/** Ask the Future Engine a "what if" question. */
export const POST = route(async (req: Request) => {
  const b = await body<{ question: string }>(req);
  const q = (b.question ?? "").trim();
  if (q.length < 8) throw new HttpError(400, "What future do you want to explore?");
  const task = await createTask({ title: `Futures: ${q.slice(0, 64)}`, instruction: q, kind: "scenario" });
  await audit("sean", "future.ask", `task:${task.id}`, q);
  return json({ task });
});
