import "server-only";
import * as z from "zod/v4";
import { getDb } from "@/lib/db";
import type { Experience, Outfit } from "@/lib/db/types";
import { callAgent } from "@/lib/ai/llm";
import { getProfile } from "@/lib/bootstrap";
import { dedupeKey, newId, nowIso } from "@/lib/util";
import { addDays, fmtTime, londonDate, londonTimeToUtc } from "@/lib/time";
import { getWeather } from "@/lib/integrations/weather";
import { readFile } from "@/lib/integrations/storage";
import { firstOgImage } from "@/lib/integrations/og";
import { registerWorkflow, type RunContext } from "../jobs";
import { SEARCH_RULE, SourceVerifier, SourceZ, mapLimit, summariseList, toSources } from "./common";

const OutfitZ = z.object({
  title: z.string().describe("A short name for the look"),
  item_ids: z.array(z.string()).describe("IDs of wardrobe items to wear"),
  rationale: z.string(),
  occasion: z.string(),
  missing: z.array(z.string()).describe("Pieces that would complete this look if Sean doesn't own them"),
});

export async function runOutfit(ctx: RunContext): Promise<Outfit> {
  const db = getDb();
  const date = londonDate();
  const profile = await getProfile();
  const weather = await getWeather(profile.home_lat, profile.home_lng);
  const start = londonTimeToUtc(date, 0, 0).toISOString();
  const end = londonTimeToUtc(addDays(date, 1), 0, 0).toISOString();
  const events = (await db.list("events")).filter((e) => (e.all_day ? e.start === date : e.start >= start && e.start < end));
  const items = await db.list("wardrobe");
  const recent = (await db.list("outfits", { orderBy: { column: "date", ascending: false }, limit: 5 })).flatMap((o) => o.item_ids);
  const r = await ctx.step("stylist", "Styling today's outfit", async () =>
    (await callAgent({
      agent: "stylist", taskId: ctx.task.id, effort: "low", schema: OutfitZ,
      prompt: `Suggest today's outfit.\nWeather in Soho: ${weather ? `${weather.summary}, ${weather.temp_c}°C, high ${weather.high_c}°, low ${weather.low_c}°, ${weather.rain_chance}% chance of rain` : "unavailable"}.\nToday's calendar: ${events.map((e) => `${e.all_day ? "all day" : fmtTime(e.start)} ${e.title}`).join("; ") || "nothing scheduled"}.\nWardrobe (id | name | category | colours | formality 1-5):\n${items.map((i) => `${i.id} | ${i.name} | ${i.category} | ${i.colours.join("/")} | ${i.formality}${i.favourite ? " | favourite" : ""}`).join("\n") || "(empty: Sean hasn't added clothes yet. Suggest a look in general terms with item_ids empty and list the pieces in missing.)"}\nRecently worn (avoid repeating): ${recent.join(", ") || "none"}.`,
    })).data,
  );
  const valid = r.item_ids.filter((id) => items.some((i) => i.id === id));
  const prev = (await db.list("outfits", { where: { date } }))[0];
  const row: Outfit = { id: prev?.id ?? newId("fit"), date, title: r.title, item_ids: valid, rationale: r.rationale, occasion: r.occasion, weather: weather ? { temp_c: weather.temp_c, summary: weather.summary } : null, missing: r.missing, shopping: prev?.shopping ?? [], status: "suggested", task_id: ctx.task.id, created_at: nowIso() };
  await db.upsert("outfits", row);
  ctx.deliver({ type: "outfit", id: row.id, title: row.title });
  return row;
}

registerWorkflow({ kind: "outfit", title: "Today's outfit", agent: "stylist", async run(ctx) { const o = await runOutfit(ctx); return { summary: `${o.title}. ${o.rationale}` }; } });

const TagZ = z.object({ name: z.string(), category: z.enum(["top", "knitwear", "shirt", "tailoring", "outerwear", "trousers", "denim", "shorts", "shoes", "accessory", "bag", "other"]), colours: z.array(z.string()), brand: z.string().describe("Only if a visible label or logo shows it, else empty"), material: z.string().describe("Best guess, e.g. 'likely wool'"), formality: z.number().describe("1 casual - 5 formal"), seasons: z.array(z.string()) });

