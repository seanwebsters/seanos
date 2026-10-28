/**
 * Finding time. Pure functions over the real diary: no model decides when
 * Sean is free. Works in Europe/London wall-clock time.
 */
import type { CalendarEvent, Routine } from "@/lib/db/types";
import { addDays, londonParts, londonTimeToUtc } from "@/lib/time";

export const DEFAULT_ROUTINE: Routine = { wake: "07:00", sleep: "23:00", work_start: "09:00", work_end: "18:00", work_days: [1, 2, 3, 4, 5], lunch: "12:30", dinner: "19:00" };

export type Category = "work" | "personal" | "business";
export interface Slot { start: string; end: string; date: string; reason: string; score: number }
interface Iv { s: number; e: number; title?: string }

const hm = (t: string) => { const [h, m] = t.split(":").map(Number); return { h: h || 0, m: m || 0 }; };
const at = (date: string, t: string, plusMin = 0) => { const { h, m } = hm(t); return londonTimeToUtc(date, h, m).getTime() + plusMin * 60000; };
const MIN = 60000;

/** Busy intervals from timed events (all-day events don't block time). */
export function busyFrom(events: Pick<CalendarEvent, "start" | "end" | "all_day" | "title">[]): Iv[] {
  return events.filter((e) => !e.all_day && e.start.length > 10).map((e) => {
    const s = new Date(e.start).getTime();
    const end = e.end ? new Date(e.end).getTime() : s + 60 * MIN;
    return { s, e: Math.max(end, s + 15 * MIN), title: e.title };
  });
}

function subtract(windows: Iv[], blocks: Iv[]): Iv[] {
  let out = windows;
  for (const b of blocks) {
    const next: Iv[] = [];
    for (const w of out) {
      if (b.e <= w.s || b.s >= w.e) { next.push(w); continue; }
      if (b.s > w.s) next.push({ s: w.s, e: b.s });
      if (b.e < w.e) next.push({ s: b.e, e: w.e });
    }
    out = next;
  }
  return out;
}

/** Where a task of this kind can sensibly go on a given day. */
function windowsFor(date: string, weekday: number, r: Routine, category: Category): { iv: Iv; label: string }[] {
  const workday = r.work_days.includes(weekday);
  if (category === "work") return workday ? [{ iv: { s: at(date, r.work_start), e: at(date, r.work_end) }, label: "work" }] : [];
  if (!workday) return [{ iv: { s: Math.max(at(date, r.wake, 90), at(date, "09:00")), e: at(date, r.sleep, -60) }, label: "weekend" }];
  return [
    { iv: { s: at(date, r.wake, 30), e: at(date, r.work_start, -15) }, label: "before work" },
    { iv: { s: at(date, r.work_end, 30), e: at(date, r.sleep, -60) }, label: "evening" },
  ];
}

