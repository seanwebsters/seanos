import { json, route } from "@/lib/api";
import { loadWorld, neighbourhood, degree } from "@/lib/graph/query";
import { syncGraph } from "@/lib/graph/workflows";
import { SELF_ID } from "@/lib/graph/project";

/** Nodes and edges for the visual explorer: an ego network, or the most connected part of the world. */
export const GET = route(async (req: Request) => {
  await syncGraph();
  const url = new URL(req.url);
  const focus = url.searchParams.get("focus");
  const depth = Math.min(3, Number(url.searchParams.get("depth") ?? 2));
  const types = url.searchParams.get("types")?.split(",").filter(Boolean);
  const w = await loadWorld();
  let nodes, edges;
  if (focus && w.nodes.has(focus)) ({ nodes, edges } = neighbourhood(w, focus, depth, 90));
  else {
    nodes = [...w.nodes.values()].sort((a, b) => (b.id === SELF_ID ? 1 : 0) - (a.id === SELF_ID ? 1 : 0) || degree(w, b.id) - degree(w, a.id)).slice(0, 120);
    const keep = new Set(nodes.map((n) => n.id));
    edges = w.edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  }
  if (types?.length) {
    nodes = nodes.filter((n) => types.includes(n.type) || n.id === focus || n.id === SELF_ID);
    const keep = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  }
  return json({
    nodes: nodes.map((n) => ({ id: n.id, name: n.name, type: n.type, confidence: n.confidence, degree: degree(w, n.id), scope: n.scope })),
    edges: edges.map((e) => ({ id: e.id, from: e.from, to: e.to, label: e.label, confidence: e.confidence })),
    total: w.nodes.size,
  });
});