registerWorkflow({
  kind: "wardrobe_tag",
  title: "Catalogue a wardrobe item",
  agent: "stylist",
  async run(ctx) {
    const db = getDb();
    const item = await db.get("wardrobe", String(ctx.task.params.item_id ?? ""));
    if (!item?.image) throw new Error("No photo to catalogue.");
    const file = await readFile(item.image.split("/").pop()!);
    if (!file) throw new Error("Photo not found.");
    const r = await ctx.step("stylist", "Looking at the photo", async () =>
      (await callAgent({ agent: "stylist", taskId: ctx.task.id, effort: "low", schema: TagZ, images: [{ mime: file.mime, data: file.data.toString("base64") }], prompt: "Catalogue this clothing item for Sean's digital wardrobe. Don't guess brands you can't see." })).data,
    );
    await db.update("wardrobe", item.id, { name: r.name, category: r.category, colours: r.colours, brand: r.brand, material: r.material, formality: Math.min(5, Math.max(1, Math.round(r.formality))), seasons: r.seasons, tagged_by: "agent" });
    ctx.deliver({ type: "wardrobe", id: item.id, title: r.name });
    return { summary: `Catalogued: ${r.name}.` };
  },
});

const ShoppingZ = z.object({ summary: z.string(), body: z.string().describe("Markdown advice"), products: z.array(z.object({ name: z.string(), brand: z.string(), url: z.string(), price: z.string().nullable(), note: z.string() })), sources: z.array(SourceZ) });

registerWorkflow({
  kind: "shopping",
  title: "Shopping research",
  agent: "stylist",
  async run(ctx) {
    const db = getDb();
    const r = await ctx.step("stylist", "Researching products", async () => {
      const res = await callAgent({ agent: "stylist", taskId: ctx.task.id, webSearch: true, schema: ShoppingZ, prompt: `${ctx.task.instruction}\nRecommend fewer, better things: quality, versatility and cost per wear over trends. Real product pages only with current prices if shown. ${SEARCH_RULE}` });
      return { ...res.data, found: res.sources };
    });
    const v = new SourceVerifier();
    v.add(r.found);
    const products = r.products.filter((p) => v.has(p.url) || v.hostSeen(p.url));
    const body = `${r.body}\n\n## Picks\n${products.map((p) => `- **${p.brand} ${p.name}**${p.price ? ` (${p.price})` : ""}: ${p.note} [View](${p.url})`).join("\n")}`;
    const id = newId("rep");
    await db.insert("reports", { id, kind: "shopping", title: ctx.task.title, summary: r.summary, body, slides: [], sources: toSources(v.filter(r.sources)), subject_ref: ctx.task.context_ref, scope: "personal", tags: ["wardrobe"], images: [], task_id: ctx.task.id, created_at: nowIso() });
    if (ctx.task.context_ref?.type === "outfit") await db.update("outfits", ctx.task.context_ref.id, { shopping: products });
    ctx.deliver({ type: "report", id, title: ctx.task.title });
    return { summary: r.summary };
  },
});

const ExperienceZ = z.object({ title: z.string(), kind: z.enum(["restaurant", "bar", "exhibition", "event", "opening", "experience", "culture", "fitness", "market"]), venue: z.string(), area: z.string(), dates: z.string().describe("When, as stated by the source"), description: z.string(), why: z.string().describe("Why Sean specifically would enjoy it"), price: z.string().nullable(), url: z.string().nullable(), sources: z.array(SourceZ) });

registerWorkflow({
  kind: "london",
  title: "London this week",
  agent: "concierge",
  async run(ctx) {
    const db = getDb();
    const existing = await db.list("experiences");
    const r = await ctx.step("concierge", "Finding things worth doing in London", async () => {
      const res = await callAgent({ agent: "concierge", taskId: ctx.task.id, webSearch: true, schema: z.object({ items: z.array(ExperienceZ) }), prompt: `${ctx.task.instruction !== ctx.task.title ? ctx.task.instruction : "Find 8 specific, current things worth doing in London over the next 10 days."} Restaurants and openings, exhibitions, cultural events, design and fashion, talks, interesting experiences, ideally near Soho. Skip anything already listed: ${existing.slice(-30).map((e) => e.title).join("; ") || "none"}. ${SEARCH_RULE}` });
      return { items: res.data.items, found: res.sources };
    });
    const v = new SourceVerifier();
    v.add(r.found);
    const kept = r.items.map((i) => ({ ...i, sources: v.filter(i.sources) })).filter((i) => i.sources.length && !existing.some((e) => e.dedupe_key === dedupeKey(i.title, i.venue)));
    const images = await mapLimit(kept, 4, (i) => firstOgImage([i.url, ...i.sources.map((s) => s.url)].filter((u): u is string => Boolean(u))));
    for (const [n, i] of kept.entries()) {
      const row: Experience = { id: newId("exp"), title: i.title, kind: i.kind, venue: i.venue, area: i.area, dates: i.dates, description: i.description, why: i.why, price: i.price, url: i.url && (v.has(i.url) || v.hostSeen(i.url)) ? i.url : i.sources[0].url, image_url: images[n], sources: toSources(i.sources), status: "new", dedupe_key: dedupeKey(i.title, i.venue), discovered_at: nowIso() };
      await db.insert("experiences", row);
      ctx.cite(row.sources);
      ctx.deliver({ type: "experience", id: row.id, title: row.title });
    }
    return { summary: summariseList("London picks", kept.map((k) => k.title)) };
  },
});

