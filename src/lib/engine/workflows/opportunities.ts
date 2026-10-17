import "server-only";
import * as z from "zod/v4";
import { getDb } from "@/lib/db";
import type { Idea, Opportunity, Outreach, Speaking, Trend } from "@/lib/db/types";
import { callAgent } from "@/lib/ai/llm";
import { getProfile } from "@/lib/bootstrap";
import { clamp, dedupeKey, newId, nowIso } from "@/lib/util";
import { addDays, londonDate } from "@/lib/time";
import { firstOgImage } from "@/lib/integrations/og";
import { registerWorkflow, type RunContext } from "../jobs";
import { ContactZ, SEARCH_RULE, SourceVerifier, SourceZ, mapLimit, summariseList, toSources } from "./common";

/* ------------------------------ Trend radar ------------------------------ */

const TrendZ = z.object({
  title: z.string(),
  category: z.string(),
  region: z.string().describe("Where it's happening now: UK, US, Asia, Global..."),
  what: z.string(),
  evidence: z.array(z.object({ claim: z.string(), kind: z.enum(["measured", "anecdotal"]).describe("measured = a number from a source"), source_url: z.string(), date: z.string().nullable() })),
  why: z.string(),
  drivers: z.array(z.string()).describe("Companies, creators or communities driving it"),
  maturity: z.enum(["weak_signal", "emerging", "accelerating", "mainstream"]),
  momentum: z.number().describe("1-5 based only on the evidence"),
  opportunity_score: z.number().describe("1-10 for Sean specifically"),
  prediction: z.string().describe("Clearly speculative: where this could be in 6-24 months"),
  relevance: z.string().describe("Why it matters to Sean"),
  opportunities: z.array(z.string()),
  calm_applications: z.array(z.string()).describe("Potential applications for Calm or Calmlings"),
  sources: z.array(SourceZ),
});

const TREND_LENSES = [
  "AI and creative technology breakthroughs, entertainment and media, new consumer apps and startups, new business models, funding announcements",
  "consumer behaviour, social media and emerging creators, fashion, culture and lifestyle movements, viral products and fast-growing brands, underserved audiences, and trends in the US and Asia that could spread to the UK",
];

export async function scanTrends(ctx: RunContext, focus = ""): Promise<Trend[]> {
  const db = getDb();
  const existing = await db.list("trends");
  const verifier = new SourceVerifier();
  const found: z.infer<typeof TrendZ>[] = [];
  for (const [i, lens] of TREND_LENSES.entries()) {
    const r = await ctx.step("trends", `Scanning for weak signals: ${i === 0 ? "technology & business" : "culture & consumers"}`, async () => {
      const res = await callAgent({
        agent: "trends", taskId: ctx.task.id, webSearch: true, schema: z.object({ trends: z.array(TrendZ) }),
        prompt: `Find 4-6 emerging trends across ${lens}. ${focus ? `Focus: ${focus}.` : ""}\nLook for weak signals that could become significant in 6-24 months, not what's already popular. Use news, startup launches, funding, search-interest reports, community discussions and industry reports.\nEvidence: each claim needs a source_url; mark "measured" only for a number stated in the source. Keep predictions in the prediction field.\nAlready tracked (update rather than duplicate, using the same title): ${existing.slice(0, 40).map((t) => t.title).join("; ") || "none"}.\n${SEARCH_RULE}`,
      });
      return { trends: res.data.trends, found: res.sources };
    });
    verifier.add(r.found);
    found.push(...r.trends);
  }
  const clean = found
    .map((t) => ({ ...t, sources: verifier.filter(t.sources), evidence: t.evidence.filter((e) => verifier.has(e.source_url)) }))
    .filter((t) => t.sources.length > 0 && t.evidence.length > 0);
  const images = await mapLimit(clean, 4, (t) => firstOgImage(t.sources.map((s) => s.url)));
  const out: Trend[] = [];
  for (const [i, t] of clean.entries()) {
    if (out.some((o) => o.dedupe_key === dedupeKey(t.title))) continue;
    const key = dedupeKey(t.title);
    const prev = existing.find((e) => e.dedupe_key === key);
    // Momentum can't exceed what the evidence supports.
    const measured = t.evidence.filter((e) => e.kind === "measured").length;
    const momentum = clamp(Math.round(t.momentum), 1, measured === 0 ? 3 : 5);
    const row: Trend = {
      id: prev?.id ?? newId("trd"), title: t.title, category: t.category, region: t.region, what: t.what,
      evidence: [...t.evidence, ...(prev?.evidence ?? []).filter((e) => !t.evidence.some((x) => x.source_url === e.source_url))].slice(0, 12),
      why: t.why, drivers: t.drivers, maturity: t.maturity, momentum, opportunity_score: clamp(Math.round(t.opportunity_score), 1, 10), prediction: t.prediction,
      relevance: t.relevance, opportunities: t.opportunities, calm_applications: t.calm_applications,
      sources: [...toSources(t.sources), ...(prev?.sources ?? []).filter((s) => !t.sources.some((x) => x.url === s.url))].slice(0, 12),
      image_url: images[i] ?? prev?.image_url ?? null, status: prev?.status ?? "new", dedupe_key: key, seen_count: (prev?.seen_count ?? 0) + 1,
      discovered_at: prev?.discovered_at ?? nowIso(), verified_at: nowIso(),
    };
    await db.upsert("trends", row);
    if (prev) existing.splice(existing.indexOf(prev), 1, row);
    else existing.push(row);
    ctx.cite(row.sources);
    ctx.deliver({ type: "trend", id: row.id, title: row.title });
    out.push(row);
  }
  if (found.length > clean.length) await ctx.log(`${found.length - clean.length} trends dropped for lack of verifiable evidence.`, "trends");
  return out;
}

