import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";

export const GET = route(async () => {
  const db = getDb();
  const running = await db.list("tasks", { where: { status: ["queued", "running"] } });
  return json({ running: running.map((t) => ({ id: t.id, title: t.title, progress: t.progress, status: t.status })), unread: await db.count("notifications", { read: false }) });
});
