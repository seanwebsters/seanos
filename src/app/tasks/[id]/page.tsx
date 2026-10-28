import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { fmtDate, relTime } from "@/lib/time";
import { AgentBadge, Markdown, PageHeader, Pill, Section, Sources, agentName } from "@/components/ui";
import { ActionButton, AskButton, LiveRefresh } from "@/components/client";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const HREF: Record<string, (id: string) => string> = {
  edition: () => "/edition", briefing: () => "/", draft: (id) => `/studio/${id}`, person: (id) => `/people/${id}`, partnership: (id) => `/calmlings/${id}`, idea: (id) => `/ideas/${id}`,
  report: (id) => `/reports/${id}`, trend: (id) => `/trends/${id}`, speaking: (id) => `/speaking/${id}`, opportunity: (id) => `/opportunities/${id}`, outfit: () => "/wardrobe",
  wardrobe: () => "/wardrobe", experience: (id) => `/lifestyle/experience/${id}`, ambition: (id) => `/infinity/strategy/${id}`, decision: (id) => `/infinity/council/${id}`, scenario: (id) => `/infinity/future/${id}`, node: (id) => `/infinity/node/${id}`, venture: (id) => `/founder/v/${id}`,
};

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const t = await db.get("tasks", id);
  if (!t) notFound();
  const steps = await db.list("task_steps", { where: { task_id: id }, orderBy: { column: "idx", ascending: true } });
  const logs = await db.list("task_logs", { where: { task_id: id }, orderBy: { column: "at", ascending: true } });
  const usage = await db.list("usage", { where: { task_id: id } });
  const live = t.status === "running" || t.status === "queued";
  const ctx = { type: "task", id: t.id, title: t.title };
  return (
    <div>
      <LiveRefresh active={live} every={3000} />
      <PageHeader back="/tasks" title={t.title} eyebrow={agentName(t.agent)} actions={<Pill status={t.status} />} />
      <div className="mx-5 lg:mx-0">
        {t.instruction !== t.title && <p className="font-serif text-[17px] leading-relaxed text-ink/80">“{t.instruction}”</p>}
        {t.context_ref && <div className="mt-2 text-[13px] text-muted">About: {t.context_ref.title}</div>}
        {live && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(6, t.progress * 100)}%` }} /></div>
        )}
        {t.status === "blocked" && (
          <div className="mt-4 rounded-2xl bg-rose/10 p-4 text-[14px] text-rose">
            <div className="font-semibold">Blocked{t.blocked_on ? `: ${t.blocked_on}` : ""}</div>
            <div className="mt-1">{t.error}</div>
            <Link href="/settings" className="mt-2 inline-block font-medium underline">Fix in Settings</Link>
          </div>
        )}
        {t.status === "failed" && <div className="mt-4 rounded-2xl bg-rose/10 p-4 text-[14px] text-rose">{t.error}</div>}
        {t.status === "queued" && t.attempts > 0 && <div className="mt-4 rounded-2xl bg-raised p-4 text-[13.5px] text-muted">Retrying {relTime(t.scheduled_for)} (attempt {t.attempts + 1} of {t.max_attempts}). {t.error}</div>}
        {t.status === "queued" && t.attempts === 0 && new Date(t.scheduled_for) > new Date() && <div className="mt-4 rounded-2xl bg-raised p-4 text-[13.5px] text-muted">Scheduled for {fmtDate(t.scheduled_for, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.</div>}
        <div className="mt-4 flex flex-wrap gap-2">
          {live && <ActionButton url={`/api/tasks/${id}`} body={{ action: "pause" }} className="chip"><Icon name="pause" size={14} /> Pause</ActionButton>}
          {["paused", "blocked"].includes(t.status) && <ActionButton url={`/api/tasks/${id}`} body={{ action: "resume" }} className="chip"><Icon name="play" size={14} /> Resume</ActionButton>}
          {t.status === "failed" && <ActionButton url={`/api/tasks/${id}`} body={{ action: "retry" }} className="chip"><Icon name="refresh" size={14} /> Retry</ActionButton>}
          {!["completed", "cancelled", "failed"].includes(t.status) && <ActionButton url={`/api/tasks/${id}`} body={{ action: "cancel" }} confirm="Cancel this task?" className="chip"><Icon name="close" size={14} /> Cancel</ActionButton>}
          <ActionButton url={`/api/tasks/${id}`} body={{ action: "repeat" }} className="chip" toastText="Running again"><Icon name="refresh" size={14} /> Repeat</ActionButton>
          <ActionButton url={`/api/tasks/${id}`} body={{ action: "repeat", when: new Date(Date.now() + 86400000).toISOString() }} className="chip" toastText="Rescheduled for tomorrow"><Icon name="clock" size={14} /> Tomorrow</ActionButton>
          <AskButton context={ctx} label="Expand this" className="chip" suggestions={["Expand this into a full project", "Go deeper on the most promising part", "Turn the result into a deck"]} />
        </div>
      </div>
      {t.summary && (
        <Section title="Result">
          <div className="mx-5 rounded-card bg-surface p-5 ring-1 ring-line lg:mx-0"><Markdown text={t.summary} className="prose-sean text-[16px]" /></div>
        </Section>
      )}
      {t.deliverables.length > 0 && (
        <Section title="Deliverables">
          <div className="mx-5 flex flex-wrap gap-2 lg:mx-0">
            {t.deliverables.map((d) => <Link key={`${d.type}${d.id}`} href={(HREF[d.type] ?? (() => "/"))(d.id)} className="chip"><Icon name="arrow" size={13} /> {d.title}</Link>)}
          </div>
        </Section>
      )}
      <Section title="Plan & steps">
        {steps.length ? (
          <ol className="mx-5 space-y-2 lg:mx-0">
            {steps.map((s) => (
              <li key={s.id} className="card flex items-start gap-3 p-3.5">
                <AgentBadge agent={s.agent} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-medium">{s.title}</div>
                  <div className="text-[12px] text-muted">{agentName(s.agent)}{s.cost_cents ? ` · $${(s.cost_cents / 100).toFixed(3)}` : ""}{s.error ? ` · ${s.error}` : ""}</div>
                </div>
                <Pill status={s.status === "done" ? "completed" : s.status} />
              </li>
            ))}
          </ol>
        ) : <div className="mx-5 text-[14px] text-muted lg:mx-0">{live ? "Planning…" : "No steps ran."}</div>}
      </Section>
      <Sources sources={t.citations} title="Citations" />
      <Section title="Log">
        <div className="mx-5 space-y-1.5 font-mono text-[12px] lg:mx-0">
          {logs.map((l) => <div key={l.id} className={l.level === "error" ? "text-rose" : l.level === "warn" ? "text-accent" : "text-muted"}><span className="text-faint">{new Date(l.at).toLocaleTimeString("en-GB")}</span> {l.agent ? `${agentName(l.agent)}: ` : ""}{l.message}</div>)}
        </div>
      </Section>
      <div className="mx-5 mt-6 text-[12px] text-faint lg:mx-0">
        Cost ${(t.cost_cents / 100).toFixed(3)} · {usage.length} model calls · {usage.reduce((s, u) => s + u.web_searches, 0)} searches · attempt {t.attempts}/{t.max_attempts} · created {relTime(t.created_at)}
      </div>
    </div>
  );
}