registerWorkflow({
  kind: "trend_scan",
  title: "Trend radar",
  agent: "trends",
  async run(ctx) {
    const trends = await scanTrends(ctx, String(ctx.task.params.focus ?? ""));
    return { summary: summariseList("trends", trends.map((t) => t.title)) };
  },
});

/* ---------------------------- Venture studio ---------------------------- */

export const IdeaZ = z.object({
  title: z.string().describe("Compelling name"),
  one_liner: z.string(),
  insight: z.string(),
  product: z.string(),
  audience: z.string(),
  business_model: z.string(),
  competition: z.array(z.object({ name: z.string(), url: z.string().nullable(), note: z.string() })),
  advantage: z.string(),
  evidence: z.string().describe("Evidence it could work commercially, citing trends or sources"),
  launch: z.string().describe("How to test quickly and cheaply"),
  verdict: z.enum(["explore", "monitor", "discard"]),
  costs: z.string().describe("Estimated startup costs, labelled as estimates"),
  monetisation: z.array(z.string()),
  challenges: z.array(z.string()),
  scale: z.string(),
  assumptions: z.array(z.string()),
  scores: z.object({ market: z.number(), fit: z.number(), effort: z.number(), novelty: z.number() }).describe("Each 1-10. effort: 10 = easiest"),
  trend_titles: z.array(z.string()).describe("Titles of the trends combined"),
  sources: z.array(SourceZ),
});

export function ideaRow(i: z.infer<typeof IdeaZ>, trends: Trend[], taskId: string | null, verifier: SourceVerifier, prev?: Idea | null): Idea {
  return {
    id: prev?.id ?? newId("idea"), title: i.title, one_liner: i.one_liner, insight: i.insight, product: i.product, audience: i.audience, business_model: i.business_model,
    competition: i.competition.map((c) => ({ ...c, url: c.url && (verifier.has(c.url) || verifier.hostSeen(c.url)) ? c.url : null })),
    advantage: i.advantage, evidence: i.evidence, launch: i.launch, verdict: i.verdict, costs: i.costs, monetisation: i.monetisation, challenges: i.challenges, scale: i.scale,
    assumptions: i.assumptions, scores: { market: clamp(i.scores.market, 1, 10), fit: clamp(i.scores.fit, 1, 10), effort: clamp(i.scores.effort, 1, 10), novelty: clamp(i.scores.novelty, 1, 10) },
    origin: prev?.origin ?? "agent", trend_ids: trends.filter((t) => i.trend_titles.some((x) => dedupeKey(x) === t.dedupe_key)).map((t) => t.id),
    links: prev?.links ?? [], tags: prev?.tags ?? [], notes: prev?.notes ?? "", status: prev?.status ?? (i.verdict === "discard" ? "parked" : "captured"),
    sources: toSources(verifier.filter(i.sources)), images: prev?.images ?? [], dedupe_key: dedupeKey(i.title), task_id: taskId,
    created_at: prev?.created_at ?? nowIso(), updated_at: nowIso(),
  };
}

