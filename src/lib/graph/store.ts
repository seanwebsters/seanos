import "server-only";
import { getDb } from "@/lib/db";
import type { GraphEdge, GraphNode, NodeType, Provenance, Ref, Scope } from "@/lib/db/types";
import { dedupeKey, newId, nowIso } from "@/lib/util";

/** Types that are resolved against each other (a "company" and "organisation" with the same name are one node). */
const FAMILY: Partial<Record<NodeType, string>> = { company: "org", organisation: "org", technology: "tech", product: "tech" };
export const familyKey = (type: NodeType, name: string) => `${FAMILY[type] ?? type}|${dedupeKey(name)}`;

/** Relations where one subject should have a single current object. */
export const FUNCTIONAL = new Set(["works_at", "ceo_of", "headquartered_in", "located_in"]);

export const SOURCE_CAP: Record<Provenance["kind"], number> = { user: 1, record: 0.9, url: 0.8, extraction: 0.8 };

const mergeSources = (a: Provenance[], b: Provenance[]) => {
  const out = [...a];
  for (const s of b) if (!out.some((x) => x.kind === s.kind && x.ref === s.ref && x.url === s.url)) out.push(s);
  return out.slice(-30);
};

export interface NodeInput {
  id?: string;
  type: NodeType;
  name: string;
  aliases?: string[];
  summary?: string;
  attributes?: Record<string, string>;
  scope?: Scope;
  confidence?: number;
  source: Provenance;
  record_ref?: Ref | null;
}

/** In-memory index for resolving entities during a batch. */
export class GraphIndex {
  byId = new Map<string, GraphNode>();
  byKey = new Map<string, GraphNode>();
  edges = new Map<string, GraphEdge>();
  edgeKey = (from: string, to: string, type: string) => `${from}>${type}>${to}`;

  static async load() {
    const db = getDb();
    const idx = new GraphIndex();
    for (const n of await db.list("graph_nodes")) idx.addNode(n);
    for (const e of await db.list("graph_edges")) idx.edges.set(idx.edgeKey(e.from, e.to, e.type), e);
    return idx;
  }

  addNode(n: GraphNode) {
    this.byId.set(n.id, n);
    if (n.status === "merged") return;
    this.byKey.set(familyKey(n.type, n.name), n);
    for (const a of n.aliases) this.byKey.set(familyKey(n.type, a), n);
  }

  /** Follows merges to the surviving node. */
  resolve(id: string): GraphNode | null {
    let n = this.byId.get(id) ?? null;
    for (let i = 0; n && n.status === "merged" && n.merged_into && i < 10; i++) n = this.byId.get(n.merged_into) ?? null;
    return n;
  }

  find(type: NodeType, name: string): GraphNode | null {
    const n = this.byKey.get(familyKey(type, name));
    return n ? this.resolve(n.id) : null;
  }
}

/**
 * Creates or enriches a node. Resolution order: explicit id → same record →
 * same name/alias within the type family. Returns the node and any attribute
 * disagreements (for contradiction detection).
 */
export async function upsertNode(idx: GraphIndex, input: NodeInput): Promise<{ node: GraphNode; disagreements: { key: string; existing: string; incoming: string }[] }> {
  const db = getDb();
  const at = nowIso();
  const existing = (input.id && idx.resolve(input.id)) || idx.find(input.type, input.name) || (input.aliases ?? []).map((a) => idx.find(input.type, a)).find(Boolean) || null;
  const conf = Math.min(input.confidence ?? SOURCE_CAP[input.source.kind], SOURCE_CAP[input.source.kind]);
  if (!existing) {
    const node: GraphNode = {
      id: input.id ?? newId("n"), type: input.type, name: input.name.trim().slice(0, 160), aliases: [...new Set(input.aliases ?? [])].slice(0, 10),
      summary: (input.summary ?? "").slice(0, 1200), attributes: input.attributes ?? {}, scope: input.scope ?? "public", confidence: conf,
      sources: [input.source], record_ref: input.record_ref ?? null, dedupe_key: familyKey(input.type, input.name), status: "active", merged_into: null,
      verified: input.source.kind === "user", embedding: null, embedded_hash: null, first_seen: at, last_seen: at, updated_at: at,
    };
    await db.insert("graph_nodes", node);
    idx.addNode(node);
    return { node, disagreements: [] };
  }
  const disagreements: { key: string; existing: string; incoming: string }[] = [];
  const attributes = { ...existing.attributes };
  const fromNewSource = !existing.sources.some((s) => s.kind === input.source.kind && s.ref === input.source.ref);
  for (const [k, v] of Object.entries(input.attributes ?? {})) {
    if (!v) continue;
    const cur = attributes[k];
    if (!cur || existing.record_ref && input.record_ref?.id === existing.record_ref.id) attributes[k] = v;
    else if (dedupeKey(cur) !== dedupeKey(v) && fromNewSource && !existing.verified) disagreements.push({ key: k, existing: cur, incoming: v });
  }
  const patch: Partial<GraphNode> = {
    aliases: [...new Set([...existing.aliases, ...(input.aliases ?? []), ...(dedupeKey(input.name) !== dedupeKey(existing.name) ? [input.name] : [])])].slice(0, 12),
    summary: existing.verified ? existing.summary : existing.summary || input.summary || "",
    attributes, sources: mergeSources(existing.sources, [input.source]),
    // Independent confirmation raises confidence a little, never above the strongest source.
    confidence: existing.verified ? 1 : Math.min(Math.max(existing.confidence, conf) + (fromNewSource ? 0.05 : 0), Math.max(...[...existing.sources, input.source].map((s) => SOURCE_CAP[s.kind]))),
    record_ref: existing.record_ref ?? input.record_ref ?? null,
    // Work scope is sticky: anything touched by work material stays private to work agents.
    scope: existing.scope === "work" || input.scope === "work" ? "work" : existing.scope === "personal" || input.scope === "personal" ? "personal" : "public",
    last_seen: at, updated_at: at,
  };
  if (input.record_ref && existing.record_ref?.id === input.record_ref.id && input.summary) patch.summary = input.summary;
  const node = await db.update("graph_nodes", existing.id, patch);
  idx.addNode(node);
  return { node, disagreements };
}

