import { getDb } from "@/lib/db";
import { json, route } from "@/lib/api";
import { audit } from "@/lib/audit";

export const GET = route(async () => {
  const db = getDb();
  const data = { exported_at: new Date().toISOString(), nodes: (await db.list("graph_nodes")).map(({ embedding: _e, ...n }) => n), edges: await db.list("graph_edges"), conflicts: await db.list("graph_conflicts") };
  await audit("sean", "graph.export", "graph");
  return new Response(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="sean-world-${data.exported_at.slice(0, 10)}.json"` } });
});

/** Erase the world model entirely. It can be rebuilt from your records. */
export const DELETE = route(async () => {
  const db = getDb();
  for (const t of ["graph_edges", "graph_nodes", "graph_conflicts", "graph_ingest"] as const) for (const r of await db.list(t)) await db.remove(t, r.id);
  await audit("sean", "graph.erase", "graph");
  return json({ ok: true });
});
