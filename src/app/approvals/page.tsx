import Link from "next/link";
import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { relTime } from "@/lib/time";
import { AgentBadge, Empty, PageHeader, agentName } from "@/components/ui";
import { ActionButton, CopyButton } from "@/components/client";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function Approvals() {
  await ensureBootstrapped();
  const db = getDb();
  const pending = await db.list("approvals", { where: { status: "pending" }, orderBy: { column: "created_at", ascending: false } });
  const items = await Promise.all(pending.map(async (a) => ({ a, draft: a.type === "draft" ? await db.get("drafts", a.ref_id) : null, out: a.type === "outreach" ? await db.get("outreach", a.ref_id) : null })));
  const approvedOutreach = await db.list("outreach", { where: { status: "approved" }, orderBy: { column: "updated_at", ascending: false } });
  return (
    <div>
      <PageHeader title="Approvals" eyebrow="Waiting for you" subtitle="Approving never sends or posts anything. You stay in control of every external action." />
      {items.length ? (
        <div className="mx-5 mt-3 space-y-3 lg:mx-0">
          {items.map(({ a, draft, out }) => {
            const body = draft?.body ?? out?.body ?? "";
            const href = draft ? `/studio/${draft.id}` : out ? (out.target_type === "partnership" ? `/calmlings/${out.target_id}` : out.target_type === "speaking" ? `/speaking/${out.target_id}` : `/people/${out.target_id}`) : "#";
            return (
              <div key={a.id} id={a.id} className="card overflow-hidden">
                <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                  <AgentBadge agent={a.agent} size={28} />
                  <div className="min-w-0 flex-1"><div className="truncate text-[14.5px] font-semibold">{a.title}</div><div className="text-[12px] text-muted">{agentName(a.agent)} · {relTime(a.created_at)}</div></div>
                  <Link href={href} className="text-[13px] text-accent">Open</Link>
                </div>
                <div className="p-4">
                  {out && <div className="mb-2 text-[13px] text-muted">{out.to ? `To: ${out.to} · ` : ""}Subject: <span className="text-ink">{out.subject}</span></div>}
                  <p className="line-clamp-[10] whitespace-pre-line font-serif text-[15.5px] leading-relaxed">{body}</p>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
                  <ActionButton url={`/api/approvals/${a.id}`} body={{ decision: "approved" }} className="btn-accent py-2" toastText="Approved"><Icon name="check" size={15} /> Approve</ActionButton>
                  <Link href={href} className="btn-ghost py-2"><Icon name="edit" size={15} /> Edit</Link>
                  <CopyButton text={out ? `Subject: ${out.subject}\n\n${body}` : body} className="btn-ghost py-2" />
                  <ActionButton url={`/api/approvals/${a.id}`} body={{ decision: "rejected" }} className="btn-line py-2 text-rose" toastText="Rejected">Reject</ActionButton>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4"><Empty icon="inbox" title="All clear" body="Drafts and outreach your team prepares land here for your sign-off." /></div>
      )}
      {approvedOutreach.length > 0 && (
        <div className="mx-5 mt-10 lg:mx-0">
          <div className="display mb-3 text-[24px]">Approved, ready to send</div>
          <div className="space-y-2">
            {approvedOutreach.map((o) => (
              <div key={o.id} className="card flex flex-wrap items-center gap-2 p-3.5">
                <div className="min-w-0 flex-1"><div className="truncate text-[14px] font-medium">{o.target_name}</div><div className="truncate text-[12px] text-muted">{o.subject}</div></div>
                <CopyButton text={`Subject: ${o.subject}\n\n${o.body}`} />
                {o.to && <a className="chip" href={`mailto:${o.to}?subject=${encodeURIComponent(o.subject)}&body=${encodeURIComponent(o.body)}`}><Icon name="send" size={14} /> Open in Mail</a>}
                <ActionButton url={`/api/entity/outreach/${o.id}`} method="PATCH" body={{ status: "sent", sent_at: new Date().toISOString(), follow_up_at: new Date(Date.now() + 7 * 86400000).toISOString() }} className="chip" toastText="Marked sent. Follow-up in 7 days.">I sent it</ActionButton>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
