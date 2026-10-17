import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { env } from "@/lib/env";
import { newId, nowIso } from "@/lib/util";
import { sendPush } from "@/lib/integrations/push";

export const GET = route(async () => json({ publicKey: env.vapidPublicKey ?? null }));

export const POST = route(async (req: Request) => {
  const b = await body<{ action?: string; subscription?: { endpoint: string; keys: { p256dh: string; auth: string } } }>(req);
  const db = getDb();
  if (b.action === "test") return json({ sent: await sendPush({ title: "SEAN OS", body: "Notifications are working.", url: "/" }) });
  const s = b.subscription;
  if (!s?.endpoint || !s.keys?.p256dh) throw new HttpError(400, "Invalid subscription");
  const existing = (await db.list("push_subscriptions")).find((x) => x.endpoint === s.endpoint);
  if (!existing) await db.insert("push_subscriptions", { id: newId("push"), endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, created_at: nowIso() });
  return json({ ok: true });
});
