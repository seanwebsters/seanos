import { afterEach, describe, expect, it } from "vitest";
import { setup, src } from "./helpers";
import { createTask, runTask, runAutomations } from "@/lib/engine";
import { setTransport } from "@/lib/ai/llm";
import { RetryableError } from "@/lib/ai/errors";
import { buildContext } from "@/lib/ai/context";
import { parseIcs, expand } from "@/lib/integrations/calendar";
import { nextRunAt } from "@/lib/engine/schedule";

afterEach(() => setTransport(null));

const story = (section: string, headline: string, url: string) => ({ section, headline, dek: "d", what: "w", why: "y", implications: "i", ideas: ["x"], topics: ["ai"], sources: [src(url)] });

describe("newsroom", () => {
  it("publishes an edition with only verified stories", async () => {
    const { db } = await setup((req, text) => {
      if (text.includes("Research and write today's stories")) {
        return { stories: [story("AI & Creative Technology", "Real story", "https://theverge.com/ai/1/"), story("London", "Made up", "https://fake.example/nope")] };
      }
      return { title: "Edition", standfirst: "s", big_idea: "b", for_me: "f" };
    });
    const t = await createTask({ title: "Edition", kind: "edition" });
    const done = await runTask(t.id);
    expect(done.status).toBe("completed");
    const stories = await db.list("stories");
    expect(stories.map((s) => s.headline)).toEqual(["Real story", "Real story", "Real story"].slice(0, stories.length));
    expect(stories.every((s) => s.headline !== "Made up")).toBe(true);
    const ed = (await db.list("editions"))[0];
    expect(ed.status).toBe("ready");
    expect(done.cost_cents).toBeGreaterThan(0);
    expect((await db.list("task_steps", { where: { task_id: t.id } })).every((s) => s.status === "done")).toBe(true);
  });
});

describe("engine", () => {
  it("blocks with a clear reason when no API key is configured", async () => {
    const { db } = await setup(() => ({}));
    setTransport(null);
    const t = await createTask({ title: "Research", kind: "research_report", instruction: "Research AI animation" });
    const done = await runTask(t.id);
    expect(done.status).toBe("blocked");
    expect(done.blocked_on).toBe("ANTHROPIC_API_KEY");
    expect((await db.list("notifications")).some((n) => n.title.startsWith("Blocked"))).toBe(true);
  });

  it("retries transient failures with backoff and resumes finished steps", async () => {
    let n = 0;
    const { db } = await setup((req, text) => {
      if (text.includes("Planning") || text.includes("Plan the work")) return { title: "Market", objective: "o", recurrence: null, steps: [{ agent: "research", capability: "research", instruction: "Research the AI animation market", count: null, focus: null }] };
      n++;
      if (n === 1) throw new RetryableError("flaky");
      return { title: "AI animation", summary: "sum", body: "## Body", slides: [], image_prompts: [], sources: [src("https://www.ft.com/content/abc"), src("https://invented.example/x")] };
    });
    const t = await createTask({ title: "Research the AI animation market", kind: "freeform", instruction: "Research the AI animation market" });
    const first = await runTask(t.id);
    expect(first.status).toBe("queued");
    expect(new Date(first.scheduled_for).getTime()).toBeGreaterThan(Date.now());
    const second = await runTask(t.id);
    expect(second.status).toBe("completed");
    const reps = await db.list("reports");
    expect(reps).toHaveLength(1);
    expect(reps[0].sources.map((s) => s.url)).toEqual(["https://www.ft.com/content/abc"]);
    const steps = await db.list("task_steps", { where: { task_id: t.id } });
    expect(steps.filter((s) => s.title.includes("planning"))).toHaveLength(1);
  });

  it("creates a recurring automation when asked", async () => {
    const { db } = await setup((req, text) =>
      text.includes("Plan the work")
        ? { title: "Weekly partners", objective: "o", recurrence: { cadence: "weekly", weekday: 1, hour: 8, minute: 0 }, steps: [{ agent: "research", capability: "write", instruction: "List", count: null, focus: null }] }
        : { title: "Doc", summary: "s", body: "b", slides: [], image_prompts: [], sources: [] },
    );
    const t = await createTask({ title: "Every Monday, find me new partnership opportunities", kind: "freeform" });
    await runTask(t.id);
    expect((await db.list("automations")).some((a) => a.workflow === "freeform" && a.weekday === 1)).toBe(true);
  });

  it("enforces the daily budget", async () => {
    const { db } = await setup(() => ({ title: "x", summary: "s", body: "b", slides: [], image_prompts: [], sources: [] }));
    await db.update("settings", "app", { daily_budget_cents: 0 });
    const t = await createTask({ title: "r", kind: "research_report" });
    const done = await runTask(t.id);
    expect(done.status).toBe("blocked");
    expect(done.blocked_on).toBe("budget");
  });

  it("only runs automations when Autopilot is on", async () => {
    const { db } = await setup(() => ({}));
    const autos = await db.list("automations");
    for (const a of autos) await db.update("automations", a.id, { next_run_at: new Date(Date.now() - 1000).toISOString() });
    expect(await runAutomations()).toBe(0);
    await db.update("settings", "app", { autopilot: true });
    // Life HQ briefings start switched off.
    expect(await runAutomations()).toBe(autos.filter((a) => a.enabled).length);
    expect(autos.find((a) => a.workflow === "pa_briefing")!.enabled).toBe(false);
    expect(await runAutomations()).toBe(0);
  });

  it("runs a Life HQ briefing Sean switched on, even with Autopilot off", async () => {
    const { db } = await setup(() => ({}));
    const b = (await db.list("automations")).find((a) => a.workflow === "pa_briefing")!;
    await db.update("automations", b.id, { enabled: true, next_run_at: new Date(Date.now() - 1000).toISOString() });
    expect(await runAutomations()).toBe(1);
  });
});

