import Link from "next/link";
import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { agentStates } from "@/lib/services/agents";
import { relTime } from "@/lib/time";
import { budgetStatus } from "@/lib/ai/llm";
import { AgentBadge, Empty, PageHeader, Section, Stat, agentName } from "@/components/ui";
import { LiveRefresh, MoreGrid } from "@/components/client";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const LABEL = { working: "Working", waiting: "Needs you", blocked: "Blocked", idle: "Idle", off: "Off" } as const;
const DOT = { working: "bg-sky animate-pulse2", waiting: "bg-accent", blocked: "bg-rose", idle: "bg-faint/50", off: "bg-line" } as const;

export default async function Agents() {
  await ensureBootstrapped();
  const db = getDb();
  const agents = await agentStates();
  const logs = await db.list("task_logs", { orderBy: { column: "at", ascending: false }, limit: 40 });
  const tasks = await db.list("tasks");
  const budget = await budgetStatus();
  const working = agents.filter((a) => a.state === "working").length;
  return (
    <div>
      <LiveRefresh active={working > 0} />
      <PageHeader title="Your team" eyebrow="Agents" subtitle={working ? `${working} agent${working > 1 ? "s" : ""} working right now` : "Every status here comes from real work."} />
      <div className="mx-5 mt-3 grid grid-cols-3 gap-2.5 lg:mx-0">
        <Stat label="Running" value={tasks.filter((t) => t.status === "running" || t.status === "queued").length} />
        <Stat label="Done" value={tasks.filter((t) => t.status === "completed").length} />
        <Stat label="Today" value={`$${(budget.day / 100).toFixed(2)}`} sub={`of $${(budget.dayCap / 100).toFixed(0)} cap`} />
      </div>
      <Section title="The organisation">
        <div className="mx-5 grid gap-2.5 sm:grid-cols-2 lg:mx-0 lg:grid-cols-3">
          {agents.map((a) => (
            <Link key={a.key} href={`/agents/${a.key}`} className="card flex gap-3 p-4 active:scale-[0.99]">
              <AgentBadge agent={a.key} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-[15px] font-semibold">{a.name}</div>
                  <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-muted"><span className={`h-2 w-2 rounded-full ${DOT[a.state]}`} />{LABEL[a.state]}</span>
                </div>
                <div className="mt-0.5 line-clamp-2 text-[12.5px] text-muted">
                  {a.current ? a.current.title : a.blocked ? a.blocked.error : a.waiting ? `${a.waiting} item${a.waiting > 1 ? "s" : ""} for your review` : a.last ? `Last: ${a.last.title}` : a.role}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Section>
      <Section title="Activity" href="/tasks">
        {logs.length ? (
          <div className="mx-5 space-y-0 lg:mx-0">
            {logs.map((l, i) => (
              <Link key={l.id} href={`/tasks/${l.task_id}`} className="relative flex gap-3 pb-5">
                {i < logs.length - 1 && <span className="absolute left-[13px] top-8 h-[calc(100%-24px)] w-px bg-line" />}
                <AgentBadge agent={l.agent ?? "chief_of_staff"} size={27} />
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="text-[13.5px] leading-snug"><span className="font-medium">{l.agent ? agentName(l.agent) : "System"}</span> <span className={l.level === "error" ? "text-rose" : l.level === "warn" ? "text-accent" : "text-muted"}>{l.message}</span></div>
                  <div className="mt-0.5 text-[11.5px] text-faint">{tasks.find((t) => t.id === l.task_id)?.title} · {relTime(l.at)}</div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty icon="agents" title="No activity yet" body="When you delegate a task or Autopilot runs, each step appears here as it happens." />
        )}
      </Section>
      <Section title="Everything else" className="lg:hidden"><MoreGrid /></Section>
      <div className="mx-5 mt-6 flex items-center gap-2 text-[12px] text-faint lg:mx-0"><Icon name="lock" size={14} /> Agents never send, publish, buy or book. They draft; you approve.</div>
    </div>
  );
}
