import "server-only";
import * as z from "zod/v4";
import { getDb } from "@/lib/db";
import type { Outreach, Partnership } from "@/lib/db/types";
import { callAgent } from "@/lib/ai/llm";
import { dedupeKey, newId, nowIso } from "@/lib/util";
import { generateImage, imagesConfigured } from "@/lib/integrations/images";
import { firstOgImage } from "@/lib/integrations/og";
import { registerWorkflow, type RunContext } from "../jobs";
import { ContactZ, SEARCH_RULE, SourceVerifier, SourceZ, summariseList, toSources } from "./common";

const BrandZ = z.object({
  brand: z.string(),
  category: z.string(),
  what_they_do: z.string(),
  audience: z.string(),
  positioning: z.string(),
  relevance: z.string().describe("Why they might be relevant to Calmlings"),
  opportunity: z.string().describe("How a collaboration could work"),
  unexpected: z.boolean().describe("True for a non-obvious partner"),
  sources: z.array(SourceZ),
});
const ConceptZ = z.object({ brand: z.string(), title: z.string(), summary: z.string(), products: z.array(z.string()), experiences: z.array(z.string()), campaign: z.string() });
const CommercialZ = z.object({
  brand: z.string(),
  models: z.array(z.string()).describe("Revenue models: licensing royalty, co-branded product, sponsorship, content deal..."),
  estimates: z.array(z.object({ label: z.string(), value: z.string(), basis: z.enum(["illustrative", "verified"]), source_url: z.string().nullable() })),
  strategic_benefits: z.array(z.string()),
});
const OutreachZ = z.object({ brand: z.string(), contacts: z.array(ContactZ), subject: z.string(), body: z.string().describe("Short, warm, confident email in Sean's voice. Not corporate.") });