describe("privacy", () => {
  it("keeps Calm work memory away from public-content agents", async () => {
    const { db } = await setup(() => ({}));
    await db.insert("memories", { id: "m1", category: "Calm", content: "Confidential: unannounced Calmlings film slate", kind: "fact", scope: "work", source: "user", provenance: null, confidence: 1, pinned: false, created_at: "2026-01-01", updated_at: "2099-01-01" });
    const brand = await buildContext("brand");
    const partner = await buildContext("partnerships");
    expect(brand).not.toContain("unannounced");
    expect(partner).toContain("unannounced");
  });
});

describe("opportunities", () => {
  it("drops speaking events with passed deadlines and unverified sources", async () => {
    const ev = (name: string, deadline: string | null, url: string, cfp = "open") => ({ name, kind: "conference", location: "London", start_date: "2099-03-01", end_date: null, organiser: "o", audience: "a", size: null, fit: "f", talk_titles: ["t"], cfp_status: cfp, deadline, submission_url: url, contacts: [], networking: "n", next_action: "apply", sources: [src(url)] });
    const { db } = await setup(() => ({ events: [ev("Good", "2099-01-01", "https://example-conf.com/speak"), ev("Late", "2001-01-01", "https://example-conf.com/speak"), ev("Rolling", "2001-01-01", "https://example-conf.com/speak", "rolling"), ev("Fake", null, "https://nope.example/x")] }));
    const t = await createTask({ title: "Speaking", kind: "speaking_scan" });
    await runTask(t.id);
    const names = (await db.list("speaking")).map((s) => s.name).sort();
    expect(names).toEqual(["Good", "Rolling"]);
  });

  it("dedupes trends and caps momentum without measured evidence", async () => {
    const trend = { title: "AI companions for kids", category: "AI", region: "US", what: "w", evidence: [{ claim: "c", kind: "anecdotal", source_url: "https://www.theverge.com/ai/1", date: null }], why: "y", drivers: [], maturity: "emerging", momentum: 5, opportunity_score: 8, prediction: "p", relevance: "r", opportunities: [], calm_applications: [], sources: [src("https://www.theverge.com/ai/1")] };
    const { db } = await setup(() => ({ trends: [trend] }));
    await runTask((await createTask({ title: "Trends", kind: "trend_scan" })).id);
    await runTask((await createTask({ title: "Trends", kind: "trend_scan" })).id);
    const rows = await db.list("trends");
    expect(rows).toHaveLength(1);
    expect(rows[0].momentum).toBe(3);
    expect(rows[0].seen_count).toBe(2);
  });
});

