import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { nowIso } from "@/lib/util";

/** Confirm, retract or end a relationship. */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { action, date } = await body<{ action: "confirm" | "retract" | "end"; date?: string }>(req);
  const db = getDb();
  const e = await db.get("graph_edges", id);
  if (!e) throw new HttpError(404, "Not found");
  const src = { kind: "user" as const, ref: "correction", url: null, quote: null, at: nowIso() };
  if (action === "confirm") await db.update("graph_edges", id, { confidence: 1, status: "active", sources: [...e.sources, src] });
  else if (action === "retract") await db.update("graph_edges", id, { status: "retracted", sources: [...e.sources, src] });
  else if (action === "end") await db.update("graph_edges", id, { valid_to: date || nowIso().slice(0, 10), sources: [...e.sources, src] });
  else throw new HttpError(400, "Unknown action");
  await audit("sean", `graph.edge.${action}`, `edge:${id}`, `${e.from} ${e.type} ${e.to}`);
  return json({ ok: true });
});
