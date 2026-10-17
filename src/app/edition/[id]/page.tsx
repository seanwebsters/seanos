import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { EditionView } from "../view";

export const dynamic = "force-dynamic";

export default async function PastEdition({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const ed = await db.get("editions", id);
  if (!ed) notFound();
  const stories = await db.list("stories", { where: { edition_id: id }, orderBy: { column: "position", ascending: true } });
  return <EditionView edition={ed} stories={stories} generating={false} />;
}
