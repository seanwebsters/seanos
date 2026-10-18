import { getDb } from "@/lib/db";
import type { GraphNode, NodeType } from "@/lib/db/types";
import { body, HttpError, json, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { familyKey } from "@/lib/graph/store";
import { nowIso } from "@/lib/util";

const TYPES: NodeType[] = ["self", "person", "company", "organisation", "project", "idea", "trend", "technology", "market", "event", "goal", "document", "decision", "skill", "product", "place", "topic"];

/** Memory correction: edit, verify, change scope, hide. Every change is audited and marked as Sean's. */
export const PATCH = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const db = getDb();
  const n = await db.get("graph_nodes", id);
  if (!n) throw new HttpError(404, "Not found");
  const b = await body<Partial<GraphNode>>(req);
  const patch: Partial<GraphNode> = { updated_at: nowIso() };
  if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim().slice(0, 160);
  if (typeof b.summary === "string") patch.summary = b.summary.slice(0, 1200);
  if (b.type && TYPES.includes(b.type)) patch.type = b.type;
  if (b.scope && ["personal", "work", "public"].includes(b.scope)) patch.scope = b.scope;
  if (Array.isArray(b.aliases)) patch.aliases = b.aliases.filter((a) => typeof a === "string").slice(0, 12);
  if (b.attributes && typeof b.attributes === "object") patch.attributes = Object.fromEntries(Object.entries(b.attributes).filter(([, v]) => typeof v === "string").slice(0, 30)) as Record<string, string>;
  if (typeof b.verified === "boolean") { patch.verified = b.verified; if (b.verified) patch.confidence = 1; }
  if (b.status === "hidden" || b.status === "active") patch.status = b.status;
  if (patch.name || patch.type) patch.dedupe_key = familyKey(patch.type ?? n.type, patch.name ?? n.name);
  const edited = Object.keys(patch).filter((k) => k !== "updated_at");
  if (edited.some((k) => ["name", "summary", "type", "attributes"].includes(k))) patch.sources = [...n.sources, { kind: "user", ref: "correction", url: null, quote: null, at: nowIso() }];
  const row = await db.update("graph_nodes", id, patch);
  await audit("sean", "graph.edit", `node:${id}`, edited.join(", "));
  return json({ row });
});

/** Merge this node into another: edges move, aliases and sources combine. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { into } = await body<{ into: string }>(req);
  const db = getDb();
  const a = await db.get("graph_nodes", id);
  const b = into ? await db.get("graph_nodes", into) : null;
  if (!a || !b || a.id === b.id) throw new HttpError(400, "Choose a different node to merge into.");
  for (const e of await db.list("graph_edges")) {
    if (e.from !== id && e.to !== id) continue;
    const from = e.from === id ? into : e.from, to = e.to === id ? into : e.to;
    if (from === to) await db.update("graph_edges", e.id, { status: "retracted" });
    else await db.update("graph_edges", e.id, { from, to });
  }
  await db.update("graph_nodes", into, { aliases: [...new Set([...b.aliases, a.name, ...a.aliases])].slice(0, 20), sources: [...b.sources, ...a.sources].slice(-40), summary: b.summary || a.summary, record_ref: b.record_ref ?? a.record_ref, updated_at: nowIso() });
  await db.update("graph_nodes", id, { status: "merged", merged_into: into, updated_at: nowIso() });
  await audit("sean", "graph.merge", `node:${id}`, `into ${into} (${b.name})`);
  return json({ ok: true, into });
});

/** Forget a node: hidden from every view and agent, edges retracted. */
export const DELETE = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const db = getDb();
  if (id === "n_self") throw new HttpError(400, "That's you.");
  for (const e of await db.list("graph_edges")) if (e.from === id || e.to === id) await db.update("graph_edges", e.id, { status: "retracted" });
  await db.update("graph_nodes", id, { status: "hidden", summary: "", attributes: {}, embedding: null, updated_at: nowIso() });
  await audit("sean", "graph.forget", `node:${id}`);
  return json({ ok: true });
});
