import { getDb } from "@/lib/db";
import { body, HttpError, json, route } from "@/lib/api";
import { getModel, newModel, saveModel } from "@/lib/founder/core";
import { toCsv, type Scenario } from "@/lib/founder/finmodel";
import { cleanModelPatch } from "@/lib/founder/validate";
import { gbpUsd } from "@/lib/integrations/fx";

type Ctx = { params: Promise<{ ventureId: string }> };

/** CSV export (opens in Excel, Numbers or Google Sheets), or the version list. */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const { ventureId } = await params;
  const db = getDb();
  const v = await db.get("ventures", ventureId);
  const m = await getModel(ventureId);
  if (!v || !m) throw new HttpError(404, "No model yet");
  const url = new URL(req.url);
  if (url.searchParams.get("format") === "csv") {
    const sc = (["base", "upside", "downside"].includes(url.searchParams.get("scenario") ?? "") ? url.searchParams.get("scenario") : "base") as Scenario;
    return new Response(toCsv(m, v.name, sc), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${v.name.replace(/[^\w-]+/g, "_")}_model_v${m.version}_${sc}.csv"` } });
  }
  const versions = (await db.list("fin_model_versions", { where: { venture_id: ventureId } })).sort((a, b) => b.version - a.version);
  return json({ model: m, versions: versions.map(({ snapshot: _s, ...r }) => r) });
});

/** Every save is a new, auditable version. */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const { ventureId } = await params;
  const db = getDb();
  if (!(await db.get("ventures", ventureId))) throw new HttpError(404, "Venture not found");
  const b = await body<Record<string, unknown> & { action?: "refresh_fx" | "restore"; version?: number; note?: string }>(req);
  const cur = (await getModel(ventureId)) ?? (await newModel(ventureId));
  if (b.action === "refresh_fx") {
    const fx = await gbpUsd();
    if (!fx) throw new HttpError(502, "Couldn't reach the ECB rate service. Enter the rate by hand instead.");
    return json({ model: await saveModel(ventureId, { fx }, "sean", `FX refreshed: ${fx.gbp_usd} (${fx.as_of})`) });
  }
  if (b.action === "restore") {
    const ver = (await db.list("fin_model_versions", { where: { venture_id: ventureId } })).find((x) => x.version === Number(b.version));
    if (!ver) throw new HttpError(404, "Version not found");
    const { version: _v, ...snap } = ver.snapshot;
    return json({ model: await saveModel(ventureId, snap, "sean", `Restored v${ver.version}`) });
  }
  const patch = cleanModelPatch(b, cur);
  if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to save");
  return json({ model: await saveModel(ventureId, patch, "sean", typeof b.note === "string" && b.note.trim() ? b.note : `Edited ${Object.keys(patch).join(", ")}`) });
});
