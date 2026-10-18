import "server-only";
import { getDb } from "@/lib/db";
import type { GraphEdge, GraphNode, Scope } from "@/lib/db/types";
import { SELF_ID, CALMLINGS_ID } from "./project";

export interface World {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  adj: Map<string, { edge: GraphEdge; other: string; dir: "out" | "in" }[]>;
}

/** Loads the active graph, optionally restricted to the scopes a viewer may see. */
export async function loadWorld(scopes: Scope[] = ["personal", "work", "public"]): Promise<World> {
  const db = getDb();
  const nodes = new Map((await db.list("graph_nodes", { where: { status: "active" } })).filter((n) => scopes.includes(n.scope)).map((n) => [n.id, n]));
  const edges = (await db.list("graph_edges", { where: { status: "active" } })).filter((e) => scopes.includes(e.scope) && nodes.has(e.from) && nodes.has(e.to));
  const adj: World["adj"] = new Map();
  const push = (k: string, v: { edge: GraphEdge; other: string; dir: "out" | "in" }) => adj.set(k, [...(adj.get(k) ?? []), v]);
  for (const e of edges) {
    push(e.from, { edge: e, other: e.to, dir: "out" });
    push(e.to, { edge: e, other: e.from, dir: "in" });
  }
  return { nodes, edges, adj };
}

export const degree = (w: World, id: string) => w.adj.get(id)?.length ?? 0;

/** Nodes within `depth` hops, closest first. */
export function neighbourhood(w: World, id: string, depth = 2, limit = 60) {
  const seen = new Map<string, number>([[id, 0]]);
  let frontier = [id];
  for (let d = 1; d <= depth; d++) {
    const next: string[] = [];
    for (const f of frontier) for (const { other } of w.adj.get(f) ?? []) if (!seen.has(other)) { seen.set(other, d); next.push(other); }
    frontier = next;
  }
  const ids = [...seen.entries()].sort((a, b) => a[1] - b[1] || degree(w, b[0]) - degree(w, a[0])).slice(0, limit).map(([k]) => k);
  const set = new Set(ids);
  return { nodes: ids.map((k) => w.nodes.get(k)!).filter(Boolean), edges: w.edges.filter((e) => set.has(e.from) && set.has(e.to)), distance: seen };
}

/** Shortest paths (as edge lists) between two nodes, up to `max` hops. */
export function paths(w: World, from: string, to: string, max = 4, limit = 5): GraphEdge[][] {
  const out: GraphEdge[][] = [];
  const queue: { at: string; path: GraphEdge[]; visited: Set<string> }[] = [{ at: from, path: [], visited: new Set([from]) }];
  while (queue.length && out.length < limit) {
    const cur = queue.shift()!;
    if (cur.path.length >= max) continue;
    for (const { edge, other } of w.adj.get(cur.at) ?? []) {
      if (cur.visited.has(other)) continue;
      const path = [...cur.path, edge];
      if (other === to) { out.push(path); continue; }
      if (other === SELF_ID) continue; // don't route through Sean himself
      queue.push({ at: other, path, visited: new Set([...cur.visited, other]) });
    }
  }
  return out;
}

export function describePath(w: World, path: GraphEdge[], start: string) {
  let at = start;
  const parts = [w.nodes.get(at)?.name ?? at];
  for (const e of path) {
    const fwd = e.from === at;
    at = fwd ? e.to : e.from;
    parts.push(`${fwd ? "—" : "←"}${e.label}${fwd ? "→" : "—"}`, w.nodes.get(at)?.name ?? at);
  }
  return parts.join(" ");
}

const NETWORK = new Set(["knows", "worked_with"]);

/**
 * Convergences: an external company or technology that connects to several
 * different kinds of leverage Sean has — a person he knows, an event taking
 * speakers, and one of his projects or ideas. These become coordinated
 * opportunities.
 */
