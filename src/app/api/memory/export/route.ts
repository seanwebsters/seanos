import { getDb } from "@/lib/db";
import { route } from "@/lib/api";
import { getProfile } from "@/lib/bootstrap";

export const GET = route(async () => {
  const db = getDb();
  const data = { exported_at: new Date().toISOString(), profile: await getProfile(), memories: await db.list("memories"), people: await db.list("people"), interactions: await db.list("interactions"), ideas: await db.list("ideas") };
  return new Response(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="sean-os-memory-${data.exported_at.slice(0, 10)}.json"` } });
});
