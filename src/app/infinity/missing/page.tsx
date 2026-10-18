import Link from "next/link";
import { getDb } from "@/lib/db";
import { relTime } from "@/lib/time";
import { ActionButton, Delegate } from "@/components/client";
import { Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Missing() {
  const db = getDb();
  const runs = await db.list("tasks", { where: { kind: "missing" }, orderBy: { column: "created_at", ascending: false }, limit: 12 });
  const insights = await db.list("insights");
  return (
    <div>
      <PageHeader back="/infinity" title="What am I missing?" eyebrow="Blind spots" actions={<Delegate label="Run now" kind="missing" className="btn-primary" icon="search" />} />
      {runs.length ? (
        <div className="mx-5 mt-3 space-y-6 lg:mx-0">
          {runs.map((r) => {
            const list = insights.filter((i) => i.run_id === r.id).sort((a, b) => b.impact - a.impact);
            return (
              <div key={r.id}>
                <div className="mb-2 flex items-center justify-between text-[12.5px] text-muted"><span>{relTime(r.created_at)} · {r.status === "completed" ? r.summary : r.status}</span><Link href={`/tasks/${r.id}`} className="text-accent">Details</Link></div>
                <div className="space-y-2">
                  {list.map((f) => (
                    <div key={f.id} className={`card p-4 ${f.status === "dismissed" ? "opacity-50" : ""}`}>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">{f.next_best_move ? "Next best move" : f.kind.replace(/_/g, " ")} · impact {f.impact}/5</div>
                      <div className="mt-1 text-[15.5px] font-semibold">{f.title}</div>
                      <p className="mt-1 text-[13.5px] text-ink/80">{f.insight}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">{f.evidence.map((e) => e.href ? <Link key={e.id} href={e.href} className="rounded-full bg-raised px-2.5 py-1 text-[11.5px] text-muted">{e.label}</Link> : <span key={e.id} className="rounded-full bg-raised px-2.5 py-1 text-[11.5px] text-muted">{e.label}</span>)}</div>
                      {f.status === "new" && f.recommendation && <div className="mt-3 flex gap-2"><ActionButton url={`/api/insights/${f.id}`} body={{ action: "act" }} className="chip bg-ink text-bg">{f.recommendation.label}</ActionButton><ActionButton url={`/api/insights/${f.id}`} body={{ action: "dismiss" }} className="chip">Dismiss</ActionButton></div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : <div className="mt-4"><Empty icon="search" title="Not run yet" body="It reads your goals, strategy, work, network, research and decisions, and reports only what the evidence supports." /></div>}
    </div>
  );
}