export async function developPartnerships(ctx: RunContext, brands: z.infer<typeof BrandZ>[], verifier: SourceVerifier, opts: { deck?: boolean; visuals?: boolean } = {}) {
  const db = getDb();
  const list = brands.map((b) => `- ${b.brand} (${b.category}): ${b.what_they_do}. Opportunity: ${b.opportunity}`).join("\n");
  const concepts = await ctx.step("creative", "Developing collaboration concepts", async () =>
    (await callAgent({ agent: "creative", taskId: ctx.task.id, schema: z.object({ concepts: z.array(ConceptZ) }), prompt: `Develop a distinctive Calmlings collaboration concept for each brand: a name, core idea, possible products, experiences and a campaign.\n${list}` })).data.concepts,
  );
  await ctx.progress(0.45);
  const commercial = await ctx.step("strategist", "Evaluating commercial potential", async () =>
    (await callAgent({ agent: "strategist", taskId: ctx.task.id, schema: z.object({ items: z.array(CommercialZ) }), prompt: `For each Calmlings collaboration below, outline revenue models, licensing structures, sponsorship options and strategic benefits. Any number you give must be labelled basis "illustrative" unless you cite a verified source_url.\n${list}\nConcepts:\n${concepts.map((c) => `- ${c.brand}: ${c.title}. ${c.summary}`).join("\n")}` })).data.items,
  );
  await ctx.progress(0.6);
  const outreach = await ctx.step("bizdev", "Finding the right people and drafting outreach", async () => {
    const r = await callAgent({ agent: "bizdev", taskId: ctx.task.id, webSearch: true, schema: z.object({ items: z.array(OutreachZ) }), prompt: `For each brand, find publicly identifiable partnership, licensing, marketing or business development contacts, and draft a short introductory email from Sean (Creative Technology Director, Calm Studios, working on Calmlings) proposing the concept.\n${concepts.map((c) => `- ${c.brand}: ${c.title}. ${c.summary}`).join("\n")}\nOnly list a contact if a public page shows that person in that role; copy the page URL into source_url. Email only if published. If none is verifiable, return an empty contacts list. ${SEARCH_RULE}` });
    return { items: r.data.items, found: r.sources };
  });
  verifier.add(outreach.found);
  await ctx.progress(0.75);
  let slides: Record<string, { title: string; bullets: string[] }[]> = {};
  if (opts.deck) {
    slides = await ctx.step("creative", "Building the partnership deck", async () => {
      const r = await callAgent({ agent: "creative", taskId: ctx.task.id, schema: z.object({ decks: z.array(z.object({ brand: z.string(), slides: z.array(z.object({ title: z.string(), bullets: z.array(z.string()) })) })) }), prompt: `Write a concise 8-slide partnership deck for each collaboration (Cover, Why ${"{brand}"}, Why Calmlings, The idea, Products & experiences, Campaign, Commercial model (label illustrative numbers), Next steps).\n${concepts.map((c) => `- ${c.brand}: ${c.title}. ${c.summary}. Products: ${c.products.join(", ")}`).join("\n")}` });
      return Object.fromEntries(r.data.decks.map((d) => [d.brand.toLowerCase(), d.slides]));
    });
  }
  const out: Partnership[] = [];
  for (const b of brands) {
    const key = b.brand.toLowerCase();
    const c = concepts.find((x) => x.brand.toLowerCase() === key);
    const m = commercial.find((x) => x.brand.toLowerCase() === key);
    const o = outreach.items.find((x) => x.brand.toLowerCase() === key);
    const contacts = (o?.contacts ?? []).filter((ct) => verifier.has(ct.source_url) || verifier.hostSeen(ct.source_url)).map((ct) => ({ ...ct, email: ct.email && /@/.test(ct.email) ? ct.email : null }));
    const estimates = (m?.estimates ?? []).map((e) => (e.basis === "verified" && !verifier.has(e.source_url) ? { ...e, basis: "illustrative" as const, source_url: null } : e));
    let images: string[] = [];
    if (opts.visuals && c) {
      images = await ctx.step("creative", `Generating visual mockups for ${b.brand}`, async () => {
        if (!imagesConfigured()) {
          await ctx.log("Visual mockups skipped: add FAL_KEY to enable image generation.", "creative", "warn");
          return [] as string[];
        }
        const urls: string[] = [];
        for (const p of [c.products[0], c.campaign].filter(Boolean).slice(0, 2)) {
          urls.push(await generateImage(`Premium product concept photography: ${p}. A collaboration between ${b.brand} and Calmlings, gentle, calm, soft characters. Studio lighting, editorial, no text, no real logos.`, ctx.task.id));
        }
        return urls;
      });
    }
    const existing = (await db.list("partnerships")).find((p) => p.dedupe_key === dedupeKey(b.brand));
    const row: Partnership = {
      id: existing?.id ?? newId("ptn"), brand: b.brand, category: b.category, what_they_do: b.what_they_do, audience: b.audience, positioning: b.positioning,
      relevance: b.relevance, opportunity: b.opportunity,
      concept: c ? { title: c.title, summary: c.summary, products: c.products, experiences: c.experiences, campaign: c.campaign } : { title: "", summary: "", products: [], experiences: [], campaign: "" },
      commercial: { models: m?.models ?? [], estimates, strategic_benefits: m?.strategic_benefits ?? [] },
      contacts, outreach: o ? { subject: o.subject, body: o.body } : null, slides: slides[key] ?? existing?.slides ?? [], images: [...(existing?.images ?? []), ...images],
      status: o ? "outreach_ready" : "discovered", sources: toSources(b.sources), unexpected: b.unexpected, dedupe_key: dedupeKey(b.brand), task_id: ctx.task.id,
      created_at: existing?.created_at ?? nowIso(), updated_at: nowIso(), verified_at: nowIso(),
    };
    await db.upsert("partnerships", row);
    if (o) {
      const or: Outreach = { id: newId("out"), target_type: "partnership", target_id: row.id, target_name: b.brand, channel: "email", to: contacts.find((x) => x.email)?.email ?? null, subject: o.subject, body: o.body, status: "draft", follow_up_at: null, reply_note: "", approved_at: null, sent_at: null, created_at: nowIso(), updated_at: nowIso() };
      await db.insert("outreach", or);
      await ctx.needsApproval({ type: "outreach", ref_id: or.id, title: `Outreach to ${b.brand}`, summary: o.subject, agent: "bizdev" });
    }
    ctx.cite(row.sources);
    ctx.deliver({ type: "partnership", id: row.id, title: b.brand });
    out.push(row);
  }
  return out;
}

