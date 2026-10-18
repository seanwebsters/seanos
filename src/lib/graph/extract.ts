import "server-only";
import * as z from "zod/v4";
import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import type { NodeType, Provenance, Scope } from "@/lib/db/types";
import { callAgent } from "@/lib/ai/llm";
import { nowIso } from "@/lib/util";
import { GraphIndex, detectFunctionalConflicts, recordAttributeConflict, upsertEdge, upsertNode } from "./store";
import { CALMLINGS_ID, SELF_ID } from "./project";

export const NODE_TYPES: NodeType[] = ["person", "company", "organisation", "project", "idea", "trend", "technology", "market", "event", "product", "place", "topic"];
export const RELATIONS = [
  "works_at", "founded", "ceo_of", "worked_with", "knows", "invested_in", "acquired", "partners_with", "competes_with", "develops", "uses",
  "launched", "attends", "speaks_at", "organises", "sponsors", "located_in", "headquartered_in", "part_of", "relevant_to", "related_to", "mentions",
];

export interface Source { key: string; text: string; scope: Scope; url: string | null; title: string }

/** Everything SEAN OS knows in prose, as extraction sources. */
export async function gatherSources(): Promise<Source[]> {
  const db = getDb();
  const out: Source[] = [];
  for (const s of await db.list("stories", { orderBy: { column: "created_at", ascending: false }, limit: 120 })) {
    out.push({ key: `story:${s.id}`, title: s.headline, scope: "public", url: s.sources[0]?.url ?? null, text: `${s.headline}. ${s.dek} ${s.what} ${s.why}` });
  }
  for (const r of await db.list("reports", { orderBy: { column: "created_at", ascending: false }, limit: 60 })) {
    out.push({ key: `report:${r.id}`, title: r.title, scope: r.scope, url: r.sources[0]?.url ?? null, text: `${r.title}. ${r.summary}\n${r.body.slice(0, 5000)}` });
  }
  for (const t of await db.list("trends")) out.push({ key: `trend:${t.id}`, title: t.title, scope: "public", url: t.sources[0]?.url ?? null, text: `${t.title}. ${t.what} ${t.why} Driven by: ${t.drivers.join(", ")}. ${t.evidence.map((e) => e.claim).join(" ")}` });
  for (const p of await db.list("people")) if (p.status !== "dismissed") out.push({ key: `person:${p.id}`, title: p.name, scope: "personal", url: p.sources[0]?.url ?? null, text: `${p.name}, ${p.role} at ${p.company}, ${p.location}. ${p.achievements.join(" ")} ${p.why_valuable} ${p.notes}` });
  for (const p of await db.list("partnerships")) out.push({ key: `partnership:${p.id}`, title: p.brand, scope: "work", url: p.sources[0]?.url ?? null, text: `${p.brand}: ${p.what_they_do} ${p.positioning} ${p.relevance} ${p.opportunity}` });
  for (const s of await db.list("speaking")) out.push({ key: `speaking:${s.id}`, title: s.name, scope: "public", url: s.sources[0]?.url ?? null, text: `${s.name} (${s.kind}) in ${s.location}, organised by ${s.organiser}. ${s.audience} ${s.networking}` });
  for (const m of await db.list("memories", { where: { kind: ["fact", "relationship", "project"] } })) out.push({ key: `memory:${m.id}`, title: m.category, scope: m.scope, url: null, text: m.content });
  for (const i of await db.list("interactions")) out.push({ key: `interaction:${i.id}`, title: "Note", scope: "personal", url: null, text: i.summary });
  return out.filter((s) => s.text.trim().length > 40);
}

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);
const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

const ExtractZ = z.object({
  entities: z.array(z.object({
    ref: z.string().describe("Local id like e1, e2"),
    existing_id: z.string().nullable().describe("If this is one of the known entities, its id; else null"),
    type: z.enum(NODE_TYPES as [NodeType, ...NodeType[]]),
    name: z.string(),
    aliases: z.array(z.string()),
    summary: z.string().describe("One factual sentence from the source"),
    attributes: z.array(z.object({ key: z.string(), value: z.string() })).describe("e.g. role, location, founded, stage"),
    source_index: z.number(),
  })),
  relations: z.array(z.object({
    from: z.string().describe("Entity ref, an existing id, or SELF / CALMLINGS"),
    to: z.string(),
    type: z.enum(RELATIONS as [string, ...string[]]),
    quote: z.string().describe("Verbatim words from the source that state this relationship"),
    confidence: z.number().describe("0-1"),
    valid_from: z.string().nullable(),
    valid_to: z.string().nullable().describe("If the source says it ended, e.g. 'previously', 'former'"),
    source_index: z.number(),
  })),
});

