import "server-only";
import { getDb } from "@/lib/db";
import type { LifeAreaKey, LifeHQ, WorkProject } from "@/lib/db/types";
import { getProfile } from "@/lib/bootstrap";
import { summarise } from "@/lib/finance";
import { addDays, londonDate, londonTimeToUtc } from "@/lib/time";
import { newId, nowIso } from "@/lib/util";
import { getWeather } from "@/lib/integrations/weather";

export const AREAS: { key: LifeAreaKey; label: string; icon: string; color: string; source: "salary" | "revenue" | "savings" | "manual" }[] = [
  { key: "career", label: "Career", icon: "briefcase", color: "var(--fe-1)", source: "salary" },
  { key: "business", label: "Business", icon: "bulb", color: "var(--fe-3)", source: "revenue" },
  { key: "money", label: "Money", icon: "chart", color: "var(--fe-2)", source: "savings" },
  { key: "health", label: "Health", icon: "dumbbell", color: "var(--fe-3)", source: "manual" },
  { key: "home", label: "Home", icon: "home", color: "var(--fe-4)", source: "manual" },
  { key: "friends", label: "Friends", icon: "people", color: "var(--fe-2)", source: "manual" },
  { key: "travel", label: "Travel", icon: "plane", color: "var(--fe-1)", source: "manual" },
  { key: "reputation", label: "Reputation", icon: "stage", color: "var(--fe-2)", source: "manual" },
];

/** The life Sean described. Every value is editable in the app. */
function defaults(): LifeHQ {
  return {
    id: "me",
    vision: "A calmer, happier, more fulfilled 2027",
    quote: "Build a life you don't need a break from.",
    salary: 100000, salary_target: 160000, savings: 10000, savings_target: 50000, revenue_target: 100000,
    areas: {
      career: { statement: "VP of Creative Innovation", progress: null },
      business: { statement: "£100k annual revenue", progress: null },
      money: { statement: "£50k savings", progress: null },
      health: { statement: "Stronger, leaner, more energy", progress: null },
      home: { statement: "A calm, mature Soho home", progress: null },
      friends: { statement: "Time with the people who matter", progress: null },
      travel: { statement: "More time abroad", progress: null },
      reputation: { statement: "A recognised voice in creative innovation, AI and entertainment", progress: null },
    },
    images: {}, savings_history: {}, updated_at: nowIso(),
  };
}

const CALM_PROJECTS = ["Calmlings Game", "Calmlings Plush", "Calmlings Movie", "Goodnight, Internet", "Calm-1 for WhatsApp", "SleepStories.com"];

export async function ensureLifeHQ(): Promise<LifeHQ> {
  const db = getDb();
  let me = await db.get("life_hq", "me");
  if (!me) {
    me = defaults();
    await db.insert("life_hq", me);
    if ((await db.count("work_projects")) === 0) {
      for (const name of CALM_PROJECTS) {
        const p: WorkProject = { id: newId("wp"), name, status: "Not set", progress: null, next_action: "", image: null, notes: "", created_at: nowIso(), updated_at: nowIso() };
        await db.insert("work_projects", p);
      }
    }
  }
  return me;
}