const DocZ = z.object({ title: z.string(), summary: z.string(), body: z.string().describe("Markdown") });

registerWorkflow({
  kind: "meeting_prep",
  title: "Meeting preparation",
  agent: "chief_of_staff",
  async run(ctx) {
    const db = getDb();
    const ev = await db.get("events", String(ctx.task.params.event_id ?? ""));
    if (!ev) throw new Error("Event not found.");
    const people = (await db.list("people")).filter((p) => ev.description.includes(p.name) || ev.title.includes(p.name)).map((p) => `${p.name}: ${p.role}, ${p.company}. Notes: ${p.notes}`);
    const r = await ctx.step("research", `Preparing for ${ev.title}`, async () => {
      const res = await callAgent({ agent: "research", taskId: ctx.task.id, webSearch: true, schema: DocZ.extend({ sources: z.array(SourceZ) }), prompt: `Prepare Sean for this meeting: "${ev.title}" at ${ev.all_day ? ev.start : fmtTime(ev.start)}${ev.location ? `, ${ev.location}` : ""}.\nDetails: ${ev.description.slice(0, 1500) || "none"}\nPeople Sean knows: ${people.join("; ") || "none"}\nInclude: purpose, who's attending and their background (if public), talking points, smart questions, desired outcome and follow-ups. ${SEARCH_RULE}` });
      return { ...res.data, found: res.sources };
    });
    const v = new SourceVerifier();
    v.add(r.found);
    const id = newId("rep");
    await db.insert("reports", { id, kind: "meeting_prep", title: r.title, summary: r.summary, body: r.body, slides: [], sources: toSources(v.filter(r.sources)), subject_ref: { type: "event", id: ev.id, title: ev.title }, scope: "work", tags: ["calendar"], images: [], task_id: ctx.task.id, created_at: nowIso() });
    await db.update("events", ev.id, { prep_report_id: id });
    ctx.deliver({ type: "report", id, title: r.title });
    return { summary: r.summary };
  },
});

registerWorkflow({
  kind: "weekly_review",
  title: "Weekly review",
  agent: "chief_of_staff",
  async run(ctx) {
    const db = getDb();
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const done = (await db.list("tasks", { where: { status: "completed" } })).filter((t) => (t.completed_at ?? "") >= since);
    const goals = await db.list("life", { where: { kind: ["learning_goal", "savings_goal"] } });
    const workouts = (await db.list("life", { where: { kind: "workout" } })).filter((w) => w.created_at >= since);
    const ideas = (await db.list("ideas")).filter((i) => i.status === "developing" || i.verdict === "explore");
    const contacted = (await db.list("people", { where: { status: ["contacted", "met"] } })).filter((p) => (p.last_contact_at ?? "") >= since);
    const r = await ctx.step("chief_of_staff", "Reviewing the week", async () =>
      (await callAgent({ agent: "chief_of_staff", taskId: ctx.task.id, effort: "low", schema: DocZ, prompt: `Write Sean's weekly review. Sections: What got done, Projects & ideas, People, Health, Goals, Focus for next week (3 items).\nCompleted tasks: ${done.map((t) => t.title).join("; ") || "none"}\nGoals: ${goals.map((g) => `${g.title}${g.target ? ` (${g.progress ?? 0}/${g.target})` : ""}${g.done ? " ✓" : ""}`).join("; ") || "none set"}\nWorkouts logged: ${workouts.length}\nActive ideas: ${ideas.map((i) => i.title).join("; ") || "none"}\nPeople contacted: ${contacted.map((p) => p.name).join("; ") || "none"}` })).data,
    );
    const id = newId("rep");
    await db.insert("reports", { id, kind: "weekly_review", title: r.title, summary: r.summary, body: r.body, slides: [], sources: [], subject_ref: null, scope: "personal", tags: ["review"], images: [], task_id: ctx.task.id, created_at: nowIso() });
    ctx.deliver({ type: "report", id, title: r.title });
    return { summary: r.summary };
  },
});