registerWorkflow({
  kind: "venture_ideas",
  title: "Venture ideas",
  agent: "ventures",
  async run(ctx) {
    const db = getDb();
    const trends = (await db.list("trends", { where: { status: ["new", "saved"] }, orderBy: { column: "verified_at", ascending: false }, limit: 20 }));
    const ideas = await db.list("ideas");
    const feedback = (await db.list("memories", { where: { kind: "feedback", category: "Ideas" } })).map((m) => m.content);
    const verifier = new SourceVerifier();
    for (const t of trends) verifier.add(t.sources);
    const res = await ctx.step("ventures", "Combining trends, gaps and Sean's strengths into ideas", async () => {
      const r = await callAgent({
        agent: "ventures", taskId: ctx.task.id, webSearch: true, schema: z.object({ ideas: z.array(IdeaZ) }),
        prompt: `Develop up to ${Number(ctx.task.params.count ?? 7)} original business ideas for Sean. Combine multiple trends, technologies, behaviours and overlooked gaps. Avoid generic startup concepts. Return fewer if fewer are genuinely good; quality over quota.\nUse web search to check competitors.\nTrends:\n${trends.map((t) => `- ${t.title} (${t.maturity}, momentum ${t.momentum}/5): ${t.what}`).join("\n") || "(no trends yet: find current signals yourself)"}\nExisting ideas (don't repeat): ${ideas.map((i) => i.title).join("; ") || "none"}\n${feedback.length ? `Sean's feedback: ${feedback.join("; ")}` : ""}\nLabel all costs and sizes as estimates with assumptions. ${SEARCH_RULE}`,
      });
      return { ideas: r.data.ideas, found: r.sources };
    });
    verifier.add(res.found);
    const known = new Set(ideas.map((i) => i.dedupe_key));
    const saved: Idea[] = [];
    for (const i of res.ideas) {
      if (known.has(dedupeKey(i.title))) continue;
      const row = ideaRow(i, trends, ctx.task.id, verifier);
      await db.insert("ideas", row);
      ctx.cite(row.sources);
      ctx.deliver({ type: "idea", id: row.id, title: row.title });
      saved.push(row);
    }
    return { summary: summariseList("new ideas", saved.map((s) => `${s.title} (${s.verdict})`)) };
  },
});

/* ---------------------------- Speaking scout ---------------------------- */

const EventZ = z.object({
  name: z.string(),
  kind: z.enum(["conference", "panel", "podcast", "lecture", "summit", "meetup", "workshop", "roundtable", "fireside", "award", "festival"]),
  location: z.string(),
  start_date: z.string().nullable().describe("YYYY-MM-DD from the official page, else null"),
  end_date: z.string().nullable(),
  organiser: z.string(),
  audience: z.string(),
  size: z.string().nullable().describe("Only if stated on an official page"),
  fit: z.string().describe("Why Sean is a suitable speaker, using only his verified credentials"),
  talk_titles: z.array(z.string()),
  cfp_status: z.enum(["open", "rolling", "closed", "invite_only", "unknown"]),
  deadline: z.string().nullable().describe("YYYY-MM-DD speaker deadline from the official page, else null"),
  submission_url: z.string().nullable().describe("Official submission or contact page"),
  contacts: z.array(ContactZ),
  networking: z.string(),
  next_action: z.string(),
  sources: z.array(SourceZ),
});