export function isoWeek(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function ageOn(today: string, birthday: string | null | undefined, fallback: number) {
  if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return fallback;
  const [y, m, d] = birthday.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

const pct = (v: number, t: number) => (t > 0 ? Math.max(0, Math.min(1, v / t)) : 0);

export async function lifeData() {
  const db = getDb();
  const me = await ensureLifeHQ();
  const profile = await getProfile();
  const today = londonDate();
  const tomorrow = addDays(today, 1);
  const week = isoWeek(today);

  // Money: real accounts first, Sean's stated figure otherwise.
  const [txns, budgets, recurring, accounts, goals] = await Promise.all([db.list("transactions"), db.list("budgets"), db.list("recurring"), db.list("accounts"), db.list("finance_goals")]);
  const money = summarise({ today, txns, budgets, recurring, accounts, goals });
  const savingsAccounts = accounts.filter((a) => a.kind === "savings");
  const savings = savingsAccounts.length ? savingsAccounts.reduce((s, a) => s + a.balance, 0) : me.savings;
  const investments = accounts.filter((a) => ["investment", "pension"].includes(a.kind)).reduce((s, a) => s + a.balance, 0);
  const netWorth = accounts.length ? money.netWorth : savings;
  // Record this month's savings so the history line builds itself.
  const month = today.slice(0, 7);
  if (me.savings_history[month] !== savings) {
    me.savings_history = { ...me.savings_history, [month]: savings };
    await db.update("life_hq", "me", { savings_history: me.savings_history });
  }

  // Business: recorded revenue over the last 30 days, annualised, across Sean's own ventures.
  const metrics = await db.list("growth_metrics", { where: { metric: "revenue" } });
  const since = addDays(today, -29);
  const revenue30 = metrics.filter((m) => m.date >= since && m.date <= today).reduce((s, m) => s + m.value, 0);
  const arr = revenue30 * 12;
  const ventures = (await db.list("ventures")).filter((v) => v.stage !== "archived" && !v.merged_into);
  const users = Math.max(0, ...(await db.list("growth_metrics", { where: { metric: "active_users" } })).map((m) => m.value));
  const installs = (await db.list("growth_metrics", { where: { metric: "installs" } })).reduce((s, m) => s + m.value, 0);
  const stageAt = (stages: string[]) => ventures.some((v) => stages.includes(v.stage));
  const journey = [
    { label: "Validate and choose idea", done: stageAt(["validating", "building", "launched"]) },
    { label: "Build MVP", done: stageAt(["building", "launched"]) },
    { label: "Launch publicly", done: stageAt(["launched"]) },
    { label: "Get first 1,000 users", done: Math.max(users, installs) >= 1000 },
    { label: `Reach £${Math.round(me.revenue_target / 1000)}k annual revenue`, done: arr >= me.revenue_target },
  ];

  const areas = AREAS.map((a) => {
    const set = me.areas[a.key] ?? { statement: "", progress: null };
    const progress = a.source === "salary" ? pct(me.salary, me.salary_target) : a.source === "revenue" ? pct(arr, me.revenue_target) : a.source === "savings" ? pct(savings, me.savings_target) : set.progress === null ? null : set.progress / 100;
    const basis = a.source === "salary" ? `£${Math.round(me.salary / 1000)}k of £${Math.round(me.salary_target / 1000)}k salary` : a.source === "revenue" ? `£${Math.round(arr).toLocaleString("en-GB")} annualised from recorded revenue` : a.source === "savings" ? `£${Math.round(savings).toLocaleString("en-GB")} of £${Math.round(me.savings_target / 1000)}k${savingsAccounts.length ? " (from your accounts)" : ""}` : set.progress === null ? "Not rated yet" : "Your own rating";
    return { ...a, statement: set.statement, progress, basis, manual: a.source === "manual" };
  });

  // Upcoming: real calendar events and dated items.
  const events = await db.list("events", { orderBy: { column: "start", ascending: true } });
  const dayStart = (d: string) => londonTimeToUtc(d, 0, 0).toISOString();
  const on = (d: string) => events.filter((e) => (e.all_day ? e.start.slice(0, 10) === d : e.start >= dayStart(d) && e.start < dayStart(addDays(d, 1))));
  const items = await db.list("hq_items");
  const vtasks = (await db.list("venture_tasks")).filter((t) => t.status !== "done" && t.due);
  const upcoming = [today, tomorrow].map((d) => ({
    date: d,
    events: on(d),
    items: items.filter((i) => i.section === "tasks" && i.date === d),
    ventureTasks: vtasks.filter((t) => t.due === d).map((t) => ({ ...t, venture: ventures.find((v) => v.id === t.venture_id)?.name ?? "" })),
  }));

  const workouts = (await db.list("life", { where: { kind: "workout" } })).filter((w) => w.date >= addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7)));
  const journal = (await db.list("journal", { where: { date: today } }))[0] ?? null;

  return {
    me, profile, today, week, weather: await getWeather(profile.home_lat, profile.home_lng),
    age: ageOn(today, profile.birthday, profile.age ?? 24),
    priorities: (await db.list("week_priorities", { where: { week } })).sort((a, b) => a.rank - b.rank),
    upcoming, areas,
    projects: (await db.list("work_projects")).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    journey, arr, ventures: ventures.length,
    money: { savings, investments, netWorth, income: money.incomeThisMonth, spend: money.spendThisMonth, net: money.net, history: me.savings_history, hasAccounts: accounts.length > 0, hasTxns: txns.length > 0 },
    sections: Object.fromEntries((["health", "home", "friends", "travel", "reputation", "vision"] as const).map((k) => [k, items.filter((i) => i.section === k).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))])),
    workoutsThisWeek: workouts.length,
    journal,
    wins: (await db.list("wins")).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6),
  };
}

export type LifeData = Awaited<ReturnType<typeof lifeData>>;
export const JOURNAL_PROMPTS = ["How am I feeling?", "What went well today?", "What's on my mind?", "What am I grateful for?", "What needs to change?"];
