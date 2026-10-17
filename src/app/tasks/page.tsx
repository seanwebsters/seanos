import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { relTime } from "@/lib/time";
import { describeSchedule } from "@/lib/engine/schedule";
import { AgentBadge, Empty, List, PageHeader, Pill, Row, Tabs, agentName } from "@/components/ui";
import { AskButton, LiveRefresh } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function Tasks({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await ensureBootstrapped();
  const { tab = "progress" } = await searchParams;
  const db = getDb();
  const tasks = await db.list("tasks", { orderBy: { column: "created_at", ascending: false } });
  const automations = await db.list("automations");
  const groups = {
    inbox: tasks.filter((t) => t.status === "queued" && t.attempts === 0 && !t.automation_id),
    progress: tasks.filter((t) => ["running", "queued", "blocked", "paused"].includes(t.status)),
    approval: tasks.filter((t) => t.status === "awaiting_approval"),
    completed: tasks.filter((t) => ["completed", "failed", "cancelled"].includes(t.status)),
  };
  const list = tab === "recurring" ? [] : groups[tab as keyof typeof groups] ?? groups.progress;
  return (
    <div>
      <LiveRefresh active={groups.progress.some((t) => t.status === "running" || t.status === "queued")} />
      <PageHeader title="Tasks" eyebrow="Your workforce" subtitle="Delegate anything. Every task has a plan, an owner, a log and a cost." actions={<AskButton label="New task" className="btn-primary" />} />
      <div className="mt-3">
        <Tabs base="/tasks" active={tab} tabs={[
          { key: "inbox", label: "Inbox", count: groups.inbox.length }, { key: "progress", label: "In progress", count: groups.progress.length },
          { key: "approval", label: "Awaiting approval", count: groups.approval.length }, { key: "completed", label: "Completed" }, { key: "recurring", label: "Recurring", count: automations.filter((a) => a.enabled).length },
        ]} />
      </div>
      {tab === "recurring" ? (
        <List className="mt-3">
          {automations.map((a) => <Row key={a.id} href="/automations" title={a.name} sub={`${describeSchedule(a)} · ${a.description}`} right={<Pill status={a.enabled ? "completed" : "cancelled"} label={a.enabled ? "On" : "Off"} />} />)}
        </List>
      ) : list.length ? (
        <List className="mt-3">
          {list.map((t) => (
            <Row key={t.id} href={`/tasks/${t.id}`} left={<AgentBadge agent={t.agent} />} title={t.title}
              sub={t.status === "blocked" ? t.error : `${agentName(t.agent)} · ${relTime(t.updated_at)}${t.cost_cents ? ` · $${(t.cost_cents / 100).toFixed(2)}` : ""}${t.status === "running" ? ` · ${Math.round(t.progress * 100)}%` : ""}`}
              right={<Pill status={t.status} />} />
          ))}
        </List>
      ) : (
        <div className="mt-4"><Empty icon="tasks" title="Nothing here" body="Try: “Research this business idea and tell me if it's viable.”"><AskButton label="Delegate something" /></Empty></div>
      )}
    </div>
  );
}
