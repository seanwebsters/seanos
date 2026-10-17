import type { Automation } from "@/lib/db/types";
import { addDays, londonParts, londonTimeToUtc } from "@/lib/time";

/** Next London wall-clock occurrence of an automation after `from`. */
export function nextRunAt(a: Pick<Automation, "cadence" | "weekday" | "hour" | "minute">, from = new Date()): Date {
  const today = londonParts(from).date;
  for (let i = 0; i < 8; i++) {
    const date = addDays(today, i);
    if (a.cadence === "weekly" && a.weekday !== null) {
      const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (wd !== a.weekday) continue;
    }
    const at = londonTimeToUtc(date, a.hour, a.minute);
    if (at.getTime() > from.getTime()) return at;
  }
  return londonTimeToUtc(addDays(today, 7), a.hour, a.minute);
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function describeSchedule(a: Pick<Automation, "cadence" | "weekday" | "hour" | "minute">) {
  const t = `${String(a.hour).padStart(2, "0")}:${String(a.minute).padStart(2, "0")}`;
  return a.cadence === "daily" ? `Every day at ${t}` : `${WEEKDAYS[a.weekday ?? 1]}s at ${t}`;
}
