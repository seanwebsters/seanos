import "server-only";
import { getDb } from "@/lib/db";
import type { CapTable, FinModel, Venture, VentureDoc } from "@/lib/db/types";
import { audit } from "@/lib/audit";
import { dedupeKey, newId, nowIso } from "@/lib/util";
import { addDays, londonDate } from "@/lib/time";
import { gbpUsd } from "@/lib/integrations/fx";
import { emptyDrivers, runModel } from "./finmodel";

export async function ventureByName(name: string): Promise<Venture | null> {
  const all = (await getDb().list("ventures")).filter((v) => v.stage !== "archived" && !v.merged_into);
  const k = dedupeKey(name);
  return all.find((v) => dedupeKey(v.name) === k) ?? all.find((v) => k && (dedupeKey(v.name).includes(k) || k.includes(dedupeKey(v.name)))) ?? null;
}

export async function getModel(ventureId: string): Promise<FinModel | null> {
  return (await getDb().list("fin_models", { where: { venture_id: ventureId } }))[0] ?? null;
}

export async function newModel(ventureId: string): Promise<FinModel> {
  const fx = (await gbpUsd()) ?? { gbp_usd: 1.3, as_of: londonDate(), source: "Fallback estimate (ECB rate unavailable); edit to update" };
  const today = londonDate();
  const m: FinModel = {
    id: newId("fm"), venture_id: ventureId, version: 0, currency: "GBP", fx, start: `${today.slice(0, 7)}`, months: 36, starting_cash: 0,
    streams: {}, drivers: emptyDrivers(), opex: [], team: [], funding: [], scenarios: { upside: {}, downside: {} }, actuals: [], startup_costs: [],
    change_note: "Created", updated_by: "system", created_at: nowIso(), updated_at: nowIso(),
  };
  await getDb().insert("fin_models", m);
  return m;
}

/** Saves a new version of a model, keeping every previous version for audit. */
export async function saveModel(ventureId: string, patch: Partial<FinModel>, by: string, note: string): Promise<FinModel> {
  const db = getDb();
  const cur = (await getModel(ventureId)) ?? (await newModel(ventureId));
  const next: FinModel = { ...cur, ...patch, id: cur.id, venture_id: ventureId, version: cur.version + 1, change_note: note.slice(0, 300), updated_by: by, updated_at: nowIso() };
  const changed = (Object.keys(patch) as (keyof FinModel)[]).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(cur[k]));
  const driverChanges = patch.drivers ? patch.drivers.filter((d) => cur.drivers.find((x) => x.key === d.key)?.value !== d.value).map((d) => d.key) : [];
  await db.update("fin_models", cur.id, next);
  const { id: _id, ...snapshot } = next;
  await db.insert("fin_model_versions", { id: newId("fmv"), model_id: cur.id, venture_id: ventureId, version: next.version, snapshot, change_note: note, changed: [...changed, ...driverChanges.map((k) => `driver:${k}`)], by, at: nowIso() });
  await audit(by, "finmodel.save", `venture:${ventureId}`, `v${next.version}: ${note}`);
  return next;
}

/** One living document per (venture, kind); edits bump the version and keep recent history. */
export async function upsertDoc(ventureId: string, kind: string, doc: Partial<VentureDoc> & { title: string }, agent: string, taskId: string | null) {
  const db = getDb();
  const cur = (await db.list("venture_docs", { where: { venture_id: ventureId, kind } }))[0];
  if (cur) {
    const history = [...(((cur.data as { history?: unknown[] }).history) ?? []), { version: cur.version, body: cur.body, at: cur.updated_at }].slice(-5);
    return db.update("venture_docs", cur.id, { ...doc, data: { ...(doc.data ?? cur.data), history }, version: cur.version + 1, agent, task_id: taskId, updated_at: nowIso() });
  }
  const row: VentureDoc = { id: newId("vd"), venture_id: ventureId, kind, body: "", data: {}, checklist: [], slides: [], sources: [], basis: "estimate", status: "draft", version: 1, agent, task_id: taskId, created_at: nowIso(), updated_at: nowIso(), ...doc };
  await db.insert("venture_docs", row);
  return row;
}

export async function ensureCapTable(ventureId: string): Promise<CapTable> {
  const db = getDb();
  const cur = (await db.list("cap_tables", { where: { venture_id: ventureId } }))[0];
  if (cur) return cur;
  const row: CapTable = { id: newId("cap"), venture_id: ventureId, holders: [{ name: "Sean (assumed 100% until you enter the real cap table)", kind: "founder", shares: 1_000_000 }], rounds: [], currency: "GBP", basis: "estimate", updated_at: nowIso() };
  await db.insert("cap_tables", row);
  return row;
}

/** Signals the Chief of Staff uses for briefings and reviews; all from real records. */
export async function portfolioSignals() {
  const db = getDb();
  const today = londonDate();
  const ventures = (await db.list("ventures")).filter((v) => !["archived"].includes(v.stage) && !v.merged_into);
  const tasks = await db.list("venture_tasks");
  const pipeline = await db.list("investor_pipeline");
  const investors = new Map((await db.list("investors")).map((i) => [i.id, i]));
  const models = await db.list("fin_models");
  const docs = await db.list("venture_docs");
  const fortnight = new Date(Date.now() - 14 * 86400000).toISOString();
  const rows = ventures.map((v) => {
    const vt = tasks.filter((t) => t.venture_id === v.id);
    const m = models.find((x) => x.venture_id === v.id);
    const out = m && m.version > 0 ? runModel(m) : null;
    const readiness = docs.find((d) => d.venture_id === v.id && d.kind === "readiness");
    const ready = readiness?.checklist.length ? readiness.checklist.filter((c) => c.status === "done").length / readiness.checklist.filter((c) => c.status !== "na").length : null;
    const actuals = m?.actuals ?? [];
    const lastActual = actuals.at(-1);
    const variance = (() => {
      if (!m || !out || !lastActual) return null;
      const row = out.months.find((r) => r.label === lastActual.month);
      if (!row) return null;
      return { month: lastActual.month, revenue: lastActual.revenue - row.revenue_total, costs: lastActual.costs - (row.cogs + row.opex + row.team + row.marketing) };
    })();
    return {
      v,
      open: vt.filter((t) => t.status !== "done").length,
      done: vt.filter((t) => t.status === "done").length,
      overdue: vt.filter((t) => t.status !== "done" && t.due && t.due < today),
      dueSoon: vt.filter((t) => t.status !== "done" && t.due && t.due >= today && t.due <= addDays(today, 7)),
      stalled: vt.length > 0 && !vt.some((t) => t.updated_at >= fortnight) && v.updated_at < fortnight,
      model: m && m.version > 0 ? { version: m.version, currency: m.currency, kpis: out!.kpis, actualCash: lastActual?.cash ?? null } : null,
      readiness: ready,
      variance,
      followUps: pipeline.filter((p) => p.venture_id === v.id && p.follow_up_at && p.follow_up_at.slice(0, 10) <= today && !["passed", "committed"].includes(p.stage)).map((p) => ({ p, investor: investors.get(p.investor_id)?.name ?? "Investor" })),
      pipelineCount: pipeline.filter((p) => p.venture_id === v.id && p.stage !== "passed").length,
    };
  });
  return { today, rows, approvals: await db.count("approvals", { status: "pending" }), decisions: (await db.list("decisions", { where: { status: "ready" } })).length };
}
