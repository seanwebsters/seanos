import "server-only";
import * as z from "zod/v4";
import { getDb } from "@/lib/db";
import { callAgent } from "@/lib/ai/llm";
import { newId, nowIso } from "@/lib/util";
import { registerWorkflow } from "@/lib/engine/jobs";
import { extractBatch, pendingSources } from "./extract";
import { projectRecords, SELF_ID } from "./project";
import { refreshEmbeddings, searchNodes } from "./search";
import { changesSince, convergences, describePath, helpers, ideaOverlaps, loadWorld, missingLinks, neighbourhood, type World } from "./query";

let lastSync = 0;
/** Cheap, deterministic refresh of the world model (throttled). */
export async function syncGraph(force = false) {
  if (!force && Date.now() - lastSync < 10 * 60_000) return null;
  lastSync = Date.now();
  const r = await projectRecords();
  await refreshEmbeddings().catch(() => 0);
  return r;
}

registerWorkflow({
  kind: "graph_extract",
  title: "Update your world model",
  agent: "curator",
  async run(ctx) {
    await ctx.step("curator", "Mapping your records into the graph", () => projectRecords());
    const pending = (await pendingSources()).slice(0, Number(ctx.task.params.max ?? 48));
    let e = 0, r = 0, x = 0;
    for (let i = 0; i < pending.length; i += 6) {
      const batch = pending.slice(i, i + 6);
      const out = await ctx.step("curator", `Reading ${batch.map((b) => b.title).slice(0, 2).join(", ")}${batch.length > 2 ? "…" : ""}`, () => extractBatch(ctx.task.id, batch, (m) => ctx.log(m, "curator")));
      e += out.entities; r += out.relations; x += out.rejected;
      await ctx.progress((i + batch.length) / Math.max(1, pending.length));
    }
    await ctx.step("curator", "Refreshing search", () => refreshEmbeddings());
    const conflicts = await getDb().count("graph_conflicts", { status: "open" });
    return { summary: pending.length ? `Read ${pending.length} sources: ${e} entities, ${r} relationships${x ? ` (${x} unsupported claims rejected)` : ""}.${conflicts ? ` ${conflicts} contradiction${conflicts > 1 ? "s" : ""} to review.` : ""}` : "Everything is already mapped. Nothing new to read." };
  },
});

const AnswerZ = z.object({
  answer: z.string().describe("Markdown. Refer to entities as [[node_id]]. Only state what the evidence shows; say plainly when the graph doesn't know."),
  cited: z.array(z.string()).describe("node ids you relied on"),
  follow_ups: z.array(z.object({ label: z.string(), instruction: z.string() })).describe("0-3 useful next actions"),
});

function evidenceFor(w: World, q: string, seeds: string[]) {
  const lower = q.toLowerCase();
  const blocks: string[] = [];
  if (/missing|connection|overlook|blind/.test(lower)) {
    for (const c of convergences(w, 6)) blocks.push(`CONVERGENCE ${c.node.id} ${c.node.name}: ${c.legs.map((l) => `${l.kind}: ${describePath(w, l.path, c.node.id)}`).join(" | ")}`);
    for (const m of missingLinks(w, 8)) blocks.push(`UNLINKED ${m.a.id} ${m.a.name} ~ ${m.b.id} ${m.b.name}, both connect to ${m.via.map((v) => v.name).join(", ")}`);
  }
  if (/overlap|similar|duplicate/.test(lower) && /idea/.test(lower)) for (const o of ideaOverlaps(w, 8)) blocks.push(`OVERLAP ${o.a.id} ${o.a.name} & ${o.b.id} ${o.b.name} share ${o.shared.map((s) => s.name).join(", ")}`);
  if (/who|help|intro|network/.test(lower)) for (const s of seeds.slice(0, 2)) for (const h of helpers(w, s, 6)) blocks.push(`HELPER ${h.person.id} ${h.person.name}${h.inNetwork ? " (in your network)" : ""}: ${describePath(w, h.path!, h.person.id)}`);
  for (const s of seeds.slice(0, 4)) {
    const nb = neighbourhood(w, s, 2, 25);
    blocks.push(`ABOUT ${s} ${w.nodes.get(s)?.name}:\n${nb.edges.slice(0, 40).map((e) => `  ${w.nodes.get(e.from)?.name} —${e.label}→ ${w.nodes.get(e.to)?.name} [${Math.round(e.confidence * 100)}%${e.sources[0]?.quote ? `, "${e.sources[0].quote.slice(0, 100)}"` : ""}]`).join("\n")}`);
  }
  return blocks;
}

registerWorkflow({
  kind: "graph_ask",
  title: "Ask your world",
  agent: "chief_of_staff",
  async run(ctx) {
    const db = getDb();
    await syncGraph();
    const w = await loadWorld();
    const q = ctx.task.instruction;
    const seeds = ctx.task.context_ref?.type === "node" ? [ctx.task.context_ref.id] : (await searchNodes([...w.nodes.values()], q, 6)).map((n) => n.id);
    let extra: string[] = [];
    if (/changed|new since|since last/.test(q.toLowerCase())) {
      const since = new Date(Date.now() - (/(week)/i.test(q) ? 7 : 30) * 86400000).toISOString();
      const c = await changesSince(since);
      extra = [`CHANGES since ${since.slice(0, 10)}: ${c.added.length} new entities (${c.added.slice(0, 25).map((n) => `${n.id} ${n.name}`).join("; ")}), ${c.edges.length} new relationships, ${c.conflicts.length} new contradictions.`];
    }
    const evidence = [...extra, ...evidenceFor(w, q, seeds.length ? seeds : [SELF_ID])];
    const r = await ctx.step("chief_of_staff", "Reading your world model", async () =>
      (await callAgent({ agent: "chief_of_staff", taskId: ctx.task.id, effort: "medium", schema: AnswerZ, prompt: `Sean asks: "${q}"\nAnswer from this evidence drawn from his knowledge graph. Cite entities as [[node_id]]. If the evidence is thin, say so and suggest what to research.\n\n${evidence.join("\n") || "(the graph has nothing relevant yet)"}` })).data,
    );
    const valid = r.cited.filter((id) => w.nodes.has(id));
    const body = r.answer.replace(/\[\[([a-z0-9_]+)\]\]/gi, (_, id) => (w.nodes.has(id) ? `[${w.nodes.get(id)!.name}](/infinity/node/${id})` : ""));
    const rid = newId("rep");
    await db.insert("reports", { id: rid, kind: "world_answer", title: q.slice(0, 120), summary: body.replace(/[#*[\]()]/g, "").slice(0, 220), body: `${body}${r.follow_ups.length ? `\n\n## Next\n${r.follow_ups.map((f) => `- ${f.label}`).join("\n")}` : ""}`, slides: [], sources: [], subject_ref: ctx.task.context_ref, scope: "personal", tags: ["world", ...valid.slice(0, 10)], images: [], task_id: ctx.task.id, created_at: nowIso() });
    ctx.deliver({ type: "report", id: rid, title: q.slice(0, 80) });
    return { summary: body.slice(0, 600) };
  },
});
