import { after } from "next/server";
import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { runTask } from "@/lib/engine";
import { postCopilotMessage } from "@/lib/founder/copilot";
import { rateLimit } from "@/lib/rate-limit";

export const POST = route(async (req: Request) => {
  rateLimit("founder:copilot", 12, 60_000);
  const b = await body<{ thread?: string; text?: string }>(req);
  const text = (b.text ?? "").trim();
  if (!text) throw new HttpError(400, "Say something to your cofounder.");
  const thread = typeof b.thread === "string" && /^(founder|v:[\w-]+)$/.test(b.thread) ? b.thread : "founder";
  const out = await postCopilotMessage(thread, text);
  // Conversation should feel immediate, so the reply starts now rather than on the next heartbeat.
  try {
    after(() => runTask(out.task.id).then(() => undefined));
  } catch {
    // Outside a request scope (tests); the heartbeat picks it up.
  }
  return json(out);
});

export const GET = route(async (req: Request) => {
  const thread = new URL(req.url).searchParams.get("thread") ?? "founder";
  const db = getDb();
  const msgs = (await db.list("copilot_messages", { where: { thread } })).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-60);
  // A reply whose task failed is shown as failed rather than pending forever.
  const out = await Promise.all(msgs.map(async (m) => {
    if (m.status !== "pending" || !m.task_id) return m;
    const t = await db.get("tasks", m.task_id);
    return t && ["failed", "cancelled", "blocked"].includes(t.status) ? { ...m, status: "failed" as const, text: t.error ?? t.blocked_on ?? "The cofounder couldn't answer." } : m;
  }));
  return json({ messages: out });
});

export const maxDuration = 300;
