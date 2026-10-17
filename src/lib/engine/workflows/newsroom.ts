import "server-only";
import * as z from "zod/v4";
import { getDb } from "@/lib/db";
import type { Briefing, Edition, Story } from "@/lib/db/types";
import { callAgent } from "@/lib/ai/llm";
import { getProfile, getSettings } from "@/lib/bootstrap";
import { newId, nowIso } from "@/lib/util";
import { londonDate, londonTimeToUtc, addDays, fmtTime } from "@/lib/time";
import { firstOgImage } from "@/lib/integrations/og";
import { getWeather } from "@/lib/integrations/weather";
import { registerWorkflow, type RunContext } from "../jobs";
import { SEARCH_RULE, SourceVerifier, SourceZ, mapLimit, toSources } from "./common";
import { runOutfit } from "./life";
import { pickDailyPeople } from "./people";
import { pickOpportunities } from "./opportunities";

export const SECTIONS = [
  "The World This Morning",
  "AI & Creative Technology",
  "Entertainment & Media",
  "Startups & Business",
  "Design & Culture",
  "London",
  "People Worth Knowing",
  "Emerging Trends",
] as const;

const GROUPS: string[][] = [
  ["The World This Morning", "AI & Creative Technology", "Entertainment & Media"],
  ["Startups & Business", "Design & Culture", "London"],
  ["People Worth Knowing", "Emerging Trends"],
];

const StoryZ = z.object({
  section: z.string(),
  headline: z.string(),
  dek: z.string().describe("One-sentence standfirst"),
  what: z.string().describe("What happened, 2-4 sentences"),
  why: z.string().describe("Why it matters"),
  implications: z.string().describe("Implications for Sean's work and interests"),
  ideas: z.array(z.string()).describe("1-3 ideas or opportunities for Sean"),
  topics: z.array(z.string()),
  sources: z.array(SourceZ),
});
const SectionBatchZ = z.object({ stories: z.array(StoryZ) });
const FrontZ = z.object({
  title: z.string().describe("Edition headline for today, editorial and specific"),
  standfirst: z.string(),
  big_idea: z.string().describe("The Big Idea: one essay-length idea (150-250 words) drawn from today's stories"),
  for_me: z.string().describe("What This Means For Me: 3-5 concrete takeaways for Sean, as short paragraphs"),
});

export function storiesFor(weight: number) {
  return weight <= 0 ? 0 : weight >= 2 ? 3 : 2;
}

export async function runEdition(ctx: RunContext): Promise<Edition> {
  const db = getDb();
  const date = londonDate();
  const settings = await getSettings();
  const existing = (await db.list("editions", { where: { date } }))[0];
  const edition: Edition = existing ?? { id: newId("ed"), date, title: "Today's edition", standfirst: "", big_idea: null, for_me: null, status: "generating", task_id: ctx.task.id, created_at: nowIso() };
  if (!existing) await db.insert("editions", edition);
  else await db.update("editions", edition.id, { status: "generating", task_id: ctx.task.id });

  const recent = (await db.list("stories", { orderBy: { column: "created_at", ascending: false }, limit: 60 })).map((s) => s.headline);
  const disliked = (await db.list("memories", { where: { kind: "feedback", category: "Edition" } })).map((m) => m.content);
  const verifier = new SourceVerifier();
  const all: z.infer<typeof StoryZ>[] = [];
  for (const [gi, group] of GROUPS.entries()) {
    const wanted = group.map((s) => [s, storiesFor(settings.coverage[s] ?? 1)] as const).filter(([, n]) => n > 0);
    if (!wanted.length) continue;
    const res = await ctx.step("editor", `Researching ${wanted.map(([s]) => s).join(", ")}`, async () => {
      const r = await callAgent({
        agent: "editor",
        taskId: ctx.task.id,
        webSearch: true,
        schema: SectionBatchZ,
        prompt: `Research and write today's stories for these sections of The Sean Edition:\n${wanted.map(([s, n]) => `- ${s}: ${n} stories`).join("\n")}\n\nFocus on news from the last 48 hours. "People Worth Knowing" profiles real people in the news relevant to Sean. "Emerging Trends" covers early signals, not old news. "London" covers what's happening in London now.\nAvoid repeating these recent headlines: ${recent.slice(0, 30).join(" | ") || "none"}.\n${disliked.length ? `Sean's feedback on past editions: ${disliked.join("; ")}` : ""}\n${SEARCH_RULE} Each story needs at least one source.`,
      });
      return { stories: r.data.stories, found: r.sources };
    });
    verifier.add(res.found);
    all.push(...res.stories);
    await ctx.progress(0.15 + gi * 0.2);
  }

  const kept = all
    .map((s) => ({ ...s, sources: verifier.filter(s.sources) }))
    .filter((s) => s.sources.length > 0);
  if (!kept.length) throw new Error("The newsroom couldn't verify any stories today. Try again shortly.");

  const front = await ctx.step("editor", "Writing the front page, The Big Idea and What This Means For Me", async () => {
    const r = await callAgent({
      agent: "editor",
      taskId: ctx.task.id,
      schema: FrontZ,
      effort: "medium",
      prompt: `Today's verified stories:\n${kept.map((s) => `- [${s.section}] ${s.headline}: ${s.what}`).join("\n")}\n\nWrite the edition's title, standfirst, The Big Idea and What This Means For Me. Ground everything in these stories.`,
    });
    return r.data;
  });

  await ctx.step("editor", "Finding photography from the cited sources", async () => {
    const old = await db.list("stories", { where: { edition_id: edition.id } });
    for (const s of old) await db.remove("stories", s.id);
    const images = await mapLimit(kept, 4, (s) => firstOgImage(s.sources.map((x) => x.url)));
    let pos = 0;
    for (const [i, s] of kept.entries()) {
      const row: Story = {
        id: newId("st"), edition_id: edition.id, section: SECTIONS.includes(s.section as never) ? s.section : "The World This Morning", position: pos++,
        headline: s.headline, dek: s.dek, what: s.what, why: s.why, implications: s.implications, ideas: s.ideas, topics: s.topics,
        sources: toSources(s.sources), image_url: images[i], saved: false, created_at: nowIso(),
      };
      await db.insert("stories", row);
      ctx.cite(row.sources);
    }
    return true;
  });

  const done = await db.update("editions", edition.id, { title: front.title, standfirst: front.standfirst, big_idea: front.big_idea, for_me: front.for_me, status: "ready" });
  ctx.deliver({ type: "edition", id: edition.id, title: front.title });
  return done;
}

