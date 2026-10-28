import { describe, expect, it } from "vitest";
import { clashes, findSlots, isFree } from "@/lib/pa/slots";
import { londonTimeToUtc, fmtTime } from "@/lib/time";

const ev = (date: string, from: string, to: string, title = "Meeting", id = `${date}${from}`) => {
  const [fh, fm] = from.split(":").map(Number), [th, tm] = to.split(":").map(Number);
  return { id, title, start: londonTimeToUtc(date, fh, fm).toISOString(), end: londonTimeToUtc(date, th, tm).toISOString(), all_day: false };
};

describe("finding time", () => {
  // Thursday 29 Oct 2026, 06:30 in London; deadline "before Friday".
  const now = londonTimeToUtc("2026-10-29", 6, 30);
  const thursday = [ev("2026-10-29", "08:00", "09:00", "Calmlings book"), ev("2026-10-29", "09:00", "11:00"), ev("2026-10-29", "11:00", "12:00"), ev("2026-10-29", "13:00", "18:00", "Plush prototype"), ev("2026-10-29", "18:00", "20:30", "Meet T & Emma")];

  it("finds a real free hour before the deadline and never overlaps the diary", () => {
    const slots = findSlots({ now, events: thursday, duration: 60, category: "work", deadline: "2026-10-30" });
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(s.date).toBe("2026-10-29");
      expect(isFree(thursday, s.start, s.end)).toBe(true);
      expect(new Date(s.end).getTime() - new Date(s.start).getTime()).toBe(3600000);
    }
    // Work hours are full, so it offers the early morning and says so.
    expect(slots.some((s) => s.reason.includes("Outside work hours"))).toBe(true);
  });

  it("respects sleep, meals and the evening plans, and spreads options across days", () => {
    const slots = findSlots({ now, events: thursday, duration: 60, category: "personal" });
    for (const s of slots) {
      const h = Number(fmtTime(s.start).slice(0, 2));
      expect(h).toBeGreaterThanOrEqual(7);
      expect(Number(fmtTime(s.end).slice(0, 2)) * 60 + Number(fmtTime(s.end).slice(3))).toBeLessThanOrEqual(22 * 60);
      expect(isFree(thursday, s.start, s.end)).toBe(true);
    }
    expect(new Set(slots.map((s) => s.date)).size).toBeGreaterThan(1);
  });

  it("skips excluded times for 'find another time' and returns nothing when there's no room", () => {
    const first = findSlots({ now, events: thursday, duration: 60, category: "personal", count: 3 });
    const again = findSlots({ now, events: thursday, duration: 60, category: "personal", exclude: first });
    expect(again.some((a) => first.some((f) => f.start === a.start))).toBe(false);
    const packed = [ev("2026-10-29", "06:00", "23:59")];
    expect(findSlots({ now, events: packed, duration: 60, category: "personal", deadline: "2026-10-30" })).toEqual([]);
  });

  it("flags double bookings", () => {
    const c = clashes([ev("2026-10-29", "10:00", "11:00", "A", "a"), ev("2026-10-29", "10:30", "11:30", "B", "b"), ev("2026-10-29", "12:00", "13:00", "C", "c")]);
    expect(c).toHaveLength(1);
    expect(c[0].titles).toEqual(["A", "B"]);
  });
});