registerWorkflow({
  kind: "speaking_scan",
  title: "Speaking scout",
  agent: "speaking",
  async run(ctx) {
    const db = getDb();
    const today = londonDate();
    const existing = await db.list("speaking");
    const verifier = new SourceVerifier();
    const res = await ctx.step("speaking", "Searching conferences, podcasts and panels", async () => {
      const r = await callAgent({
        agent: "speaking", taskId: ctx.task.id, webSearch: true, schema: z.object({ events: z.array(EventZ) }),
        prompt: `Find 6-10 speaking opportunities for Sean: conferences, panels, AI and tech events, creative industry summits, entertainment and media conferences, startup events, founder communities, university guest lectures, podcasts, fireside chats, roundtables, workshops, awards and judging. Prioritise London, the UK, Europe and major US events; include exceptional global ones. ${String(ctx.task.params.focus ?? "")}\nOnly include events in the future. Skip events whose speaker deadline has passed unless another genuine route exists (rolling applications, podcast guest form, organiser contact) and say what it is in next_action.\nDates and deadlines must come from official pages. Already tracked: ${existing.map((e) => e.name).join("; ") || "none"}.\n${SEARCH_RULE}`,
      });
      return { events: r.data.events, found: r.sources };
    });
    verifier.add(res.found);
    const kept = res.events
      .map((e) => ({ ...e, sources: verifier.filter(e.sources) }))
      .filter((e) => e.sources.length > 0)
      .filter((e) => !(e.end_date ?? e.start_date) || (e.end_date ?? e.start_date)! >= today)
      .filter((e) => !(e.deadline && e.deadline < today && !["rolling", "invite_only"].includes(e.cfp_status)));
    const images = await mapLimit(kept, 4, (e) => firstOgImage([e.submission_url, ...e.sources.map((s) => s.url)].filter((u): u is string => Boolean(u))));
    const saved: Speaking[] = [];
    for (const [i, e] of kept.entries()) {
      const key = dedupeKey(e.name, (e.start_date ?? "").slice(0, 4));
      const prev = existing.find((x) => x.dedupe_key === key);
      const deadlineVerified = Boolean(e.deadline && e.sources.length);
      const row: Speaking = {
        id: prev?.id ?? newId("spk"), name: e.name, kind: e.kind, image_url: images[i] ?? prev?.image_url ?? null, location: e.location, start_date: e.start_date, end_date: e.end_date,
        organiser: e.organiser, audience: e.audience, size: e.size, fit: e.fit, talk_titles: e.talk_titles, cfp_status: e.cfp_status, deadline: e.deadline, deadline_verified: deadlineVerified,
        submission_url: e.submission_url && (verifier.has(e.submission_url) || verifier.hostSeen(e.submission_url)) ? e.submission_url : null,
        contacts: e.contacts.filter((c) => verifier.has(c.source_url) || verifier.hostSeen(c.source_url)),
        networking: e.networking, next_action: e.next_action, pitch: prev?.pitch ?? null, status: prev?.status ?? "discovered", follow_up_at: prev?.follow_up_at ?? null,
        applied_at: prev?.applied_at ?? null, sources: toSources(e.sources), dedupe_key: key, discovered_at: prev?.discovered_at ?? nowIso(), verified_at: nowIso(),
      };
      await db.upsert("speaking", row);
      ctx.cite(row.sources);
      ctx.deliver({ type: "speaking", id: row.id, title: row.name });
      saved.push(row);
    }
    return { summary: summariseList("speaking opportunities", saved.map((s) => s.name)) };
  },
});

const SpeakerZ = z.object({
  bio_short: z.string().describe("50 words, third person"),
  bio_long: z.string().describe("150-200 words, third person"),
  intro_short: z.string().describe("What an MC would say, 2 sentences"),
  intro_long: z.string(),
  topics: z.array(z.object({ title: z.string(), description: z.string().describe("A 60-90 word talk abstract") })),
  one_sheet: z.string().describe("Markdown speaker one-sheet"),
});

