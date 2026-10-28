import { getDb } from "@/lib/db";
import { HttpError, json, route } from "@/lib/api";
import { saveFile } from "@/lib/integrations/storage";
import { ensureLifeHQ } from "@/lib/life/core";
import { nowIso } from "@/lib/util";

const MAX = 6 * 1024 * 1024;

/** Sets a LIFE HQ photo: the hero, a section banner ("section:health") or a Calm project card ("project:<id>"). */
export const POST = route(async (req: Request) => {
  const form = await req.formData();
  const file = form.get("file");
  const target = String(form.get("target") ?? "");
  if (!(file instanceof File)) throw new HttpError(400, "No file");
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new HttpError(400, "Use a JPEG, PNG or WebP photo");
  if (file.size > MAX) throw new HttpError(400, "Photo is too large (max 6 MB)");
  const db = getDb();
  if (target.startsWith("project:")) {
    const p = await db.get("work_projects", target.slice(8));
    if (!p) throw new HttpError(404, "Project not found");
    const url = await saveFile(Buffer.from(await file.arrayBuffer()), file.type);
    await db.update("work_projects", p.id, { image: url, updated_at: nowIso() });
    return json({ url });
  }
  if (!/^(hero|section:[a-z]+)$/.test(target)) throw new HttpError(400, "Unknown target");
  const me = await ensureLifeHQ();
  const url = await saveFile(Buffer.from(await file.arrayBuffer()), file.type);
  await db.update("life_hq", "me", { images: { ...me.images, [target]: url }, updated_at: nowIso() });
  return json({ url });
});
