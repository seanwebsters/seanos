import "server-only";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { BlockedError, RetryableError } from "@/lib/ai/errors";
import { newId, nowIso } from "@/lib/util";
import { saveFile } from "./storage";

export const imagesConfigured = () => Boolean(env.falKey);

/** Generates an image with fal.ai (Nano Banana by default) and stores it. */
export async function generateImage(prompt: string, taskId: string | null, agent = "creative"): Promise<string> {
  if (!env.falKey) throw new BlockedError("FAL_KEY", "Image generation needs a fal.ai key. Add FAL_KEY to the server environment to create mockups and visuals.");
  const res = await fetch(`https://fal.run/${env.falImageModel}`, {
    method: "POST",
    headers: { Authorization: `Key ${env.falKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, num_images: 1, aspect_ratio: "4:5", output_format: "jpeg" }),
    signal: AbortSignal.timeout(120000),
  });
  if (res.status === 401 || res.status === 403) throw new BlockedError("FAL_KEY", `fal.ai rejected the key (${res.status}).`);
  if (!res.ok) throw new RetryableError(`Image generation failed (${res.status}).`);
  const j = (await res.json()) as { images?: { url: string; content_type?: string }[] };
  const url = j.images?.[0]?.url;
  if (!url) throw new RetryableError("Image generation returned no image.");
  const img = await fetch(url, { signal: AbortSignal.timeout(60000) });
  const buf = Buffer.from(await img.arrayBuffer());
  const saved = await saveFile(buf, j.images?.[0]?.content_type ?? "image/jpeg");
  await getDb().insert("usage", { id: newId("use"), task_id: taskId, agent, provider: "fal", model: env.falImageModel, operation: "image", input_tokens: 0, output_tokens: 0, web_searches: 0, images: 1, cost_cents: 4, created_at: nowIso() });
  return saved;
}