export function findSlots(o: {
  now: Date; events: Pick<CalendarEvent, "start" | "end" | "all_day" | "title">[]; routine?: Routine; duration: number; category: Category;
  deadline?: string | null; earliest?: string | null; exclude?: { start: string; end: string }[]; count?: number; horizonDays?: number;
}): Slot[] {
  const r = o.routine ?? DEFAULT_ROUTINE;
  const dur = Math.max(15, Math.round(o.duration)) * MIN;
  const today = londonParts(o.now).date;
  const busy = busyFrom(o.events);
  const buffer = busy.map((b) => ({ s: b.s - 10 * MIN, e: b.e + 10 * MIN, title: b.title }));
  const excluded = (o.exclude ?? []).map((x) => ({ s: new Date(x.start).getTime(), e: new Date(x.end).getTime() }));
  const earliestMs = Math.ceil((o.now.getTime() + 30 * MIN) / (30 * MIN)) * 30 * MIN;
  const lastDay = o.deadline ? addDays(o.deadline, -1) : addDays(today, (o.horizonDays ?? 14) - 1);
  const candidates: Slot[] = [];
  for (let d = o.earliest && o.earliest > today ? o.earliest : today; d <= lastDay; d = addDays(d, 1)) {
    const weekday = new Date(`${d}T12:00:00Z`).getUTCDay();
    const dayBusy = busy.filter((b) => b.s >= at(d, "00:00") && b.s < at(addDays(d, 1), "00:00"));
    const load = dayBusy.reduce((s, b) => s + (b.e - b.s), 0) / MIN;
    // Don't pile more onto a day that's already full; a heavy day only counts against a slot.
    if (load + dur / MIN > 13 * 60) continue;
    const heavy = load + dur / MIN > 9 * 60;
    const meals = [{ s: at(d, r.lunch), e: at(d, r.lunch, 60) }, { s: at(d, r.dinner), e: at(d, r.dinner, 60) }];
    for (const w of windowsFor(d, weekday, r, o.category)) {
      const free = subtract([{ s: Math.max(w.iv.s, earliestMs), e: w.iv.e }], [...buffer, ...meals, ...excluded]);
      for (const f of free) {
        for (let s = Math.ceil(f.s / (30 * MIN)) * 30 * MIN; s + dur <= f.e; s += 30 * MIN) {
          const startHour = londonParts(new Date(s)).hour;
          let score = 100 - load / 30;
          let reason = "";
          const before = dayBusy.filter((b) => b.e <= s).sort((a, b) => b.e - a.e)[0];
          const later = dayBusy.filter((b) => b.s >= s + dur);
          if (w.label === "before work") { score += o.category === "personal" ? 4 : 8; reason = later.length >= 3 ? "High focus time (before a busy day)" : "Quiet start before work"; }
          else if (w.label === "weekend") { score += startHour < 13 ? 10 : 4; reason = "Good focus time, no conflicts"; }
          else if (w.label === "work") { score += startHour < 12 ? 8 : 2; reason = startHour < 12 ? "Morning focus time between meetings" : "Free gap in your working day"; }
          else {
            score -= startHour >= 21 ? 14 : 4;
            reason = before && s - before.e < 3 * 60 * MIN && before.e > at(d, r.work_end) ? `After ${before.title || "your plans"}, might be late` : startHour >= 21 ? "Late evening, keep it light" : "Free evening slot";
          }
          if (d === today && s - o.now.getTime() < 2 * 60 * MIN) score -= 10;
          if (heavy) { score -= 20; reason = `${reason} · Full day`; }
          if (o.deadline) score += Math.min(6, Math.max(0, (new Date(`${o.deadline}T00:00:00Z`).getTime() - new Date(`${d}T00:00:00Z`).getTime()) / 86400000 - 1) * 2);
          candidates.push({ start: new Date(s).toISOString(), end: new Date(s + dur).toISOString(), date: d, reason, score });
        }
      }
    }
  }
  // Work that won't fit in working hours can still go early or late, flagged as such.
  if (o.category === "work") {
    for (const c of findSlots({ ...o, category: "personal", count: 6 })) candidates.push({ ...c, score: c.score - 15, reason: `Outside work hours · ${c.reason}` });
  }
  // Best first, spread out: at most two per day and never back to back.
  const picked: Slot[] = [];
  for (const c of candidates.sort((a, b) => b.score - a.score || a.start.localeCompare(b.start))) {
    const sameDay = picked.filter((p) => p.date === c.date);
    if (sameDay.length >= 2) continue;
    if (sameDay.some((p) => Math.abs(new Date(p.start).getTime() - new Date(c.start).getTime()) < 3 * 60 * MIN)) continue;
    picked.push(c);
    if (picked.length >= (o.count ?? 3)) break;
  }
  return picked.sort((a, b) => a.start.localeCompare(b.start));
}

/** Overlapping timed events, for "you're double-booked" warnings. */
export function clashes(events: Pick<CalendarEvent, "id" | "start" | "end" | "all_day" | "title">[]) {
  const timed = events.filter((e) => !e.all_day && e.start.length > 10).map((e) => ({ e, s: new Date(e.start).getTime(), end: e.end ? new Date(e.end).getTime() : new Date(e.start).getTime() + 60 * MIN })).sort((a, b) => a.s - b.s);
  const out: { a: string; b: string; at: string; titles: [string, string] }[] = [];
  for (let i = 0; i < timed.length; i++) for (let j = i + 1; j < timed.length && timed[j].s < timed[i].end; j++) out.push({ a: timed[i].e.id, b: timed[j].e.id, at: timed[j].e.start, titles: [timed[i].e.title, timed[j].e.title] });
  return out;
}

export function isFree(events: Pick<CalendarEvent, "start" | "end" | "all_day" | "title">[], start: string, end: string) {
  const s = new Date(start).getTime(), e = new Date(end).getTime();
  return !busyFrom(events).some((b) => b.s < e && b.e > s);
}