registerWorkflow({
  kind: "partnerships",
  title: "Calmlings partnership discovery",
  agent: "partnerships",
  async run(ctx) {
    const db = getDb();
    const count = Number(ctx.task.params.count ?? 6);
    const focus = String(ctx.task.params.focus ?? "");
    const known = (await db.list("partnerships")).map((p) => p.brand);
    const passed = (await db.list("memories", { where: { kind: "feedback", category: "Calmlings" } })).map((m) => m.content);
    const verifier = new SourceVerifier();
    const disc = await ctx.step("partnerships", `Discovering ${count} potential partners`, async () => {
      const r = await callAgent({ agent: "partnerships", taskId: ctx.task.id, webSearch: true, schema: z.object({ brands: z.array(BrandZ) }), prompt: `Find ${count} potential Calmlings partners across entertainment studios, technology, consumer brands, toys, fashion, food and beverage, wellness, gaming, music, publishing, retail, hospitality, film and TV, creators. Include both obvious and unexpected partners and use recent news (launches, campaigns, licensing deals) as evidence. ${focus ? `Focus: ${focus}.` : ""}\nAlready in the pipeline (skip): ${known.join(", ") || "none"}.\n${passed.length ? `Sean's feedback: ${passed.join("; ")}` : ""}\n${SEARCH_RULE}` });
      return { brands: r.data.brands, found: r.sources };
    });
    verifier.add(disc.found);
    const brands = disc.brands.map((b) => ({ ...b, sources: verifier.filter(b.sources) })).filter((b) => b.sources.length && !known.some((k) => dedupeKey(k) === dedupeKey(b.brand)));
    await ctx.progress(0.3);
    if (!brands.length) return { summary: "No new verifiable partners this time." };
    const rows = await developPartnerships(ctx, brands, verifier);
    return { summary: summariseList("partnership opportunities", rows.map((r) => r.brand)), awaitingApproval: rows.some((r) => r.outreach) };
  },
});

registerWorkflow({
  kind: "partnership_pack",
  title: "Partnership pack",
  agent: "partnerships",
  async run(ctx) {
    const db = getDb();
    const existing = ctx.task.params.partnership_id ? await db.get("partnerships", String(ctx.task.params.partnership_id)) : null;
    const brand = existing?.brand ?? String(ctx.task.params.brand ?? ctx.task.instruction);
    const verifier = new SourceVerifier();
    const res = await ctx.step("research", `Researching ${brand}`, async () => {
      const r = await callAgent({ agent: "research", taskId: ctx.task.id, webSearch: true, schema: z.object({ brands: z.array(BrandZ) }), prompt: `Research ${brand} as a potential Calmlings partner: what they do, audience, positioning, recent campaigns and licensing activity, and why they could be a good partner. Return exactly one brand. ${ctx.task.instruction}\n${SEARCH_RULE}` });
      return { brands: r.data.brands.slice(0, 1), found: r.sources };
    });
    verifier.add(res.found);
    if (existing) for (const s of existing.sources) verifier.add([s]);
    const brands = res.brands.map((b) => ({ ...b, sources: verifier.filter([...b.sources, ...(existing?.sources ?? []).map((s) => ({ ...s, publisher: s.publisher ?? null, date: s.date ?? null }))]) }));
    if (!brands.length || !brands[0].sources.length) throw new Error(`Couldn't verify enough about ${brand}.`);
    await ctx.progress(0.3);
    const [row] = await developPartnerships(ctx, brands, verifier, { deck: true, visuals: true });
    if (row && !row.images.length) {
      const og = await firstOgImage(row.sources.map((s) => s.url));
      if (og) await db.update("partnerships", row.id, { images: [og] });
    }
    return { summary: `${brand}: concept "${row?.concept.title}", ${row?.contacts.length ?? 0} verified contacts, deck and outreach ready for review.`, awaitingApproval: Boolean(row?.outreach) };
  },
});
