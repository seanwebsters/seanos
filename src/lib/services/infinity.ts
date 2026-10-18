import "server-only";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/bootstrap";
import { syncGraph } from "@/lib/graph/workflows";
import { changesSince, convergences, describePath, loadWorld, missingLinks } from "@/lib/graph/query";
import { progressOf } from "@/lib/strategy/core";

const INFINITY_KINDS = ["missing", "graph_ask", "graph_extract", "ambition_plan", "strategy_review", "council", "scenario"];

export async function commandCentre() {
  await syncGraph();
  const db = getDb();
  const settings = await getSettings();
  const w = await loadWorld();
  const insights = await db.list("insights", { orderBy: { column: "created_at", ascending: false } });
  const nbm = insights.find((i) => i.next_best_move && i.status === "new") ?? null;
  const tasks = await db.list("tasks", { where: { kind: INFINITY_KINDS }, orderBy: { column: "created_at", ascending: false } });
  const lastMissing = tasks.find((t) => t.kind === "missing" && ["completed", "failed", "blocked"].includes(t.status)) ?? null;
  const findings = lastMissing ? insights.filter((i) => i.run_id === lastMissing.id && !i.next_best_move && i.status !== "dismissed") : [];
  const running = tasks.filter((t) => ["queued", "running"].includes(t.status));
  const answers = (await db.list("reports", { where: { kind: "world_answer" }, orderBy: { column: "created_at", ascending: false }, limit: 4 }));
  const ambitions = await db.list("ambitions", { orderBy: { column: "updated_at", ascending: false } });
  const items = await db.list("strategy_items");
  const missions = await Promise.all(ambitions.filter((a) => a.status !== "dropped").map(async (a) => {
    const mine = items.filter((i) => i.ambition_id === a.id);
    const roots = mine.filter((i) => !i.parent_id && i.status !== "dropped");
    const memo = new Map<string, number>();
    const prog = roots.length ? (await Promise.all(roots.map((r) => progressOf(r, mine, memo)))).reduce((s, v) => s + v, 0) / roots.length : 0;
    const activeTasks = (await Promise.all(mine.flatMap((i) => i.task_ids).map((t) => db.get("tasks", t)))).filter((t) => t && ["queued", "running"].includes(t.status)).length;
    return { a, progress: prog, objectives: mine.filter((i) => i.level === "objective" && i.status !== "dropped").length, activeTasks };
  }));
  const conv = convergences(w, 4).map((c) => ({ node: c.node, legs: c.legs.map((l) => ({ kind: l.kind, text: describePath(w, l.path, c.node.id) })), score: c.score }));
  const links = missingLinks(w, 3);
  const month = await changesSince(new Date(Date.now() - 30 * 86400000).toISOString());
  const conflicts = await db.list("graph_conflicts", { where: { status: "open" }, orderBy: { column: "created_at", ascending: false } });
  const decisions = (await db.list("decisions", { orderBy: { column: "updated_at", ascending: false } })).filter((d) => d.status !== "archived").slice(0, 4);
  const scenarios = (await db.list("scenarios", { orderBy: { column: "updated_at", ascending: false } })).slice(0, 4);
  return { decisions, scenarios, settings, counts: { nodes: w.nodes.size, edges: w.edges.length }, nbm, lastMissing, findings, running, answers, missions, conv, links, month, conflicts };
}