registerWorkflow({
  kind: "speaker_profile",
  title: "Speaker profile",
  agent: "speaking",
  async run(ctx) {
    const db = getDb();
    const profile = await getProfile();
    const r = await ctx.step("speaking", "Writing the speaker profile and talk concepts", async () =>
      (await callAgent({
        agent: "speaking", taskId: ctx.task.id, schema: SpeakerZ,
        prompt: `Create Sean's reusable speaker profile from ONLY these verified credentials:\n${profile.speaker.achievements.map((a) => `- ${a}`).join("\n")}\nExpertise: ${profile.speaker.expertise.join(", ")}\nPast talks: ${profile.speaker.past_talks.join("; ") || "none. Do not claim any."}\nDevelop talk concepts including: ${profile.speaker.topics.map((t) => t.title).join("; ")}. Add 2 more original titles. Confident, warm and specific, never inflated.`,
      })).data,
    );
    await db.update("profile", "me", { speaker: { ...profile.speaker, bio_short: r.bio_short, bio_long: r.bio_long, intro_short: r.intro_short, intro_long: r.intro_long, topics: r.topics }, updated_at: nowIso() });
    const id = newId("rep");
    await db.insert("reports", { id, kind: "speaker_one_sheet", title: "Speaker one-sheet", summary: r.bio_short, body: r.one_sheet, slides: [], sources: [], subject_ref: null, scope: "public", tags: ["speaking"], images: [], task_id: ctx.task.id, created_at: nowIso() });
    ctx.deliver({ type: "report", id, title: "Speaker one-sheet" });
    return { summary: "Speaker profile, intros, talk abstracts and one-sheet drafted. Review and edit them in Speaking." };
  },
});

registerWorkflow({
  kind: "speaking_pitch",
  title: "Speaker pitch",
  agent: "speaking",
  async run(ctx) {
    const db = getDb();
    const ev = await db.get("speaking", String(ctx.task.params.speaking_id ?? ""));
    if (!ev) throw new Error("That speaking opportunity no longer exists.");
    const profile = await getProfile();
    const r = await ctx.step("speaking", `Drafting a pitch to ${ev.organiser || ev.name}`, async () =>
      (await callAgent({
        agent: "speaking", taskId: ctx.task.id, schema: z.object({ subject: z.string(), body: z.string(), talk_title: z.string() }),
        prompt: `Draft a short, personalised email from Sean to the organiser of ${ev.name} (${ev.kind}, ${ev.location}, ${ev.start_date ?? "date tbc"}). Audience: ${ev.audience}. Why he fits: ${ev.fit}. Possible talks: ${ev.talk_titles.join("; ")}.\nSpeaker bio: ${profile.speaker.bio_short || profile.bio}\nConfident, casual, warm and genuinely human. Under 150 words. Use only verified credentials. ${ctx.task.instruction}`,
      })).data,
    );
    await db.update("speaking", ev.id, { pitch: { subject: r.subject, body: r.body }, status: ev.status === "discovered" || ev.status === "saved" ? "drafting" : ev.status });
    const contact = ev.contacts.find((c) => c.email);
    const or: Outreach = { id: newId("out"), target_type: "speaking", target_id: ev.id, target_name: ev.name, channel: ev.submission_url && !contact ? "form" : "email", to: contact?.email ?? null, subject: r.subject, body: r.body, status: "draft", follow_up_at: null, reply_note: "", approved_at: null, sent_at: null, created_at: nowIso(), updated_at: nowIso() };
    await db.insert("outreach", or);
    await ctx.needsApproval({ type: "outreach", ref_id: or.id, title: `Pitch: ${ev.name}`, summary: r.subject, agent: "speaking" });
    ctx.deliver({ type: "speaking", id: ev.id, title: ev.name });
    return { summary: `Pitch for ${ev.name} drafted: "${r.subject}".`, awaitingApproval: true };
  },
});

/* -------------------------- Opportunity engine -------------------------- */

