import { env } from "@/lib/env";
import { json, route } from "@/lib/api";
import { runAutomations, tick } from "@/lib/engine";
import { getSettings } from "@/lib/bootstrap";
import { syncIcs } from "@/lib/integrations/calendar";

export const maxDuration = 300;

/** For serverless hosts: call every few minutes with Authorization: Bearer CRON_SECRET. */
export const GET = route(async (req: Request) => {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) return json({ error: "Unauthorized" }, 401);
  const s = await getSettings();
  if (s.calendar_ics_url) await syncIcs(s.calendar_ics_url).catch(() => {});
  await runAutomations();
  // Keep working through the queue for up to ~4.5 minutes per invocation.
  const until = Date.now() + 270_000;
  let ran = 0;
  while (Date.now() < until) {
    const n = await tick();
    if (!n) break;
    ran += n;
  }
  return json({ ok: true, ran });
});