export interface EdgeInput {
  from: string;
  to: string;
  type: string;
  label?: string;
  confidence?: number;
  source: Provenance;
  scope?: Scope;
  valid_from?: string | null;
  valid_to?: string | null;
}

export async function upsertEdge(idx: GraphIndex, input: EdgeInput): Promise<GraphEdge | null> {
  if (input.from === input.to) return null;
  const db = getDb();
  const at = nowIso();
  const key = idx.edgeKey(input.from, input.to, input.type);
  const cur = idx.edges.get(key);
  const conf = Math.min(input.confidence ?? SOURCE_CAP[input.source.kind], SOURCE_CAP[input.source.kind]);
  if (cur) {
    if (cur.status === "retracted" && input.source.kind !== "user") return cur; // Sean removed it; don't resurrect.
    const fresh = !cur.sources.some((s) => s.kind === input.source.kind && s.ref === input.source.ref);
    const e = await db.update("graph_edges", cur.id, {
      sources: mergeSources(cur.sources, [input.source]), confidence: Math.min(Math.max(cur.confidence, conf) + (fresh ? 0.05 : 0), 1), last_seen: at,
      valid_to: input.valid_to ?? cur.valid_to, status: "active",
    });
    idx.edges.set(key, e);
    return e;
  }
  const e: GraphEdge = {
    id: newId("e"), from: input.from, to: input.to, type: input.type, label: input.label ?? input.type.replace(/_/g, " "), confidence: conf,
    sources: [input.source], scope: input.scope ?? "public", valid_from: input.valid_from ?? null, valid_to: input.valid_to ?? null, status: "active", first_seen: at, last_seen: at,
  };
  await db.insert("graph_edges", e);
  idx.edges.set(key, e);
  return e;
}

/** Contradiction detection: a functional relation with more than one current target. */
export async function detectFunctionalConflicts(idx: GraphIndex, nodeIds: Set<string>) {
  const db = getDb();
  const open = await db.list("graph_conflicts", { where: { status: "open" } });
  const resolved = await db.list("graph_conflicts", { where: { status: ["resolved", "dismissed"] } });
  let created = 0;
  for (const id of nodeIds) {
    const byType = new Map<string, GraphEdge[]>();
    for (const e of idx.edges.values()) {
      if (e.from !== id || e.status !== "active" || e.valid_to || !FUNCTIONAL.has(e.type)) continue;
      byType.set(e.type, [...(byType.get(e.type) ?? []), e]);
    }
    for (const [type, list] of byType) {
      if (list.length < 2) continue;
      const ids = list.map((e) => e.id).sort();
      const sig = ids.join(",");
      if ([...open, ...resolved].some((c) => c.edge_ids.slice().sort().join(",") === sig)) continue;
      const subject = idx.byId.get(id)?.name ?? id;
      const targets = list.map((e) => idx.byId.get(e.to)?.name ?? e.to);
      await db.insert("graph_conflicts", {
        id: newId("cf"), kind: "functional", node_id: id, edge_ids: ids, attribute: null,
        description: `${subject} ${type.replace(/_/g, " ")} ${targets.join(" and ")}: sources disagree on which is current.`,
        options: targets, status: "open", resolution: null, created_at: nowIso(), resolved_at: null,
      });
      created++;
    }
  }
  return created;
}

export async function recordAttributeConflict(node: GraphNode, d: { key: string; existing: string; incoming: string }, source: string) {
  const db = getDb();
  const open = await db.list("graph_conflicts", { where: { node_id: node.id } });
  if (open.some((c) => c.kind === "attribute" && c.attribute === d.key && c.options.includes(d.incoming) && c.options.includes(d.existing))) return;
  await db.insert("graph_conflicts", {
    id: newId("cf"), kind: "attribute", node_id: node.id, edge_ids: [], attribute: d.key, description: `${node.name}: "${d.key}" is "${d.existing}" in one source and "${d.incoming}" in ${source}.`,
    options: [d.existing, d.incoming], status: "open", resolution: null, created_at: nowIso(), resolved_at: null,
  });
}
