import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/bootstrap";
import { budgetStatus } from "@/lib/ai/llm";
import { relTime } from "@/lib/time";
import { ActionButton } from "@/components/client";
import { PageHeader, Section, Stat } from "@/components/ui";
import { AutonomyPicker, EmergencyStop } from "../client";

export const dynamic = "force-dynamic";

export default async function Trust() {
  const db = getDb();
  const s = await getSettings();
  const b = await budgetStatus();
  const log = await db.list("audit_log", { orderBy: { column: "at", ascending: false }, limit: 60 });
  const pending = await db.count("approvals", { status: "pending" });
  const running = await db.count("tasks", { status: ["queued", "running"] });
  return (
    <div>
      <PageHeader back="/infinity" title="Trust & autonomy" eyebrow="You stay in control" />
      <div className="mx-5 mt-2 flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface p-5 ring-1 ring-line lg:mx-0">
        <div><div className="text-[16px] font-semibold">{s.halted ? "Agents are stopped" : "Agents are running"}</div><div className="text-[13px] text-muted">{running} queued or running · {pending} waiting for approval</div></div>
        <EmergencyStop halted={s.halted} />
      </div>
      <div className="mx-5 mt-3 grid grid-cols-2 gap-2.5 lg:mx-0"><Stat label="Spent today" value={`$${(b.day / 100).toFixed(2)}`} sub={`cap $${(b.dayCap / 100).toFixed(0)}`} /><Stat label="This month" value={`$${(b.month / 100).toFixed(2)}`} sub={`cap $${(b.monthCap / 100).toFixed(0)}`} /></div>
      <Section title="Autonomy level"><div className="mx-5 lg:mx-0"><AutonomyPicker level={s.autonomy_level} /></div></Section>
      <Section title="Always true, at every level">
        <ul className="mx-5 space-y-1.5 text-[14px] text-ink/85 lg:mx-0">
          <li>— Nothing is sent, posted, booked, bought or submitted without your approval.</li>
          <li>— No unrestricted spending: daily and monthly caps stop work instead of overspending.</li>
          <li>— Agents never speak as you to other people.</li>
          <li>— Calm (work) knowledge is only visible to work agents.</li>
          <li>— Findings must cite evidence; unsupported claims are dropped.</li>
        </ul>
      </Section>
      <Section title="Your data">
        <div className="mx-5 flex flex-wrap gap-2 lg:mx-0">
          <a href="/api/graph/export" className="btn-ghost">Export world model</a>
          <a href="/api/memory/export" className="btn-ghost">Export memory</a>
          <ActionButton url="/api/graph/export" method="DELETE" confirm="Erase the whole knowledge graph? It can be rebuilt from your records, but corrections you made will be lost." className="btn-line text-rose" toastText="World model erased">Erase world model</ActionButton>
        </div>
      </Section>
      <Section title="Audit trail">
        {log.length ? (
          <div className="mx-5 space-y-1 font-mono text-[12px] lg:mx-0">
            {log.map((l) => <div key={l.id} className="flex gap-3 border-b border-line py-1.5"><span className="w-16 shrink-0 text-faint">{relTime(l.at)}</span><span className="w-20 shrink-0 truncate text-muted">{l.actor}</span><span className="min-w-0 flex-1"><span className="text-ink">{l.action}</span> <span className="text-muted">{l.target} {l.detail}</span></span></div>)}
          </div>
        ) : <div className="mx-5 text-[13.5px] text-muted lg:mx-0">No consequential changes yet.</div>}
      </Section>
    </div>
  );
}
