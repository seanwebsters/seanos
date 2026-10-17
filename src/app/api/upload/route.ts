import { getDb } from "@/lib/db";
import { HttpError, json, route } from "@/lib/api";
import { saveFile } from "@/lib/integrations/storage";
import { createTask } from "@/lib/engine";
import { env } from "@/lib/env";
import { newId, nowIso } from "@/lib/util";

const MAX = 6 * 1024 * 1024;

/** Wardrobe photo upload. The Stylist catalogues it when Claude is connected. */
export const POST = route(async (req: Request) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No file");
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new HttpError(400, "Use a JPEG, PNG or WebP photo");
  if (file.size > MAX) throw new HttpError(400, "Photo is too large (max 6 MB)");
  const url = await saveFile(Buffer.from(await file.arrayBuffer()), file.type);
  const item = await getDb().insert("wardrobe", {
    id: newId("wd"), image: url, name: String(form.get("name") ?? "") || "New piece", category: String(form.get("category") ?? "other"), colours: [], brand: "", material: "",
    formality: 2, seasons: [], notes: "", favourite: false, worn_count: 0, last_worn: null, tagged_by: "user", created_at: nowIso(),
  });
  let task = null;
  if (env.anthropicApiKey) task = await createTask({ title: "Catalogue wardrobe item", kind: "wardrobe_tag", params: { item_id: item.id }, contextRef: { type: "wardrobe", id: item.id, title: item.name } });
  return json({ item, task });
});
