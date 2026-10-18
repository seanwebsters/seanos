import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { Deck } from "@/components/Deck";

export const dynamic = "force-dynamic";

export default async function VentureDeck({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const v = await db.get("ventures", id);
  const deck = (await db.list("venture_docs", { where: { venture_id: id, kind: "deck" } }))[0];
  if (!v || !deck) notFound();
  return <Deck title={v.name} slides={deck.slides} back={`/founder/v/${id}?tab=funding`} />;
}
