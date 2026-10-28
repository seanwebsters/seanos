import { after } from "next/server";
import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { runTask } from "@/lib/engine";
import { postPaMessage, THREAD } from "@/lib/pa/assistant";
import { rateLimit } from "@/lib/rate-limit";

export const POST = route(async (req: Request) => {
  rateLimit("pa", 20, 60_000);
  const b = await body<{ text?: string }>(req);
  const text = (b.text ?? "").trim();
  if (!text) throw new HttpError(400, "Tell me what you need.");
  const out = await postPaMessage(text);
  // Replies should feel immediate, so the work starts now rather than on the next heartbeat.
  try { after(() => runTask(out.task.id).then(() => undefined)); } catch { /* outside a request (tests) */ }
  return json(out);
});

export const GET = route(async () => {
  const db = getDb();
  const msgs = (await db.list("copilot_messages", { where: { thread: THREAD } })).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-60);
  const ids = new Set(msgs.map((m) => m.id));
  const proposals = (await db.list("pa_proposals")).filter((p) => ids.has(p.message_id)).sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
  // A reply whose task failed shows the real reason instead of spinning forever.
  const messages = await Promise.all(msgs.map(async (m) => {
    if (m.status !== "pending" || !m.task_id) return m;
    const t = await db.get("tasks", m.task_id);
    return t && ["failed", "cancelled", "blocked"].includes(t.status) ? { ...m, status: "failed" as const, text: t.blocked_on || t.error || "I couldn't answer that." } : m;
  }));
  return json({ messages, proposals });
});

export const maxDuration = 120;