describe("calendar & schedule", () => {
  it("parses ICS with weekly recurrence", () => {
    const ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:1\nSUMMARY:Standup\nDTSTART:20991006T090000Z\nDTEND:20991006T093000Z\nRRULE:FREQ=WEEKLY\nEND:VEVENT\nBEGIN:VEVENT\nUID:2\nSUMMARY:Holiday\nDTSTART;VALUE=DATE:20991007\nEND:VEVENT\nEND:VCALENDAR";
    const evs = parseIcs(ics);
    expect(evs).toHaveLength(2);
    expect(evs[1].allDay).toBe(true);
    const ex = expand(evs, new Date("2099-10-05T00:00:00Z"), new Date("2099-10-21T00:00:00Z"));
    expect(ex.filter((e) => e.summary === "Standup")).toHaveLength(3);
  });

  it("computes the next London run", () => {
    const at = nextRunAt({ cadence: "daily", weekday: null, hour: 5, minute: 30 }, new Date("2026-07-01T10:00:00Z"));
    expect(at.toISOString()).toBe("2026-07-02T04:30:00.000Z");
    const w = nextRunAt({ cadence: "weekly", weekday: 1, hour: 9, minute: 0 }, new Date("2026-12-02T10:00:00Z"));
    expect(w.toISOString()).toBe("2026-12-07T09:00:00.000Z");
  });
});

import { categorise, parseBankCsv, summarise, advance } from "@/lib/finance";

describe("finance", () => {
  it("parses a Monzo-style CSV with signed amounts and categories", () => {
    const csv = `Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency\ntx1,14/10/2026,09:12,Card payment,Pret A Manger,,eating_out,-4.50,GBP\ntx2,15/10/2026,10:00,Faster payment,CALM STUDIOS LTD,,income,"2,500.00",GBP`;
    const { rows } = parseBankCsv(csv);
    expect(rows).toEqual([
      { date: "2026-10-14", description: "Pret A Manger", amount: -4.5, category: "Eating out" },
      { date: "2026-10-15", description: "CALM STUDIOS LTD", amount: 2500, category: "Income" },
    ]);
  });

  it("parses paid-in / paid-out columns", () => {
    const csv = `Date,Description,Paid out,Paid in,Balance\n01/10/2026,TFL TRAVEL CHARGE,7.80,,100\n02/10/2026,REFUND,,12.00,112`;
    const { rows } = parseBankCsv(csv);
    expect(rows.map((r) => r.amount)).toEqual([-7.8, 12]);
    expect(categorise(rows[0].description, rows[0].amount)).toBe("Transport");
  });

  it("summarises budgets, subscriptions and net worth", () => {
    const t = (id: string, date: string, amount: number, category: string) => ({ id, date, description: id, amount, category, account_id: null, source: "manual" as const, import_hash: null, notes: "", created_at: "" });
    const s = summarise({
      today: "2026-10-15",
      txns: [t("a", "2026-10-02", -120, "Eating out"), t("b", "2026-10-03", 3000, "Income"), t("c", "2026-10-04", -500, "Transfers"), t("d", "2026-09-04", -80, "Eating out")],
      budgets: [{ id: "Eating out", monthly_limit: 100, updated_at: "" }],
      recurring: [{ id: "r", name: "Spotify", amount: 11.99, kind: "subscription", cadence: "monthly", next_date: "2026-10-20", category: "Subscriptions", active: true, created_at: "" }],
      accounts: [{ id: "x", name: "Current", kind: "current", balance: 2000, currency: "GBP", updated_at: "" }, { id: "y", name: "Amex", kind: "credit", balance: -300, currency: "GBP", updated_at: "" }],
      goals: [],
    });
    expect(s.spendThisMonth).toBe(120);
    expect(s.budgetRows[0].over).toBe(true);
    expect(s.upcoming).toHaveLength(1);
    expect(s.netWorth).toBe(1700);
    expect(s.months.at(-2)!.spend).toBe(80);
    expect(advance("2026-01-31", "monthly")).toBe("2026-03-03");
  });
});

import { simulate, sensitivity, defaultRanges, normalise } from "@/lib/future/model";

