import "server-only";
import * as z from "zod/v4";
import { getDb } from "@/lib/db";
import type { Person } from "@/lib/db/types";
import { callAgent } from "@/lib/ai/llm";
import { dedupeKey, newId, nowIso } from "@/lib/util";
import { findOgImage } from "@/lib/integrations/og";
import { registerWorkflow, type RunContext } from "../jobs";
import { SEARCH_RULE, SourceVerifier, SourceZ, mapLimit, summariseList, toSources } from "./common";

const PersonZ = z.object({
  name: z.string(),
  role: z.string(),
  company: z.string(),
  location: z.string(),
  category: z.string().describe("e.g. Founder, Creative director, AI researcher, Investor, Artist, Potential friend"),
  profiles: z.array(z.object({ label: z.string(), url: z.string() })).describe("Verified public profiles (site, X, Instagram, LinkedIn) found in search"),
  achievements: z.array(z.string()).describe("Recent verified projects or achievements"),
  why_get_along: z.string(),
  why_valuable: z.string(),
  conversation_starter: z.string(),
  message: z.string().describe("A casual message Sean could send, based only on verified details. No implied prior relationship."),
  sources: z.array(SourceZ),
});

export async function findPeople(ctx: RunContext, opts: { count: number; brief: string; category?: string }) {
  const db = getDb();
  const existing = await db.list("people");
  const known = new Set(existing.map((p) => p.dedupe_key));
  const dismissedFeedback = (await db.list("memories", { where: { kind: "feedback", category: "People" } })).map((m) => m.content);
  const res = await ctx.step("networking", `Researching ${opts.count} people worth meeting`, async () => {
    const r = await callAgent({
      agent: "networking",
      taskId: ctx.task.id,
      webSearch: true,
      schema: z.object({ people: z.array(PersonZ) }),
      prompt: `Find ${opts.count} genuinely interesting real people Sean should connect with. ${opts.brief}\nMix: founders, creative directors, AI researchers, entertainment executives, designers, artists, investors, interesting Londoners, people at a similar career stage and people he could become friends with. Prioritise relevance and human compatibility over status. Prefer London and people reachable for a coffee.\nAlready known (skip): ${existing.slice(0, 80).map((p) => p.name).join(", ") || "none"}.\n${dismissedFeedback.length ? `Sean's feedback: ${dismissedFeedback.join("; ")}` : ""}\nMessages are casual, like: "Hey! Just came across what you're building. Really cool stuff. I'm working on some similar things over at Calm. Would be great to grab a coffee sometime!" but specific to a verified detail.\n${SEARCH_RULE}`,
    });
    return { people: r.data.people, found: r.sources };
  });
  const verifier = new SourceVerifier();
  verifier.add(res.found);
  const fresh = res.people
    .map((p) => ({ ...p, sources: verifier.filter(p.sources), profiles: p.profiles.filter((x) => verifier.has(x.url) || verifier.hostSeen(x.url)) }))
    .filter((p) => p.sources.length > 0 && !known.has(dedupeKey(p.name, p.company)));
  const photos = await mapLimit(fresh, 4, async (p) => {
    const personal = p.profiles.find((x) => !/linkedin\.com/.test(x.url));
    return personal ? findOgImage(personal.url) : null;
  });
  const saved: Person[] = [];
  for (const [i, p] of fresh.entries()) {
    const row: Person = {
      id: newId("per"), name: p.name, photo_url: photos[i], role: p.role, company: p.company, location: p.location, category: opts.category ?? p.category,
      profiles: p.profiles, achievements: p.achievements, why_get_along: p.why_get_along, why_valuable: p.why_valuable,
      conversation_starter: p.conversation_starter, message: p.message, sources: toSources(p.sources), status: "suggested", origin: "agent",
      notes: "", interests: [], remind_at: null, daily_pick_date: null, last_contact_at: null, dedupe_key: dedupeKey(p.name, p.company),
      discovered_at: nowIso(), verified_at: nowIso(),
    };
    await db.insert("people", row);
    ctx.cite(row.sources);
    ctx.deliver({ type: "person", id: row.id, title: row.name });
    saved.push(row);
  }
  if (res.people.length > fresh.length) await ctx.log(`${res.people.length - fresh.length} suggestions dropped (duplicate or unverified).`, "networking");
  return saved;
}

/** Surfaces three un-contacted people for today, never repeating a pick. */
export async function pickDailyPeople(date: string): Promise<string[]> {
  const db = getDb();
  const already = await db.list("people", { where: { daily_pick_date: date } });
  if (already.length >= 3) return already.map((p) => p.id);
  const pool = (await db.list("people", { where: { status: ["suggested", "saved"], daily_pick_date: null }, orderBy: { column: "discovered_at", ascending: false } })).slice(0, 3 - already.length);
  for (const p of pool) await db.update("people", p.id, { daily_pick_date: date });
  return [...already, ...pool].map((p) => p.id);
}

registerWorkflow({
  kind: "people_weekly",
  title: "People worth meeting",
  agent: "networking",
  async run(ctx) {
    const count = Number(ctx.task.params.count ?? 10);
    const people = await findPeople(ctx, { count, brief: String(ctx.task.params.brief ?? "") });
    return { summary: summariseList("people to meet", people.map((p) => p.name)) };
  },
});

const ResearchPersonZ = z.object({
  summary: z.string(),
  body: z.string().describe("Markdown profile: background, recent work, interests, shared ground, approach"),
  achievements: z.array(z.string()),
  profiles: z.array(z.object({ label: z.string(), url: z.string() })),
  message: z.string().describe("A natural introduction message in Sean's voice"),
  sources: z.array(SourceZ),
});

registerWorkflow({
  kind: "person_research",
  title: "Research a person",
  agent: "networking",
  async run(ctx) {
    const db = getDb();
    const id = String(ctx.task.params.person_id ?? "");
    const person = await db.get("people", id);
    const target = person ? `${person.name}, ${person.role} at ${person.company}` : ctx.task.instruction;
    const r = await ctx.step("networking", `Researching ${person?.name ?? "this person"}`, async () => {
      const res = await callAgent({ agent: "networking", taskId: ctx.task.id, webSearch: true, schema: ResearchPersonZ, prompt: `Research ${target} in depth and draft an introduction. ${ctx.task.instruction}\n${SEARCH_RULE}` });
      return { ...res.data, found: res.sources };
    });
    const v = new SourceVerifier();
    v.add(r.found);
    const sources = toSources(v.filter(r.sources));
    const repId = newId("rep");
    await db.insert("reports", { id: repId, kind: "person_research", title: `Profile: ${person?.name ?? target}`, summary: r.summary, body: r.body, slides: [], sources, subject_ref: person ? { type: "person", id: person.id, title: person.name } : null, scope: "personal", tags: ["people"], images: [], task_id: ctx.task.id, created_at: nowIso() });
    if (person) {
      await db.update("people", person.id, {
        achievements: [...new Set([...person.achievements, ...r.achievements])].slice(0, 10),
        profiles: [...person.profiles, ...r.profiles.filter((p) => v.hostSeen(p.url) && !person.profiles.some((x) => x.url === p.url))],
        message: r.message, sources: [...person.sources, ...sources.filter((s) => !person.sources.some((x) => x.url === s.url))], verified_at: nowIso(),
      });
    }
    ctx.cite(sources);
    ctx.deliver({ type: "report", id: repId, title: `Profile: ${person?.name ?? target}` });
    return { summary: r.summary };
  },
});
