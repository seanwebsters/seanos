import { env } from "@/lib/env";
import { json, route } from "@/lib/api";
import { heartbeat } from "@/lib/engine";
import { getSettings } from "@/lib/bootstrap";
import { syncIcs } from "@/lib/integrations/calendar";

export const maxDuration = 300;

/** For serverless hosts: call every few minutes with Authorization: Bearer CRON_SECRET. */
export const GET = route(async (req: Request) => {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) return json({ error: "Unauthorized" }, 401);
  const s = await getSettings();
  if (s.calendar_ics_url) await syncIcs(s.calendar_ics_url).catch(() => {});
  await heartbeat();
  return json({ ok: true });
});