const BriefZ = z.object({
  summary: z.string().describe("Two warm, specific sentences about the day ahead"),
  priorities: z.array(z.object({ title: z.string(), why: z.string(), href: z.string().nullable().describe("An app path from the context like /tasks/... or null") })).describe("Exactly three priorities"),
  reminders: z.array(z.string()),
  plan: z.array(z.object({ time: z.string().describe("HH:MM"), title: z.string() })),
  opportunity_action: z.string().nullable().describe("One recommended action Sean could take today on an opportunity, or null if nothing is worthwhile"),
});

export async function runBriefing(ctx: RunContext): Promise<Briefing> {
  const db = getDb();
  const date = londonDate();
  const profile = await getProfile();
  const dayStart = londonTimeToUtc(date, 0, 0).toISOString();
  const dayEnd = londonTimeToUtc(addDays(date, 1), 0, 0).toISOString();
  const events = (await db.list("events", { orderBy: { column: "start", ascending: true } })).filter((e) => (e.all_day ? e.start === date : e.start >= dayStart && e.start < dayEnd));
  const tasks = await db.list("tasks", { where: { status: ["queued", "running", "blocked", "awaiting_approval"] }, limit: 20 });
  const approvals = await db.list("approvals", { where: { status: "pending" } });
  const people = (await db.list("people", { where: { daily_pick_date: date } })).map((p) => `${p.name} (${p.role}, ${p.company})`);
  const reminders = (await db.list("people")).filter((p) => p.remind_at && p.remind_at.slice(0, 10) <= date).map((p) => `Follow up with ${p.name}`);
  const followUps = (await db.list("outreach")).filter((o) => o.follow_up_at && o.follow_up_at.slice(0, 10) <= date && o.status === "sent").map((o) => `Follow up: ${o.target_name}`);
  const deadlines = (await db.list("speaking")).filter((s) => s.deadline && s.deadline >= date && s.deadline <= addDays(date, 10) && !["dismissed", "applied"].includes(s.status)).map((s) => `${s.name} speaker deadline ${s.deadline}`);
  const goals = (await db.list("life", { where: { kind: ["learning_goal", "savings_goal"], done: false } })).map((g) => g.title);
  const bills = (await db.list("recurring", { where: { active: true } })).filter((r) => r.kind !== "income" && r.next_date >= date && r.next_date <= addDays(date, 3)).map((r) => `${r.name} £${r.amount.toFixed(2)} due ${r.next_date === date ? "today" : r.next_date}`);
  const edition = (await db.list("editions", { where: { date, status: "ready" } }))[0];
  const headlines = edition ? (await db.list("stories", { where: { edition_id: edition.id } })).slice(0, 6).map((s) => s.headline) : [];
  const weather = await getWeather(profile.home_lat, profile.home_lng);
  const picks = await pickOpportunities(date);
  const brief = await ctx.step("chief_of_staff", "Planning today's priorities", async () => {
    const r = await callAgent({
      agent: "chief_of_staff",
      taskId: ctx.task.id,
      schema: BriefZ,
      effort: "low",
      prompt: `Prepare Sean's morning briefing.\nWeather: ${weather ? `${weather.summary}, ${weather.temp_c}°C (high ${weather.high_c}°, ${weather.rain_chance}% rain)` : "unavailable"}\nCalendar today: ${events.map((e) => `${e.all_day ? "All day" : fmtTime(e.start)} ${e.title}${e.location ? ` @ ${e.location}` : ""}`).join("; ") || "nothing scheduled (calendar may not be connected)"}\nOpen tasks: ${tasks.map((t) => `${t.title} [${t.status}] /tasks/${t.id}`).join("; ") || "none"}\nAwaiting approval: ${approvals.length} items (/approvals)\nPeople to reach out to today: ${people.join("; ") || "none"}\nReminders due: ${[...reminders, ...followUps, ...deadlines, ...bills].join("; ") || "none"}\nGoals: ${goals.join("; ") || "none set"}\nToday's headlines: ${headlines.join("; ") || "edition not ready"}\nOpportunity picks: ${picks.summary || "none"}\n\nGive exactly three priorities. Only include plan items from the calendar or clearly useful focus blocks. Never invent meetings.`,
    });
    return r.data;
  });
  const existing = (await db.list("briefings", { where: { date } }))[0];
  const row: Briefing = {
    id: existing?.id ?? newId("brf"), date, summary: brief.summary, priorities: brief.priorities.slice(0, 3),
    reminders: [...new Set([...brief.reminders, ...reminders, ...followUps, ...deadlines, ...bills])], plan: brief.plan, opportunity_action: brief.opportunity_action,
    opportunity_picks: picks.ids, task_id: ctx.task.id, created_at: nowIso(),
  };
  await db.upsert("briefings", row);
  ctx.deliver({ type: "briefing", id: row.id, title: "Daily briefing" });
  return row;
}

