import "server-only";
import * as z from "zod/v4";
import { getDb } from "@/lib/db";
import type { Draft, Ref } from "@/lib/db/types";
import { callAgent } from "@/lib/ai/llm";
import { newId, nowIso } from "@/lib/util";
import { registerWorkflow, type RunContext } from "../jobs";
import { summariseList } from "./common";

export const PLATFORMS = ["linkedin", "instagram", "x", "essay", "website", "carousel", "video", "script", "thread"] as const;

const DraftZ = z.object({
  platform: z.enum(PLATFORMS),
  title: z.string(),
  hook: z.string().describe("The first line"),
  body: z.string().describe("The full draft, ready to post"),
  slides: z.array(z.object({ title: z.string(), body: z.string() })).describe("Carousel slides or video beats; empty for plain posts"),
  notes: z.string().describe("Why this angle, and any visual direction"),
  source_index: z.number().nullable().describe("Index of the source material used, or null"),
});

/** Public-safe material only: never Calm (work) partnerships or work reports. */
async function publicMaterial() {
  const db = getDb();
  const stories = (await db.list("stories", { orderBy: { column: "created_at", ascending: false }, limit: 18 })).map((s) => ({ ref: { type: "story", id: s.id, title: s.headline } as Ref, text: `${s.headline}: ${s.what} Why: ${s.why}` }));
  const trends = (await db.list("trends", { where: { status: ["new", "saved"] }, orderBy: { column: "discovered_at", ascending: false }, limit: 6 })).map((t) => ({ ref: { type: "trend", id: t.id, title: t.title } as Ref, text: `Trend: ${t.title}: ${t.what}` }));
  const reports = (await db.list("reports", { where: { scope: "public" }, orderBy: { column: "created_at", ascending: false }, limit: 3 })).map((r) => ({ ref: { type: "report", id: r.id, title: r.title } as Ref, text: `Report: ${r.title}: ${r.summary}` }));
  return [...stories, ...trends, ...reports];
}

async function saveDrafts(ctx: RunContext, drafts: z.infer<typeof DraftZ>[], material: { ref: Ref }[], fixedRef: Ref | null) {
  const db = getDb();
  const out: Draft[] = [];
  for (const d of drafts) {
    const row: Draft = {
      id: newId("drf"), platform: d.platform, title: d.title, hook: d.hook, body: d.body, slides: d.slides, notes: d.notes, status: "awaiting_approval",
      scheduled_for: null, source_ref: fixedRef ?? (d.source_index !== null ? material[d.source_index]?.ref ?? null : null), agent: "social",
      original_body: d.body, version: 1, task_id: ctx.task.id, created_at: nowIso(), updated_at: nowIso(),
    };
    await db.insert("drafts", row);
    await ctx.needsApproval({ type: "draft", ref_id: row.id, title: row.title, summary: row.hook, agent: "social" });
    ctx.deliver({ type: "draft", id: row.id, title: row.title });
    out.push(row);
  }
  return out;
}

registerWorkflow({
  kind: "content_plan",
  title: "Content plan",
  agent: "brand",
  async run(ctx) {
    const count = Number(ctx.task.params.count ?? 5);
    const material = await publicMaterial();
    const angles = await ctx.step("brand", "Choosing angles where Sean has an original take", async () =>
      (await callAgent({
        agent: "brand", taskId: ctx.task.id, effort: "medium",
        schema: z.object({ angles: z.array(z.object({ angle: z.string(), platform: z.enum(PLATFORMS), source_index: z.number().nullable(), why: z.string() })) }),
        prompt: `Plan ${count} pieces of content for Sean's personal brand for the coming week. Mix formats (LinkedIn, X, Instagram carousel, a short essay, a video concept). Each needs a genuinely original perspective, not a summary of news. ${ctx.task.instruction !== ctx.task.title ? ctx.task.instruction : ""}\nSource material:\n${material.map((m, i) => `[${i}] ${m.text}`).join("\n") || "(no recent material: draw on Sean's interests)"}`,
      })).data.angles,
    );
    await ctx.progress(0.4);
    const drafts = await ctx.step("social", `Drafting ${angles.length} pieces`, async () =>
      (await callAgent({
        agent: "social", taskId: ctx.task.id, schema: z.object({ drafts: z.array(DraftZ) }),
        prompt: `Write these drafts in Sean's voice:\n${angles.map((a, i) => `${i + 1}. [${a.platform}] ${a.angle} (source ${a.source_index ?? "none"}). ${a.why}`).join("\n")}\n\nSource material:\n${material.map((m, i) => `[${i}] ${m.text}`).join("\n")}`,
      })).data.drafts,
    );
    const rows = await saveDrafts(ctx, drafts, material, null);
    return { summary: summariseList("drafts ready for review", rows.map((r) => r.title)), awaitingApproval: rows.length > 0 };
  },
});

registerWorkflow({
  kind: "content_draft",
  title: "Draft content",
  agent: "social",
  async run(ctx) {
    const db = getDb();
    const ref = ctx.task.context_ref;
    let source = "";
    if (ref?.type === "story") {
      const s = await db.get("stories", ref.id);
      if (s) source = `${s.headline}\n${s.what}\nWhy it matters: ${s.why}\nSources: ${s.sources.map((x) => x.url).join(", ")}`;
    } else if (ref?.type === "trend") {
      const t = await db.get("trends", ref.id);
      if (t) source = `${t.title}\n${t.what}\nWhy: ${t.why}`;
    } else if (ref?.type === "idea") {
      const i = await db.get("ideas", ref.id);
      if (i) source = `${i.title}: ${i.one_liner}\n${i.insight}`;
    } else if (ref?.type === "report") {
      const r = await db.get("reports", ref.id);
      if (r && r.scope !== "work") source = `${r.title}\n${r.summary}`;
    } else if (ref?.type === "draft") {
      const d = await db.get("drafts", ref.id);
      if (d) source = `Existing draft to rework:\n${d.body}`;
    }
    const drafts = await ctx.step("social", "Writing the draft", async () =>
      (await callAgent({ agent: "social", taskId: ctx.task.id, schema: z.object({ drafts: z.array(DraftZ) }), prompt: `${ctx.task.instruction}\n\n${source ? `Source:\n${source}` : ""}\nReturn one draft unless asked for more.` })).data.drafts,
    );
    const rows = await saveDrafts(ctx, drafts, [], ref);
    return { summary: summariseList("drafts ready for review", rows.map((r) => r.title)), awaitingApproval: true };
  },
});
