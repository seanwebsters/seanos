import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import type { GraphNode } from "@/lib/db/types";
import { newId, nowIso } from "@/lib/util";

const tokens = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t));
const STOP = new Set(["the", "and", "for", "with", "that", "this", "from", "into", "are", "was", "his", "her", "its", "of", "to", "in", "on", "at", "a", "an", "is", "by", "or", "be", "as", "it", "what", "who", "which", "my", "me", "i", "show", "everything", "related"]);

const docText = (n: GraphNode) => [n.name, n.name, n.name, ...n.aliases, ...n.aliases, n.type, n.summary, ...Object.values(n.attributes)].join(" ");

/** BM25 over node names, aliases, summaries and attributes. */
export function bm25(nodes: GraphNode[], query: string, k = 20): { node: GraphNode; score: number }[] {
  const q = tokens(query);
  if (!q.length) return [];
  const docs = nodes.map((n) => tokens(docText(n)));
  const avg = docs.reduce((s, d) => s + d.length, 0) / Math.max(1, docs.length);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docs.length;
  const out = nodes.map((node, i) => {
    const d = docs[i];
    let score = 0;
    for (const t of q) {
      const f = d.filter((x) => x === t || (t.length > 4 && x.startsWith(t))).length;
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      score += (idf * f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (d.length / avg)));
    }
    return { node, score };
  });
  return out.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

export const embeddingsConfigured = () => Boolean(env.voyageApiKey);

async function embed(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.voyageApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: texts, model: env.voyageModel, input_type: inputType }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Embeddings failed (${res.status})`);
  const j = (await res.json()) as { data: { embedding: number[] }[]; usage?: { total_tokens?: number } };
  // Voyage lite pricing is ~$0.02 per million tokens; record it like any other spend.
  await getDb().insert("usage", { id: newId("use"), task_id: null, agent: "curator", provider: "voyage", model: env.voyageModel, operation: "embedding", input_tokens: j.usage?.total_tokens ?? 0, output_tokens: 0, web_searches: 0, images: 0, cost_cents: Math.round((j.usage?.total_tokens ?? 0) * 2e-6 * 1e4) / 1e4, created_at: nowIso() });
  return j.data.map((d) => d.embedding);
}

/** Embeds nodes whose text changed. No-op without VOYAGE_API_KEY. */
export async function refreshEmbeddings(limit = 256) {
  if (!embeddingsConfigured()) return 0;
  const db = getDb();
  const todo = (await db.list("graph_nodes", { where: { status: "active" } })).map((n) => ({ n, h: createHash("sha1").update(docText(n)).digest("hex").slice(0, 16) })).filter((x) => x.n.embedded_hash !== x.h).slice(0, limit);
  for (let i = 0; i < todo.length; i += 64) {
    const batch = todo.slice(i, i + 64);
    const vecs = await embed(batch.map((x) => `${x.n.type}: ${x.n.name}. ${x.n.summary}`), "document");
    for (const [j, x] of batch.entries()) await db.update("graph_nodes", x.n.id, { embedding: vecs[j], embedded_hash: x.h });
  }
  return todo.length;
}

const cos = (a: number[], b: number[]) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na * nb) || 1);
};

/** Hybrid retrieval: BM25, plus embeddings when configured, fused by reciprocal rank. */
export async function searchNodes(nodes: GraphNode[], query: string, k = 15): Promise<GraphNode[]> {
  const lexical = bm25(nodes, query, 40);
  let semantic: { node: GraphNode; score: number }[] = [];
  if (embeddingsConfigured() && nodes.some((n) => n.embedding)) {
    try {
      const [qv] = await embed([query], "query");
      semantic = nodes.filter((n) => n.embedding).map((node) => ({ node, score: cos(qv, node.embedding!) })).sort((a, b) => b.score - a.score).slice(0, 40);
    } catch {
      semantic = [];
    }
  }
  const fused = new Map<string, { node: GraphNode; score: number }>();
  for (const list of [lexical, semantic]) list.forEach((x, rank) => {
    const cur = fused.get(x.node.id) ?? { node: x.node, score: 0 };
    cur.score += 1 / (60 + rank);
    fused.set(x.node.id, cur);
  });
  return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, k).map((x) => x.node);
}
