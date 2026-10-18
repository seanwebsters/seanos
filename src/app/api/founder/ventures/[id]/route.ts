import { after } from "next/server";
import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { createTask, runTask } from "@/lib/engine";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { nowIso } from "@/lib/util";

const RUN = { build: "venture_build", model: "cfo_model", investors: "investor_research", funding: "fundraising_plan" } as const;
const TITLES = { build: "build the business", model: "update the financial model", investors: "find investors", funding: "fundraising plan" } as const;

export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const b = await body<{ action: keyof typeof RUN | "merge" | "archive" | "restore"; into?: string; instruction?: string; focus?: string }>(req);
  const db = getDb();
  const v = await db.get("ventures", id);
  if (!v) throw new HttpError(404, "Venture not found");
  if (b.action in RUN) {
    rateLimit(`founder:run:${id}`, 6, 60_000);
    const kind = RUN[b.action as keyof typeof RUN];
    const running = (await db.list("tasks", { where: { kind } })).find((t) => t.params.venture_id === id && ["queued", "running"].includes(t.status));
    if (running) return json({ task: running });
    const task = await createTask({ title: `${v.name}: ${TITLES[b.action as keyof typeof RUN]}`, instruction: (b.instruction ?? "").slice(0, 2000) || TITLES[b.action as keyof typeof RUN], kind, params: { venture_id: id, focus: b.focus?.slice(0, 300) }, contextRef: { type: "venture", id, title: v.name } });
    if (kind === "venture_build") await db.update("ventures", id, { status: "running", updated_at: nowIso() });
    if (process.env.VERCEL) after(() => runTask(task.id).then(() => undefined));
    return json({ task });
  }
  if (b.action === "archive" || b.action === "restore") {
    await db.update("ventures", id, { stage: b.action === "archive" ? "archived" : "concept", updated_at: nowIso() });
    await audit("sean", `venture.${b.action}`, `venture:${id}`, v.name);
    return json({ ok: true });
  }
  if (b.action === "merge") {
    const target = b.into ? await db.get("ventures", b.into) : null;
    if (!target || target.id === id) throw new HttpError(400, "Choose another venture to merge into.");
    // Everything moves across; the merged record stays for history.
    for (const t of ["venture_tasks", "venture_docs", "investor_pipeline"] as const) for (const r of await db.list(t, { where: { venture_id: id } })) await db.update(t, r.id, { venture_id: target.id } as never);
    await db.update("ventures", target.id, { tags: [...new Set([...target.tags, ...v.tags, `merged:${v.name}`])], conflicts: [...new Set([...target.conflicts, ...v.conflicts])], thesis: target.thesis || v.thesis, updated_at: nowIso() });
    await db.update("ventures", id, { merged_into: target.id, stage: "archived", updated_at: nowIso() });
    await audit("sean", "venture.merge", `venture:${id}`, `${v.name} → ${target.name}`);
    return json({ ok: true, into: target.id });
  }
  throw new HttpError(400, "Unknown action");
});

export const maxDuration = 300;
