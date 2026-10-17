import "server-only";
import { getDb } from "@/lib/db";
import type { Notification } from "@/lib/db/types";
import { getSettings } from "@/lib/bootstrap";
import { newId, nowIso } from "@/lib/util";
import { sendPush } from "@/lib/integrations/push";

/**
 * Records an in-app notification and, when it meets Sean's threshold,
 * sends a Web Push to subscribed devices.
 */
export async function notify(n: { title: string; body: string; href: string | null; importance: 1 | 2 | 3 }) {
  const db = getDb();
  const row: Notification = { id: newId("ntf"), ...n, read: false, pushed: false, created_at: nowIso() };
  await db.insert("notifications", row);
  try {
    const s = await getSettings();
    if (n.importance >= s.notify_threshold) {
      const sent = await sendPush({ title: n.title, body: n.body, url: n.href ?? "/" });
      if (sent > 0) await db.update("notifications", row.id, { pushed: true });
    }
  } catch (e) {
    console.error(JSON.stringify({ level: "warn", scope: "push", message: String(e) }));
  }
  return row;
}
