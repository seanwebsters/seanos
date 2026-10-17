import "server-only";
import { getDb } from "@/lib/db";
import { getProfile, getSettings } from "@/lib/bootstrap";
import { env } from "@/lib/env";
import { addDays, dayPart, londonDate, londonTimeToUtc } from "@/lib/time";
import { getWeather } from "@/lib/integrations/weather";
import { budgetStatus } from "@/lib/ai/llm";

export async function homeData() {
  const db = getDb();
  const today = londonDate();
  const part = dayPart();
  const [profile, settings] = await Promise.all([getProfile(), getSettings()]);
  const dayStart = londonTimeToUtc(today, 0, 0).toISOString();
  const tomorrow = addDays(today, 1);
  const tomorrowStart = londonTimeToUtc(tomorrow, 0, 0).toISOString();
  const tomorrowEnd = londonTimeToUtc(addDays(today, 2), 0, 0).toISOString();
  const overnightSince = londonTimeToUtc(addDays(today, -1), 18, 0).toISOString();

  const [edition] = await db.list("editions", { where: { status: "ready" }, orderBy: { column: "date", ascending: false }, limit: 1 });
  const stories = edition ? await db.list("stories", { where: { edition_id: edition.id }, orderBy: { column: "position", ascending: true } }) : [];
  const [briefing] = await db.list("briefings", { orderBy: { column: "date", ascending: false }, limit: 1 });
  const todaysBriefing = briefing?.date === today ? briefing : null;
  const events = await db.list("events", { orderBy: { column: "start", ascending: true } });
  const todayEvents = events.filter((e) => (e.all_day ? e.start === today : e.start >= dayStart && e.start < tomorrowStart));
  const tomorrowEvents = events.filter((e) => (e.all_day ? e.start === tomorrow : e.start >= tomorrowStart && e.start < tomorrowEnd));
  const tasks = await db.list("tasks", { orderBy: { column: "updated_at", ascending: false } });
  const active = tasks.filter((t) => ["queued", "running", "blocked", "paused"].includes(t.status));
  const completedRecent = tasks.filter((t) => (t.status === "completed" || t.status === "awaiting_approval") && (t.completed_at ?? "") >= (part === "evening" ? dayStart : overnightSince));
  const approvals = await db.list("approvals", { where: { status: "pending" }, orderBy: { column: "created_at", ascending: false } });
  const drafts = (await db.list("drafts", { where: { status: "awaiting_approval" }, orderBy: { column: "created_at", ascending: false } })).slice(0, 6);
  const people = await db.list("people", { where: { daily_pick_date: today } });
  const fallbackPeople = people.length ? people : (await db.list("people", { where: { status: ["suggested", "saved"] }, orderBy: { column: "discovered_at", ascending: false }, limit: 3 }));
  const [outfit] = await db.list("outfits", { where: { date: today } });
  const wardrobe = outfit ? await db.list("wardrobe") : [];
  const experiences = await db.list("experiences", { where: { status: ["new", "saved"] }, orderBy: { column: "discovered_at", ascending: false }, limit: 8 });
  const picks = todaysBriefing?.opportunity_picks ?? briefing?.opportunity_picks ?? null;
  const pick = async <T,>(table: "trends" | "ideas" | "people" | "speaking" | "partnerships", id: string | null | undefined) => (id ? ((await db.get(table, id)) as T | null) : null);
  const opp = {
    trend: await pick<import("@/lib/db/types").Trend>("trends", picks?.trend_id),
    idea: await pick<import("@/lib/db/types").Idea>("ideas", picks?.idea_id),
    person: await pick<import("@/lib/db/types").Person>("people", picks?.person_id),
    speaking: await pick<import("@/lib/db/types").Speaking>("speaking", picks?.speaking_id),
    partnership: await pick<import("@/lib/db/types").Partnership>("partnerships", picks?.partnership_id),
    action: todaysBriefing?.opportunity_action ?? null,
  };
  const opportunities = (await db.list("opportunities", { where: { status: ["new", "active"] }, orderBy: { column: "created_at", ascending: false }, limit: 3 }));
  const logs = await db.list("task_logs", { orderBy: { column: "at", ascending: false }, limit: 12 });
  const reminders = [
    ...(todaysBriefing?.reminders ?? []),
    ...(await db.list("people")).filter((p) => p.remind_at && p.remind_at.slice(0, 10) <= today).map((p) => `Follow up with ${p.name}`),
  ];
  const saved = (await db.list("stories", { where: { saved: true }, orderBy: { column: "created_at", ascending: false }, limit: 4 }));
  const weather = await getWeather(profile.home_lat, profile.home_lng);
  const budget = await budgetStatus();
  return {
    today, part, profile, settings, edition, stories, briefing: todaysBriefing, todayEvents, tomorrowEvents, active, completedRecent, approvals, drafts,
    people: fallbackPeople, outfit, wardrobe, experiences, opp, opportunities, logs, reminders: [...new Set(reminders)], saved, weather, budget,
    connected: Boolean(env.anthropicApiKey),
  };
}