const OppZ = z.object({
  title: z.string(),
  thesis: z.string().describe("The connected opportunity in 2-3 sentences"),
  why_now: z.string(),
  items: z.array(z.object({ ref: z.string().describe("An item code from the list, e.g. T3, I1, P2, S4, B1"), role: z.string().describe("Its role in this opportunity") })),
  actions: z.array(z.object({ label: z.string(), instruction: z.string().describe("A delegable instruction for the team") })),
  score: z.number().describe("1-10"),
});

async function opportunityInventory() {
  const db = getDb();
  const since = new Date(Date.now() - 21 * 86400000).toISOString();
  const pick = <T extends { status: string }>(rows: T[]) => rows.filter((r) => r.status !== "dismissed");
  const trends = pick(await db.list("trends")).filter((t) => t.verified_at >= since).slice(0, 12);
  const ideas = (await db.list("ideas")).filter((i) => i.status !== "archived" && i.verdict !== "discard").slice(-12);
  const people = pick(await db.list("people")).slice(-15);
  const speaking = pick(await db.list("speaking")).slice(-10);
  const brands = (await db.list("partnerships")).filter((p) => p.status !== "passed").slice(-10);
  const codes: Record<string, { type: string; id: string; title: string }> = {};
  const lines: string[] = [];
  const add = (prefix: string, type: string, rows: { id: string }[], title: (r: never) => string, desc: (r: never) => string) =>
    rows.forEach((r, i) => {
      const code = `${prefix}${i + 1}`;
      codes[code] = { type, id: r.id, title: title(r as never) };
      lines.push(`${code} [${type}] ${title(r as never)}: ${desc(r as never)}`);
    });
  add("T", "trend", trends, (t: Trend) => t.title, (t: Trend) => `${t.what} (${t.maturity}, opportunity ${t.opportunity_score}/10)`);
  add("I", "idea", ideas, (i: Idea) => i.title, (i: Idea) => i.one_liner);
  add("P", "person", people, (p: { name: string }) => p.name, (p: { role: string; company: string }) => `${p.role}, ${p.company}`);
  add("S", "speaking", speaking, (s: Speaking) => s.name, (s: Speaking) => `${s.kind}, ${s.location}, ${s.start_date ?? "tbc"}, CFP ${s.cfp_status}`);
  add("B", "partnership", brands, (b: { brand: string }) => b.brand, (b: { opportunity: string }) => b.opportunity);
  return { codes, text: lines.join("\n") };
}

registerWorkflow({
  kind: "opportunity_engine",
  title: "Opportunity engine",
  agent: "chief_of_staff",
  async run(ctx) {
    const db = getDb();
    const inv = await opportunityInventory();
    if (Object.keys(inv.codes).length < 3) return { summary: "Not enough discoveries yet to connect. Run the trend radar, venture ideas, people and speaking scans first." };
    const existing = await db.list("opportunities");
    const res = await ctx.step("chief_of_staff", "Connecting trends, ideas, people, events and partnerships", async () =>
      (await callAgent({
        agent: "chief_of_staff", taskId: ctx.task.id, schema: z.object({ opportunities: z.array(OppZ) }),
        prompt: `Here is everything the team has discovered recently. Connect them into 1-3 genuinely actionable opportunities for Sean, each combining at least three items of different types (e.g. a trend + an idea + a person + an event + a partnership + a content angle). Only propose strong ones; return none if nothing connects well.\nEach action must be something the team can carry out (research, draft outreach, build a deck, draft a LinkedIn post, find a contact).\nAlready proposed (don't repeat): ${existing.map((o) => o.title).join("; ") || "none"}\n\n${inv.text}`,
      })).data.opportunities,
    );
    const saved: Opportunity[] = [];
    for (const o of res) {
      const items = o.items.map((it) => (inv.codes[it.ref] ? { ...inv.codes[it.ref], role: it.role } : null)).filter((x): x is NonNullable<typeof x> => Boolean(x));
      if (new Set(items.map((i) => i.type)).size < 2) continue;
      const key = dedupeKey(o.title);
      if (existing.some((e) => e.dedupe_key === key)) continue;
      const row: Opportunity = { id: newId("opp"), title: o.title, thesis: o.thesis, why_now: o.why_now, items, actions: o.actions.map((a) => ({ ...a, done: false })), score: clamp(Math.round(o.score), 1, 10), status: "new", dedupe_key: key, task_id: ctx.task.id, created_at: nowIso() };
      await db.insert("opportunities", row);
      ctx.deliver({ type: "opportunity", id: row.id, title: row.title });
      saved.push(row);
    }
    return { summary: summariseList("connected opportunities", saved.map((s) => s.title)) };
  },
});