describe("future engine model", () => {
  it("simulates cash flow, break-even and sensitivity", () => {
    const a = { months: 12, launch_month: 2, upfront_cost: 2000, monthly_cost: 500, hours_per_week: 10, price: 20, start_customers: 10, new_customers_per_month: 20, acquisition_growth: 0, churn_rate: 0, other_monthly_income: 0, opportunity_cost_per_month: 100 };
    const o = simulate(a);
    expect(o.rows).toHaveLength(12);
    expect(o.rows[0].cumulative).toBe(-2500);
    expect(o.rows[1].customers).toBe(10);
    expect(o.rows[2].customers).toBe(30);
    expect(o.mrr_end).toBe((10 + 20 * 10) * 20);
    expect(o.break_even_month).not.toBeNull();
    expect(o.net_after_opportunity).toBe(o.cumulative_net - 1200);
    const s = sensitivity(a, defaultRanges(normalise(a)));
    expect(s[0].swing).toBeGreaterThanOrEqual(s[1].swing);
    expect(["price", "new_customers_per_month", "launch_month"]).toContain(s[0].key);
    expect(s.find((x) => x.key === "hours_per_week")!.swing).toBe(0);
  });
});

import { runModel, emptyDrivers } from "@/lib/founder/finmodel";
import { simulateRound, sellPercent } from "@/lib/founder/captable";

describe("founder finance engine", () => {
  const base = () => {
    const drivers = emptyDrivers().map((d) => ({ ...d, value: ({ launch_month: 2, sub_price: 10, sub_start: 100, sub_organic_new: 50, sub_churn: 5, payment_fees_pct: 10, ai_cost_per_user: 1, cac: 20, marketing_budget: 200 } as Record<string, number>)[d.key] ?? d.value }));
    return { currency: "GBP" as const, fx: { gbp_usd: 1.3, as_of: "2026-10-01", source: "test" }, start: "2026-11", months: 12, starting_cash: 5000, streams: { subscription: true }, drivers, opex: [{ name: "Tools", monthly: 300, start_month: 1, growth_pct: 0 }], team: [{ role: "Contractor", monthly_cost: 1000, start_month: 3 }], funding: [], scenarios: { upside: { sub_organic_new: 100 }, downside: { sub_churn: 12 } }, actuals: [], startup_costs: [{ item: "Brand", amount: 1500, basis: "estimate" as const }] };
  };
  it("computes revenue, unit economics and funding need with stated formulas", () => {
    const o = runModel(base());
    expect(o.months[0].revenue_total).toBe(0);
    expect(o.months[1].subscribers).toBe(100);
    expect(o.months[2].subscribers).toBeCloseTo(100 * 0.95 + 50 + 10, 6);
    expect(o.months[1].revenue.subscription).toBe(1000);
    expect(o.months[1].cogs).toBeCloseTo(100 + 100, 6);
    expect(o.months[0].ebitda).toBe(-300 - 1500);
    expect(o.kpis.ltv).toBeCloseTo((10 * 0.9 - 1) / 0.05, 6);
    expect(o.kpis.ltv_cac).toBeCloseTo(160 / 20, 6);
    expect(o.kpis.payback_months).toBeCloseTo(20 / 8, 6);
    const up = runModel(base(), "upside"), down = runModel(base(), "downside");
    expect(up.kpis.revenue_y1).toBeGreaterThan(o.kpis.revenue_y1);
    expect(down.kpis.revenue_y1).toBeLessThan(o.kpis.revenue_y1);
  });
  it("models dilution with an option-pool shuffle", () => {
    const r = simulateRound([{ name: "Sean", kind: "founder", shares: 1_000_000 }], 1_700_000, 300_000, 10);
    expect(r.post_money).toBe(2_000_000);
    expect(r.investor_pct).toBeCloseTo(0.15, 9);
    const sean = r.holders.find((h) => h.name === "Sean")!;
    expect(sean.after_pct).toBeCloseTo(0.75, 6);
    expect(r.holders.find((h) => h.kind === "pool")!.after_pct).toBeCloseTo(0.1, 6);
    expect(r.price_per_share * r.new_investor_shares).toBeCloseTo(300_000, 3);
    expect(sellPercent(15, 300_000)).toEqual({ post_money: 2_000_000, pre_money: 1_700_000, investor_pct: 0.15 });
  });
});
