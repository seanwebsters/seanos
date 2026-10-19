import { after } from "next/server";
import { getDb } from "@/lib/db";
import type { GrowthMetricKey } from "@/lib/db/types";
import { body, HttpError, json, route } from "@/lib/api";
import { createTask, runTask } from "@/lib/engine";
import { audit } from "@/lib/audit";
import { METRICS, parseMetricsCsv } from "@/lib/founder/growth-core";
import { rateLimit } from "@/lib/rate-limit";
import { newId, nowIso } from "@/lib/util";

type B = { action: "metric" | "csv" | "delete_metric" | "cap" | "plan" | "review" | "spend" | "kill"; date?: string; metric?: string; value?: number; note?: string; csv?: string; id?: string; cap?: number; instruction?: string };

export const POST = route(async (req: Request, { params }: { params: Promise<{ ventureId: string }> }) => {
  const { ventureId } = await params;
  const b = await body<B>(req);
  const db = getDb();
  const v = await db.get("ventures", ventureId);
  if (!v) throw new HttpError(404, "Venture not found");
  switch (b.action) {
    case "metric": {
      if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw new HttpError(400, "Date must be YYYY-MM-DD");
      if (!METRICS[b.metric as GrowthMetricKey]) throw new HttpError(400, "Unknown metric");
      const value = Number(b.value);
      if (!Number.isFinite(value) || value < 0) throw new HttpError(400, "Value must be a positive number");
      // One value per metric per day: re-entering corrects it.
      const prev = (await db.list("growth_metrics", { where: { venture_id: ventureId, date: b.date, metric: b.metric as GrowthMetricKey } }))[0];
      if (prev) await db.update("growth_metrics", prev.id, { value, note: String(b.note ?? "").slice(0, 300), source: "manual" });
      else await db.insert("growth_metrics", { id: newId("gm"), venture_id: ventureId, date: b.date, metric: b.metric as GrowthMetricKey, value, source: "manual", note: String(b.note ?? "").slice(0, 300), created_at: nowIso() });
      return json({ ok: true });
    }
    case "csv": {
      if (typeof b.csv !== "string" || b.csv.length > 2_000_000) throw new HttpError(400, "Upload a CSV under 2 MB");
      const { rows, skipped } = parseMetricsCsv(b.csv);
      if (!rows.length) throw new HttpError(400, "Couldn't find a date column plus metric columns (installs, signups, revenue, spend…) or date,metric,value rows.");
      const existing = await db.list("growth_metrics", { where: { venture_id: ventureId } });
      let added = 0, updated = 0;
      for (const r of rows) {
        const prev = existing.find((x) => x.date === r.date && x.metric === r.metric);
        if (prev) { await db.update("growth_metrics", prev.id, { value: r.value, source: "csv" }); updated++; }
        else { await db.insert("growth_metrics", { id: newId("gm"), venture_id: ventureId, ...r, source: "csv", note: "", created_at: nowIso() }); added++; }
      }
      return json({ added, updated, skipped });
    }
    case "delete_metric": {
      const m = b.id ? await db.get("growth_metrics", b.id) : null;
      if (!m || m.venture_id !== ventureId) throw new HttpError(404, "Not found");
      await db.remove("growth_metrics", m.id);
      return json({ ok: true });
    }
    case "cap": {
      const cap = Number(b.cap);
      if (!Number.isFinite(cap) || cap < 0 || cap > 100000) throw new HttpError(400, "Cap must be between £0 and £100,000");
      await db.update("ventures", ventureId, { growth_cap: Math.round(cap), updated_at: nowIso() });
      await audit("sean", "growth.cap", `venture:${ventureId}`, `£${Math.round(cap)}/month`);
      return json({ ok: true });
    }
    case "plan":
    case "review": {
      rateLimit(`growth:${b.action}:${ventureId}`, 4, 60_000);
      const kind = b.action === "plan" ? "growth_plan" : "growth_review";
      const running = (await db.list("tasks", { where: { kind } })).find((t) => t.params.venture_id === ventureId && ["queued", "running"].includes(t.status));
      if (running) return json({ task: running });
      const task = await createTask({ title: `${v.name}: ${b.action === "plan" ? "growth plan" : "growth results"}`, instruction: String(b.instruction ?? "").slice(0, 1000) || (b.action === "plan" ? "Growth plan" : "Growth results"), kind, params: { venture_id: ventureId }, contextRef: { type: "venture", id: ventureId, title: v.name } });
      if (process.env.VERCEL) after(() => runTask(task.id).then(() => undefined));
      return json({ task });
    }
    case "spend":
    case "kill": {
      const e = b.id ? await db.get("experiments", b.id) : null;
      if (!e || e.venture_id !== ventureId) throw new HttpError(404, "Experiment not found");
      if (b.action === "spend") {
        const spent = Number(b.value);
        if (!Number.isFinite(spent) || spent < 0) throw new HttpError(400, "Spend must be a positive number");
        await db.update("experiments", e.id, { spent, updated_at: nowIso() });
        await audit("sean", "experiment.spend", `experiment:${e.id}`, `£${spent}`);
      } else {
        await db.update("experiments", e.id, { status: "killed", ends_at: new Date().toISOString().slice(0, 10), updated_at: nowIso() });
        await audit("sean", "experiment.kill", `experiment:${e.id}`, e.title);
      }
      return json({ ok: true });
    }
  }
  throw new HttpError(400, "Unknown action");
});

export const maxDuration = 300;