export function convergences(w: World, limit = 8) {
  const mine = new Set<string>([CALMLINGS_ID]);
  for (const { other, edge } of w.adj.get(SELF_ID) ?? []) if (["works_on", "conceived", "pursues"].includes(edge.type)) mine.add(other);
  for (const n of w.nodes.values()) if (n.type === "idea" || n.type === "goal") mine.add(n.id);
  const network = new Set((w.adj.get(SELF_ID) ?? []).filter((x) => NETWORK.has(x.edge.type)).map((x) => x.other));
  const out: { node: GraphNode; legs: { kind: "person" | "event" | "project"; path: GraphEdge[]; via: string }[]; score: number }[] = [];
  for (const x of w.nodes.values()) {
    if (!["company", "organisation", "technology", "product"].includes(x.type) || x.id === SELF_ID) continue;
    if ((w.adj.get(SELF_ID) ?? []).some((a) => a.other === x.id && a.edge.type === "works_at")) continue;
    const legs: { kind: "person" | "event" | "project"; path: GraphEdge[]; via: string }[] = [];
    // 1) Someone Sean knows, directly or one hop from the company's people.
    for (const p of network) {
      const ps = paths(w, x.id, p, 3, 1)[0];
      if (ps) { legs.push({ kind: "person", path: ps, via: p }); break; }
    }
    // 2) An event connected to it that takes speakers.
    for (const { other, edge } of w.adj.get(x.id) ?? []) {
      const ev = w.nodes.get(other);
      if (ev?.type === "event" && ["open", "rolling"].includes(ev.attributes.cfp_status ?? "")) { legs.push({ kind: "event", path: [edge], via: ev.id }); break; }
    }
    // 3) One of Sean's projects or ideas, within two hops.
    for (const m of mine) {
      const ps = paths(w, x.id, m, 2, 1)[0];
      if (ps) { legs.push({ kind: "project", path: ps, via: m }); break; }
    }
    if (legs.length >= 2) {
      const conf = legs.flatMap((l) => l.path).reduce((s, e) => s * Math.max(0.3, e.confidence), 1);
      out.push({ node: x, legs, score: legs.length + conf });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Ideas that share neighbours (trends, technologies, competitors). */
export function ideaOverlaps(w: World, limit = 10) {
  const ideas = [...w.nodes.values()].filter((n) => n.type === "idea");
  const nb = new Map(ideas.map((i) => [i.id, new Set((w.adj.get(i.id) ?? []).map((x) => x.other).filter((o) => o !== SELF_ID))]));
  const out: { a: GraphNode; b: GraphNode; shared: GraphNode[]; jaccard: number }[] = [];
  for (let i = 0; i < ideas.length; i++) for (let j = i + 1; j < ideas.length; j++) {
    const A = nb.get(ideas[i].id)!, B = nb.get(ideas[j].id)!;
    const shared = [...A].filter((x) => B.has(x) && x !== ideas[i].id && x !== ideas[j].id);
    if (!shared.length) continue;
    const jac = shared.length / new Set([...A, ...B]).size;
    out.push({ a: ideas[i], b: ideas[j], shared: shared.map((s) => w.nodes.get(s)!).filter(Boolean), jaccard: jac });
  }
  return out.sort((x, y) => y.jaccard - x.jaccard).slice(0, limit);
}

/** People who could help with a node: in or near Sean's network, ranked by path length and confidence. */
export function helpers(w: World, target: string, limit = 8) {
  const people = [...w.nodes.values()].filter((n) => n.type === "person");
  const network = new Set((w.adj.get(SELF_ID) ?? []).filter((x) => NETWORK.has(x.edge.type) || x.edge.type === "wants_to_meet").map((x) => x.other));
  return people
    .map((p) => ({ person: p, path: paths(w, p.id, target, 3, 1)[0] ?? null, inNetwork: network.has(p.id) }))
    .filter((x) => x.path)
    .map((x) => ({ ...x, score: (x.inNetwork ? 2 : 0) + 3 / x.path!.length + x.path!.reduce((s, e) => s + e.confidence, 0) / x.path!.length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Link prediction: unlinked pairs with strong shared context (Adamic–Adar). */
export function missingLinks(w: World, limit = 10) {
  const out: { a: GraphNode; b: GraphNode; via: GraphNode[]; score: number }[] = [];
  const ids = [...w.nodes.keys()].filter((k) => k !== SELF_ID).sort((a, b) => degree(w, b) - degree(w, a)).slice(0, 400);
  const nb = (k: string) => new Set((w.adj.get(k) ?? []).map((x) => x.other).filter((o) => o !== SELF_ID));
  const cache = new Map(ids.map((k) => [k, nb(k)]));
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const A = cache.get(ids[i])!, B = cache.get(ids[j])!;
    if (A.has(ids[j])) continue;
    const a = w.nodes.get(ids[i])!, b = w.nodes.get(ids[j])!;
    if (a.type === b.type && a.type !== "person" && a.type !== "idea") continue;
    let s = 0;
    const via: GraphNode[] = [];
    for (const x of A) if (B.has(x)) { s += 1 / Math.log(2 + degree(w, x)); via.push(w.nodes.get(x)!); }
    if (via.length >= 2) out.push({ a, b, via, score: s });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}

/** What changed since a date: new and updated nodes and edges, and new conflicts. */
export async function changesSince(since: string) {
  const db = getDb();
  const nodes = (await db.list("graph_nodes", { where: { status: "active" } })).filter((n) => n.first_seen >= since || n.updated_at >= since);
  const edges = (await db.list("graph_edges")).filter((e) => e.first_seen >= since);
  const conflicts = (await db.list("graph_conflicts")).filter((c) => c.created_at >= since);
  return { added: nodes.filter((n) => n.first_seen >= since), updated: nodes.filter((n) => n.first_seen < since), edges, conflicts };
}

/** A compact, scope-filtered summary of Sean's world for planning prompts. */
export function worldSummary(w: World, maxNodes = 120) {
  const ranked = [...w.nodes.values()].sort((a, b) => degree(w, b.id) - degree(w, a.id)).slice(0, maxNodes);
  const keep = new Set(ranked.map((n) => n.id));
  const lines = ranked.map((n) => `${n.id} [${n.type}] ${n.name}${n.summary ? `: ${n.summary.slice(0, 140)}` : ""}`);
  const rels = w.edges.filter((e) => keep.has(e.from) && keep.has(e.to)).slice(0, 250).map((e) => `${w.nodes.get(e.from)?.name} —${e.label}→ ${w.nodes.get(e.to)?.name} (${Math.round(e.confidence * 100)}%)`);
  return `Entities:\n${lines.join("\n")}\n\nRelationships:\n${rels.join("\n")}`;
}
