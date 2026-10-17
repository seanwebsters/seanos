import "server-only";
import { getDb } from "@/lib/db";
import type { CalendarEvent } from "@/lib/db/types";
import { londonTimeToUtc } from "@/lib/time";

interface RawEvent { uid: string; summary: string; start: string; end: string | null; allDay: boolean; location: string; description: string; rrule: string | null }

function unfold(ics: string) {
  return ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function unescape(v: string) {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\;/g, ";").replace(/\\\\/g, "\\");
}

/** Parses an ICS date value (UTC, floating/TZID treated as London, or all-day). */
function parseDate(value: string, params: string): { iso: string; allDay: boolean } {
  if (/VALUE=DATE(?!-)/.test(params) || /^\d{8}$/.test(value)) {
    return { iso: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`, allDay: true };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return { iso: new Date(value).toISOString(), allDay: false };
  const [, y, mo, d, h, mi, s, z] = m;
  if (z) return { iso: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0))).toISOString(), allDay: false };
  return { iso: londonTimeToUtc(`${y}-${mo}-${d}`, +h, +mi).toISOString(), allDay: false };
}

export function parseIcs(ics: string): RawEvent[] {
  const out: RawEvent[] = [];
  let cur: Partial<RawEvent> | null = null;
  for (const line of unfold(ics).split("\n")) {
    if (line === "BEGIN:VEVENT") cur = { location: "", description: "", rrule: null, end: null };
    else if (line === "END:VEVENT" && cur) {
      if (cur.uid && cur.start) out.push({ summary: "(No title)", ...cur } as RawEvent);
      cur = null;
    } else if (cur) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [name, ...params] = line.slice(0, i).split(";");
      const value = line.slice(i + 1);
      const p = params.join(";");
      if (name === "UID") cur.uid = value;
      else if (name === "SUMMARY") cur.summary = unescape(value);
      else if (name === "LOCATION") cur.location = unescape(value);
      else if (name === "DESCRIPTION") cur.description = unescape(value).slice(0, 2000);
      else if (name === "RRULE") cur.rrule = value;
      else if (name === "DTSTART") {
        const d = parseDate(value, p);
        cur.start = d.iso;
        cur.allDay = d.allDay;
      } else if (name === "DTEND") cur.end = parseDate(value, p).iso;
    }
  }
  return out;
}

/** Expands simple DAILY/WEEKLY recurrences into a window. */
export function expand(events: RawEvent[], from: Date, to: Date): RawEvent[] {
  const out: RawEvent[] = [];
  for (const e of events) {
    const start = new Date(e.start);
    const dur = e.end ? new Date(e.end).getTime() - start.getTime() : 0;
    if (!e.rrule) {
      if (start <= to && (e.end ? new Date(e.end) : start) >= from) out.push(e);
      continue;
    }
    const freq = /FREQ=(DAILY|WEEKLY)/.exec(e.rrule)?.[1];
    if (!freq) continue;
    const until = /UNTIL=(\d{8})/.exec(e.rrule)?.[1];
    const untilDate = until ? new Date(`${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}T23:59:59Z`) : to;
    const interval = Number(/INTERVAL=(\d+)/.exec(e.rrule)?.[1] ?? 1);
    const step = (freq === "DAILY" ? 1 : 7) * interval * 86400000;
    for (let t = start.getTime(), n = 0; t <= Math.min(to.getTime(), untilDate.getTime()) && n < 400; t += step, n++) {
      if (t + dur < from.getTime()) continue;
      const s = new Date(t).toISOString();
      out.push({ ...e, uid: `${e.uid}#${s}`, start: e.allDay ? s.slice(0, 10) : s, end: dur ? new Date(t + dur).toISOString() : null });
    }
  }
  return out;
}

/** Imports the private ICS feed (e.g. Google Calendar "secret address in iCal format"). */
export async function syncIcs(url: string): Promise<number> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "SEAN-OS/1.0" } });
  if (!res.ok) throw new Error(`Calendar feed returned ${res.status}`);
  const from = new Date(Date.now() - 2 * 86400000);
  const to = new Date(Date.now() + 21 * 86400000);
  const events = expand(parseIcs(await res.text()), from, to);
  const db = getDb();
  const existing = await db.list("events", { where: { source: "ics" } });
  const keep = new Set<string>();
  for (const e of events) {
    const id = `ics_${Buffer.from(e.uid).toString("base64url").slice(0, 40)}`;
    keep.add(id);
    const prev = existing.find((x) => x.id === id);
    const row: CalendarEvent = { id, title: e.summary, start: e.start, end: e.end, all_day: e.allDay, location: e.location, description: e.description, source: "ics", external_id: e.uid, prep_report_id: prev?.prep_report_id ?? null };
    await db.upsert("events", row);
  }
  for (const x of existing) if (!keep.has(x.id)) await db.remove("events", x.id);
  return events.length;
}
