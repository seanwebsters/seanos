import "server-only";
import webpush from "web-push";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";

export const pushConfigured = () => Boolean(env.vapidPublicKey && env.vapidPrivateKey);

/** Sends a Web Push to every subscribed device. Returns the number delivered. */
export async function sendPush(payload: { title: string; body: string; url: string }): Promise<number> {
  if (!pushConfigured()) return 0;
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey!, env.vapidPrivateKey!);
  const db = getDb();
  const subs = await db.list("push_subscriptions");
  let ok = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
      ok++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.remove("push_subscriptions", s.id);
    }
  }
  return ok;
}
