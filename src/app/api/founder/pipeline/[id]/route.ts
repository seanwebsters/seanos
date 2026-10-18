import { getDb } from "@/lib/db";
import type { PipelineEntry } from "@/lib/db/types";
import { body, HttpError, json, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { createTask } from "@/lib/engine";
import { nowIso } from "@/lib/util";

const STAGES: PipelineEntry["stage"][] = ["researching", "shortlisted", "contacted", "meeting", "diligence", "term_sheet", "committed", "passed"];

/**
 * Pipeline moves are Sean's record of what happened. "contacted" etc. are
 * only ever set by him; the system never marks an investor as contacted.
 */
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const b = await body<{ action: "stage" | "intro" | "draft" | "remove"; stage?: string; note?: string; via?: string }>(req);
  const db = getDb();
  const p = await db.get("investor_pipeline", id);
  if (!p) throw new HttpError(404, "Not found");
  const inv = await db.get("investors", p.investor_id);
  if (b.action === "stage") {
    if (!STAGES.includes(b.stage as PipelineEntry["stage"])) throw new HttpError(400, "Unknown stage");
    const note = String(b.note ?? "").slice(0, 500);
    await db.update("investor_pipeline", id, { stage: b.stage as PipelineEntry["stage"], history: [...p.history, { at: nowIso(), stage: b.stage!, note: note || "Moved by Sean" }], updated_at: nowIso() });
    await audit("sean", "pipeline.stage", `pipeline:${id}`, `${inv?.name ?? "investor"}: ${p.stage} → ${b.stage}`);
    return json({ ok: true });
  }
  if (b.action === "intro") {
    const via = String(b.via ?? "").trim().slice(0, 120);
    // A warm intro exists only when Sean documents who is making it.
    await db.update("investor_pipeline", id, { warm_intro: via ? { via, note: String(b.note ?? "").slice(0, 500) } : null, updated_at: nowIso() });
    await audit("sean", "pipeline.intro", `pipeline:${id}`, via ? `via ${via}` : "cleared");
    return json({ ok: true });
  }
  if (b.action === "draft") {
    const v = await db.get("ventures", p.venture_id);
    if (!inv || !v) throw new HttpError(404, "Missing investor or venture");
    const task = await createTask({
      title: `Draft: ${v.name} → ${inv.name}`, kind: "research_report", agent: "fundraising",
      instruction: `Draft a short investor outreach email from Sean about ${v.name} to ${inv.name}${inv.firm ? ` (${inv.firm})` : ""}. Their stated focus: ${inv.thesis}. ${p.warm_intro ? `Sean has a documented warm intro via ${p.warm_intro.via}; write the ask to ${p.warm_intro.via} for a double opt-in intro.` : "There is no warm intro; write a cold note and say so to Sean."} Use only facts from the venture records, label anything forecast. No contact details are known: leave the recipient blank. This is a draft for Sean to review and send himself.`,
      contextRef: { type: "venture", id: v.id, title: v.name }, params: { report_kind: "outreach_draft" },
    });
    return json({ task });
  }
  if (b.action === "remove") {
    await db.remove("investor_pipeline", id);
    return json({ ok: true });
  }
  throw new HttpError(400, "Unknown action");
});
