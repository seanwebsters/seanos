import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { Deck } from "@/components/Deck";

export const dynamic = "force-dynamic";

export default async function ReportDeck({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getDb().get("reports", id);
  if (!r || !r.slides.length) notFound();
  return <Deck title={r.title} slides={r.slides} back={`/reports/${id}`} images={r.images} />;
}