/** Runs extraction over unextracted (or changed) sources. Returns counts. */
export async function extractBatch(taskId: string | null, sources: Source[], log: (m: string) => Promise<void> = async () => {}) {
  const db = getDb();
  const idx = await GraphIndex.load();
  const known = [...idx.byId.values()].filter((n) => n.status === "active" && n.type !== "self").sort((a, b) => b.last_seen.localeCompare(a.last_seen)).slice(0, 150);
  const res = await callAgent({
    agent: "curator", taskId, effort: "low", schema: ExtractZ, maxTokens: 16000,
    prompt: `Extract entities and relationships from these sources. Only facts the text states. Every relation needs a verbatim quote from its source.\nUse "SELF" for Sean himself and "CALMLINGS" for the Calmlings IP when the text clearly refers to them.\nKnown entities (reuse their id via existing_id when it's the same thing):\n${known.map((n) => `${n.id} [${n.type}] ${n.name}${n.aliases.length ? ` (aka ${n.aliases.slice(0, 3).join(", ")})` : ""}`).join("\n") || "none"}\n\nSources:\n${sources.map((s, i) => `[${i}] ${s.title}\n${s.text.slice(0, 3000)}`).join("\n\n")}`,
  });
  const refMap = new Map<string, string>([["SELF", SELF_ID], ["CALMLINGS", CALMLINGS_ID]]);
  const touched = new Set<string>();
  let entities = 0, relations = 0, rejected = 0;
  for (const e of res.data.entities) {
    const src = sources[e.source_index];
    if (!src) continue;
    const prov: Provenance = { kind: src.url ? "url" : "extraction", ref: src.key, url: src.url, quote: null, at: nowIso() };
    const known = e.existing_id ? idx.resolve(e.existing_id) : null;
    const { node, disagreements } = await upsertNode(idx, { id: known?.id, type: known?.type ?? e.type, name: known?.name ?? e.name, aliases: e.aliases, summary: e.summary, attributes: Object.fromEntries(e.attributes.map((a) => [a.key, a.value])), scope: src.scope, source: prov, confidence: 0.7 });
    for (const d of disagreements) await recordAttributeConflict(node, d, src.title);
    refMap.set(e.ref, node.id);
    touched.add(node.id);
    entities++;
  }
  for (const r of res.data.relations) {
    const src = sources[r.source_index];
    const from = refMap.get(r.from) ?? (idx.resolve(r.from)?.id ?? null);
    const to = refMap.get(r.to) ?? (idx.resolve(r.to)?.id ?? null);
    // Truthfulness: the quote must actually appear in the source text.
    if (!src || !from || !to || !r.quote || r.quote.length < 6 || !norm(src.text).includes(norm(r.quote))) { rejected++; continue; }
    await upsertEdge(idx, {
      from, to, type: r.type, confidence: Math.max(0, Math.min(1, r.confidence)), scope: src.scope, valid_from: r.valid_from, valid_to: r.valid_to,
      source: { kind: src.url ? "url" : "extraction", ref: src.key, url: src.url, quote: r.quote.slice(0, 300), at: nowIso() },
    });
    touched.add(from);
    relations++;
  }
  await detectFunctionalConflicts(idx, touched);
  for (const s of sources) await db.upsert("graph_ingest", { id: s.key, hash: hash(s.text), extracted_at: nowIso(), entities, relations });
  if (rejected) await log(`${rejected} relationship${rejected > 1 ? "s" : ""} rejected: no supporting quote in the source.`);
  return { entities, relations, rejected };
}

export async function pendingSources(): Promise<Source[]> {
  const db = getDb();
  const done = new Map((await db.list("graph_ingest")).map((g) => [g.id, g.hash]));
  return (await gatherSources()).filter((s) => done.get(s.key) !== hash(s.text));
}
