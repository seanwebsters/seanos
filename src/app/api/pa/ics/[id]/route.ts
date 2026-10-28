import { getDb } from "@/lib/db";
import { HttpError, route } from "@/lib/api";

const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");

/** One event as an .ics file, so Sean can add it to the calendar app he uses. */
export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const e = await getDb().get("events", id);
  if (!e || e.all_day) throw new HttpError(404, "Event not found");
  const end = e.end ?? new Date(new Date(e.start).getTime() + 3600000).toISOString();
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Life HQ//EN", "BEGIN:VEVENT", `UID:${e.id}@lifehq`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${esc(e.title)}`, e.location ? `LOCATION:${esc(e.location)}` : "", "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n");
  return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${e.title.replace(/[^\w-]+/g, "_").slice(0, 40)}.ics"` } });
});