registerWorkflow({
  kind: "edition",
  title: "The Sean Edition",
  agent: "editor",
  async run(ctx) {
    const ed = await runEdition(ctx);
    return { summary: `${ed.title}. ${ed.standfirst}` };
  },
});

registerWorkflow({
  kind: "briefing",
  title: "Daily briefing",
  agent: "chief_of_staff",
  async run(ctx) {
    const b = await runBriefing(ctx);
    return { summary: b.summary };
  },
});

registerWorkflow({
  kind: "morning",
  title: "Morning run",
  agent: "chief_of_staff",
  async run(ctx) {
    const parts: string[] = [];
    try {
      const ed = await runEdition(ctx);
      parts.push(`The edition is ready: ${ed.title}.`);
    } catch (e) {
      if ((e as Error).name === "BlockedError") throw e;
      await ctx.log(`Edition skipped: ${(e as Error).message}`, "editor", "warn");
    }
    await ctx.progress(0.7);
    const people = await ctx.step("networking", "Choosing today's three people", () => pickDailyPeople(londonDate()));
    if (people.length) parts.push(`${people.length} people worth contacting.`);
    try {
      const outfit = await runOutfit(ctx);
      parts.push(`Outfit: ${outfit.title}.`);
    } catch (e) {
      if ((e as Error).name === "BlockedError") throw e;
      await ctx.log(`Outfit skipped: ${(e as Error).message}`, "stylist", "warn");
    }
    const b = await runBriefing(ctx);
    parts.unshift(b.summary);
    return { summary: parts.join(" ") };
  },
});

const IntelZ = z.object({ title: z.string(), summary: z.string(), body: z.string().describe("Markdown report with ## sections, analysis and recommendations"), sources: z.array(SourceZ) });

registerWorkflow({
  kind: "intel_briefing",
  title: "Industry intelligence briefing",
  agent: "research",
  async run(ctx) {
    const verifier = new SourceVerifier();
    const r = await ctx.step("research", "Researching this week's industry movements", async () => {
      const res = await callAgent({
        agent: "research",
        taskId: ctx.task.id,
        webSearch: true,
        schema: IntelZ,
        prompt: `Write this week's intelligence briefing for Sean covering AI models and tools, creative production workflows, entertainment business models, new companies and funding, research papers and cultural shifts. Go beyond mainstream headlines. Sections: Signals, Companies to watch, Tools and models, Business models, What to do. ${SEARCH_RULE}`,
      });
      return { ...res.data, found: res.sources };
    });
    verifier.add(r.found);
    const sources = toSources(verifier.filter(r.sources));
    const id = newId("rep");
    await getDb().insert("reports", { id, kind: "intel_briefing", title: r.title, summary: r.summary, body: r.body, slides: [], sources, subject_ref: null, scope: "public", tags: ["intelligence"], images: [], task_id: ctx.task.id, created_at: nowIso() });
    ctx.cite(sources);
    ctx.deliver({ type: "report", id, title: r.title });
    return { summary: r.summary };
  },
});
