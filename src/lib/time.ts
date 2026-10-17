/** Europe/London calendar helpers (works on server and client). */
export const TZ = "Europe/London";

export function londonParts(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), weekday: weekdays.indexOf(p.weekday as string) };
}

export const londonDate = (d = new Date()) => londonParts(d).date;

export type DayPart = "morning" | "day" | "evening";
export function dayPart(d = new Date()): DayPart {
  const h = londonParts(d).hour;
  if (h >= 4 && h < 12) return "morning";
  if (h >= 12 && h < 18) return "day";
  return "evening";
}

/** Offset (minutes) of London from UTC at a given instant. */
function londonOffset(d: Date) {
  const p = londonParts(d);
  const asUtc = Date.UTC(Number(p.date.slice(0, 4)), Number(p.date.slice(5, 7)) - 1, Number(p.date.slice(8, 10)), p.hour, p.minute);
  return Math.round((asUtc - Math.floor(d.getTime() / 60000) * 60000) / 60000);
}

/** The UTC instant for a London wall-clock time on a London date. */
export function londonTimeToUtc(date: string, hour: number, minute: number): Date {
  const guess = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hour, minute));
  return new Date(guess.getTime() - londonOffset(guess) * 60000);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function relTime(iso: string, now = new Date()): string {
  const s = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  const fut = s < 0;
  const a = Math.abs(s);
  const v = a < 60 ? "just now" : a < 3600 ? `${Math.round(a / 60)}m` : a < 86400 ? `${Math.round(a / 3600)}h` : `${Math.round(a / 86400)}d`;
  if (v === "just now") return v;
  return fut ? `in ${v}` : `${v} ago`;
}

export function fmtDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  if (!iso) return "";
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts }).format(d);
}

export function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
