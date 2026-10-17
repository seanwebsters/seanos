import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { EditionView } from "./view";

export const dynamic = "force-dynamic";

export default async function EditionPage() {
  await ensureBootstrapped();
  const db = getDb();
  const [latest] = await db.list("editions", { orderBy: { column: "date", ascending: false }, limit: 1 });
  const ready = latest?.status === "ready" ? latest : (await db.list("editions", { where: { status: "ready" }, orderBy: { column: "date", ascending: false }, limit: 1 }))[0] ?? null;
  const stories = ready ? await db.list("stories", { where: { edition_id: ready.id }, orderBy: { column: "position", ascending: true } }) : [];
  const generating = (await db.list("tasks", { where: { kind: ["edition", "morning"], status: ["queued", "running"] } })).length > 0;
  return <EditionView edition={ready ?? latest ?? null} stories={stories} generating={generating} />;
}
