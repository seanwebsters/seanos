import { getSettings } from "@/lib/bootstrap";
import { HttpError, json, route } from "@/lib/api";
import { syncIcs } from "@/lib/integrations/calendar";
import { getDb } from "@/lib/db";
import { nowIso } from "@/lib/util";

export const POST = route(async () => {
  const s = await getSettings();
  if (!s.calendar_ics_url) throw new HttpError(400, "Add your calendar's private iCal address in Settings first.");
  const n = await syncIcs(s.calendar_ics_url);
  await getDb().update("settings", "app", { calendar_synced_at: nowIso() });
  return json({ ok: true, events: n });
});
