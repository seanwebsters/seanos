import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { DraftEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const d = await db.get("drafts", id);
  if (!d) notFound();
  const approval = (await db.list("approvals", { where: { ref_id: id, status: "pending" } }))[0] ?? null;
  return (
    <div>
      <PageHeader back="/studio" title={d.title} eyebrow={`${d.platform} · v${d.version}`} />
      <DraftEditor draft={d} approvalId={approval?.id ?? null} />
    </div>
  );
}
