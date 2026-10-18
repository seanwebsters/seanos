import { after } from "next/server";
import { getDb } from "@/lib/db";
import type { Ref } from "@/lib/db/types";
import { body, HttpError, json, route } from "@/lib/api";
import { createTask, getWorkflow, runTask } from "@/lib/engine";
import type { AgentKey } from "@/lib/ai/agents";

const INTERNAL = new Set(["wardrobe_tag", "copilot"]);

export const POST = route(async (req: Request) => {
  const b = await body<{ instruction?: string; kind?: string; params?: Record<string, unknown>; context_ref?: Ref | null; title?: string }>(req);
  const instruction = (b.instruction ?? "").trim().slice(0, 4000);
  const kind = b.kind && getWorkflow(b.kind) && !INTERNAL.has(b.kind) ? b.kind : "freeform";
  if (!instruction && kind === "freeform") throw new HttpError(400, "Tell the team what to do.");
  const ref = b.context_ref && typeof b.context_ref.id === "string" ? { type: String(b.context_ref.type), id: b.context_ref.id, title: String(b.context_ref.title ?? "").slice(0, 200) } : null;
  const wf = getWorkflow(kind)!;
  const title = (b.title ?? (instruction || wf.title)).slice(0, 80);
  const task = await createTask({ title, instruction: instruction || wf.title, kind, params: b.params ?? {}, contextRef: ref, agent: wf.agent as AgentKey });
  // Serverless hosts freeze after the response; after() keeps the run alive.
  if (process.env.VERCEL) after(() => runTask(task.id).then(() => undefined));
  return json({ task });
});

export const maxDuration = 300;

export const GET = route(async () => {
  const tasks = await getDb().list("tasks", { orderBy: { column: "created_at", ascending: false }, limit: 100 });
  return json({ tasks });
});
