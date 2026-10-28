import { describe, expect, it } from "vitest";
import { setup } from "./helpers";
import { POST as create } from "@/app/api/entity/[table]/route";
import { PATCH as patch, DELETE as remove } from "@/app/api/entity/[table]/[id]/route";
import { ageOn, isoWeek, lifeData } from "@/lib/life/core";
import { londonDate } from "@/lib/time";
import { newId, nowIso } from "@/lib/util";

const req = (b: unknown, method = "POST") => new Request("http://x", { method, body: JSON.stringify(b) });
const p = <T,>(x: T) => ({ params: Promise.resolve(x) });

describe("LIFE HQ", () => {
  it("seeds Sean's numbers and Calm projects, and computes progress from real data only", async () => {
    const { db } = await setup(() => ({}));
    let d = await lifeData();
    expect(d.projects.map((x) => x.name)).toEqual(["Calmlings Game", "Calmlings Plush", "Calmlings Movie", "Goodnight, Internet", "Calm-1 for WhatsApp", "SleepStories.com"]);
    expect(d.projects.every((x) => x.status === "Not set" && x.progress === null)).toBe(true);
    const by = Object.fromEntries(d.areas.map((a) => [a.key, a]));
    expect(by.career.progress).toBeCloseTo(100000 / 160000);
    expect(by.money.progress).toBeCloseTo(0.2);
    expect(by.business.progress).toBe(0);
    // Unrated areas stay unrated: no invented percentages.
    expect(by.health.progress).toBeNull();
    expect(d.journey.every((j) => !j.done)).toBe(true);
    expect(d.wins).toEqual([]);

    // Real accounts override the stated savings figure; recorded revenue drives Business.
    await db.insert("accounts", { id: "acc1", name: "Marcus", kind: "savings", balance: 12500, currency: "GBP", updated_at: nowIso() });
    const v = (await db.list("ventures")).find((x) => x.name === "BandApp")!;
    await db.insert("growth_metrics", { id: newId("gm"), venture_id: v.id, date: londonDate(), metric: "revenue", value: 1000, source: "manual", note: "", created_at: nowIso() });
    await db.update("ventures", v.id, { stage: "building" });
    d = await lifeData();
    const by2 = Object.fromEntries(d.areas.map((a) => [a.key, a]));
    expect(by2.money.progress).toBeCloseTo(0.25);
    expect(by2.business.progress).toBeCloseTo(12000 / 100000);
    expect(d.journey.slice(0, 3).map((j) => j.done)).toEqual([true, true, false]);
    expect(d.me.savings_history[londonDate().slice(0, 7)]).toBe(12500);
  });

  it("saves priorities, checklists, ratings, wins and journal entries", async () => {
    const { db } = await setup(() => ({}));
    await lifeData();
    const week = isoWeek(londonDate());
    const pr = (await (await create(req({ week, rank: 1, title: "Prep for the offsite", tag: "Work" }), p({ table: "week_priorities" }))).json()).row;
    await patch(req({ done: true }, "PATCH"), p({ table: "week_priorities", id: pr.id }));
    const item = (await (await create(req({ section: "home", title: "Fix shower leak" }), p({ table: "hq_items" }))).json()).row;
    expect(item.section).toBe("home");
    await (await create(req({ section: "nonsense", title: "x" }), p({ table: "hq_items" }))).json();
    await patch(req({ areas: { ...(await db.get("life_hq", "me"))!.areas, health: { statement: "Stronger", progress: 70 } } }, "PATCH"), p({ table: "life_hq", id: "me" }));
    await create(req({ title: "First version of the game launched", area: "Career" }), p({ table: "wins" }));
    await create(req({ answers: { "How am I feeling?": "Good" } }), p({ table: "journal" }));
    const d = await lifeData();
    expect(d.priorities[0]).toMatchObject({ title: "Prep for the offsite", done: true });
    expect(d.sections.home.map((x) => x.title)).toEqual(["Fix shower leak"]);
    expect((await db.list("hq_items")).find((x) => x.title === "x")!.section).toBe("tasks");
    expect(d.areas.find((a) => a.key === "health")!.progress).toBeCloseTo(0.7);
    expect(d.wins[0].title).toContain("game");
    expect(d.journal!.answers["How am I feeling?"]).toBe("Good");
    await remove(req({}, "DELETE"), p({ table: "hq_items", id: item.id }));
    expect((await lifeData()).sections.home).toEqual([]);
  });

  it("works out age and ISO weeks", () => {
    expect(ageOn("2026-10-28", "2002-03-10", 0)).toBe(24);
    expect(ageOn("2026-10-28", "2002-11-10", 0)).toBe(23);
    expect(ageOn("2026-10-28", null, 24)).toBe(24);
    expect(isoWeek("2026-10-28")).toBe("2026-W44");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
  });
});
