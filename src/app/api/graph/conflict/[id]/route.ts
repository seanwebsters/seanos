import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { nowIso } from "@/lib/util";

/** Resolve a contradiction by picking what's true (the other becomes past, or is retracted). */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { choice, mode } = await body<{ choice?: string; mode?: "past" | "wrong" | "both" | "dismiss" }>(req);
  const db = getDb();
  const c = await db.get("graph_conflicts", id);
  if (!c) throw new HttpError(404, "Not found");
  if (mode === "dismiss") {
    await db.update("graph_conflicts", id, { status: "dismissed", resolved_at: nowIso() });
  } else if (c.kind === "attribute" && c.attribute && choice) {
    const n = await db.get("graph_nodes", c.node_id);
    if (n) await db.update("graph_nodes", n.id, { attributes: { ...n.attributes, [c.attribute]: choice }, updated_at: nowIso() });
    await db.update("graph_conflicts", id, { status: "resolved", resolution: `${c.attribute} = ${choice}`, resolved_at: nowIso() });
  } else if (c.kind === "functional") {
    if (mode !== "both") {
      for (const eid of c.edge_ids) {
        const e = await db.get("graph_edges", eid);
        const target = e ? await db.get("graph_nodes", e.to) : null;
        if (!e || target?.name === choice) continue;
        await db.update("graph_edges", eid, mode === "wrong" ? { status: "retracted" } : { valid_to: nowIso().slice(0, 10) });
      }
    }
    await db.update("graph_conflicts", id, { status: "resolved", resolution: mode === "both" ? "Both current" : `${choice} is current${mode === "wrong" ? "; others were wrong" : "; others are past"}`, resolved_at: nowIso() });
  } else throw new HttpError(400, "Pick an option");
  await audit("sean", "graph.resolve_conflict", `conflict:${id}`, `${mode ?? ""} ${choice ?? ""}`);
  return json({ ok: true });
});
