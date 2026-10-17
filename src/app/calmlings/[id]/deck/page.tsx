import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { Deck } from "@/components/Deck";

export const dynamic = "force-dynamic";

export default async function PartnershipDeck({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await getDb().get("partnerships", id);
  if (!p || !p.slides.length) notFound();
  return <Deck title={`Calmlings × ${p.brand}`} slides={p.slides} back={`/calmlings/${id}`} images={p.images} />;
}