/** Today's curated picks, never repeating something featured in the last 14 days. */
export async function pickOpportunities(date: string) {
  const db = getDb();
  const recent = (await db.list("briefings")).filter((b) => b.date >= addDays(date, -14) && b.date !== date);
  const used = new Set(recent.flatMap((b) => Object.values(b.opportunity_picks ?? {}).filter(Boolean) as string[]));
  const best = <T extends { id: string }>(rows: T[], score: (r: T) => number, min: number) => rows.filter((r) => !used.has(r.id) && score(r) >= min).sort((a, b) => score(b) - score(a))[0] ?? null;
  const trend = best((await db.list("trends", { where: { status: ["new", "saved"] } })), (t) => t.opportunity_score + t.momentum, 9);
  const idea = best((await db.list("ideas", { where: { verdict: ["explore"] } })).filter((i) => i.status !== "archived"), (i) => (i.scores ? i.scores.market + i.scores.fit + i.scores.novelty : 15), 15);
  const person = best((await db.list("people", { where: { status: ["suggested", "saved"] } })).filter((p) => /found|ceo|director|partner/i.test(`${p.role} ${p.category}`)), () => 1, 1);
  const speaking = best((await db.list("speaking", { where: { status: ["discovered", "saved"] } })).filter((s) => s.cfp_status === "open" || s.cfp_status === "rolling"), (s) => (s.deadline ? 2 : 1), 1);
  const partnership = best((await db.list("partnerships", { where: { status: ["discovered", "shortlisted", "outreach_ready"] } })), (p) => (p.contacts.length ? 2 : 1), 1);
  const ids = { trend_id: trend?.id ?? null, idea_id: idea?.id ?? null, person_id: person?.id ?? null, speaking_id: speaking?.id ?? null, partnership_id: partnership?.id ?? null };
  const summary = [trend && `Trend: ${trend.title}`, idea && `Idea: ${idea.title}`, person && `Person: ${person.name} (${person.company})`, speaking && `Speaking: ${speaking.name}`, partnership && `Partnership: ${partnership.brand}`].filter(Boolean).join("; ");
  return { ids, summary };
}

registerWorkflow({
  kind: "opportunity_report",
  title: "Friday opportunity report",
  agent: "chief_of_staff",
  async run(ctx) {
    const db = getDb();
    const inv = await opportunityInventory();
    const opps = (await db.list("opportunities")).filter((o) => o.status !== "dismissed").slice(-6);
    const r = await ctx.step("chief_of_staff", "Writing the weekly opportunity report", async () =>
      (await callAgent({
        agent: "chief_of_staff", taskId: ctx.task.id, effort: "medium", schema: z.object({ title: z.string(), summary: z.string(), body: z.string().describe("Markdown: Top opportunities, Trends, Ideas, People, Stages, Partnerships, Recommended moves for next week") }),
        prompt: `Write Sean's Friday Opportunity Report on the strongest discoveries of the week. Be selective and honest; say what to act on, what to monitor and what to drop.\nConnected opportunities:\n${opps.map((o) => `- ${o.title}: ${o.thesis}`).join("\n") || "none"}\nDiscoveries:\n${inv.text || "none yet"}`,
      })).data,
    );
    const id = newId("rep");
    await db.insert("reports", { id, kind: "opportunity_report", title: r.title, summary: r.summary, body: r.body, slides: [], sources: [], subject_ref: null, scope: "personal", tags: ["opportunities"], images: [], task_id: ctx.task.id, created_at: nowIso() });
    ctx.deliver({ type: "report", id, title: r.title });
    return { summary: r.summary };
  },
});
