import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import type { StrategyItem } from "@/lib/db/types";
import { COUNTERS, metricValue, progressOf } from "@/lib/strategy/core";
import { fmtDate, relTime } from "@/lib/time";
import { ActionButton, LiveRefresh } from "@/components/client";
import { AgentBadge, PageHeader, Pill, Section, agentName } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { MetricsEditor } from "../../client";

export const dynamic = "force-dynamic";

const LEVEL_LABEL: Record<string, string> = { strategy: "Strategy", objective: "Objective", initiative: "Initiative", project: "Project", action: "Action" };

export default async function AmbitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const a = await db.get("ambitions", id);
  if (!a) notFound();
  const items = (await db.list("strategy_items", { where: { ambition_id: id }, orderBy: { column: "position", ascending: true } })).filter((i) => i.status !== "dropped");
  const memo = new Map<string, number>();
  const prog = new Map<string, number>();
  for (const it of items) prog.set(it.id, await progressOf(it, items, memo));
  const metricVals = new Map<string, number[]>();
  for (const it of items) if (it.metrics.length) metricVals.set(it.id, await Promise.all(it.metrics.map(metricValue)));
  const tasks = new Map((await db.list("tasks")).map((t) => [t.id, t]));
  const reviews = await db.list("strategy_reviews", { where: { ambition_id: id }, orderBy: { column: "created_at", ascending: false }, limit: 4 });
  const planTask = a.task_id ? tasks.get(a.task_id) : null;
  const planning = planTask && ["queued", "running"].includes(planTask.status);
  const proposed = items.some((i) => i.status === "proposed");
  const counters = Object.fromEntries(Object.entries(COUNTERS).map(([k, v]) => [k, v.label]));
  const kids = (pid: string | null) => items.filter((i) => i.parent_id === pid);
  const roots = kids(null);
  const overall = roots.length ? roots.reduce((s, r) => s + (prog.get(r.id) ?? 0), 0) / roots.length : 0;

  const Item = ({ it, depth }: { it: StrategyItem; depth: number }) => {
    const p = prog.get(it.id) ?? 0;
    const children = kids(it.id);
    const linked = it.task_ids.map((t) => tasks.get(t)).filter(Boolean);
    if (it.level === "action") {
      return (
        <div className="flex items-start gap-3 rounded-2xl bg-raised px-3.5 py-3">
          <AgentBadge agent={it.owner_agent} size={24} />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium">{it.title}</div>
            <div className="mt-0.5 line-clamp-2 text-[12px] text-muted">{agentName(it.owner_agent)} · {it.instruction}</div>
            {linked.map((t) => <Link key={t!.id} href={`/tasks/${t!.id}`} className="mt-1 flex items-center gap-1.5 text-[12px] text-accent"><Pill status={t!.status} /> {relTime(t!.updated_at)}</Link>)}
          </div>
          {it.status !== "proposed" && !linked.length && <ActionButton url={`/api/infinity/strategy/${it.id}`} body={{ action: "start" }} className="chip shrink-0" toastText="Started"><Icon name="play" size={13} /> Start</ActionButton>}
          {it.status === "proposed" && <span className="shrink-0 text-[11px] text-faint">proposed</span>}
        </div>
      );
    }
    return (
      <div className={depth === 0 ? "card p-5" : "border-l-2 border-line pl-4"}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-accent">{LEVEL_LABEL[it.level]}{it.due ? ` · by ${fmtDate(it.due, { month: "short", year: "numeric" })}` : ""}</div>
            <div className={`${depth === 0 ? "display text-[24px] leading-tight" : "text-[15.5px] font-semibold"} mt-0.5`}>{it.title}</div>
            {it.description && <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{it.description}</p>}
            {it.rationale && depth === 0 && <p className="mt-1 text-[13px] italic text-muted">Why: {it.rationale}</p>}
          </div>
          <div className="shrink-0 text-right"><div className="text-[13px] tabular-nums text-muted">{Math.round(p * 100)}%</div><div className="mt-1"><Pill status={it.status === "proposed" ? "pending" : it.status === "done" ? "completed" : it.status === "paused" ? "paused" : "running"} label={it.status} /></div></div>
        </div>
        {it.metrics.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {it.metrics.map((m, i) => {
              const v = metricVals.get(it.id)?.[i] ?? m.current;
              return (
                <div key={i} className="flex items-center gap-3 text-[12.5px]">
                  <span className="w-40 truncate text-muted">{m.name}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-sage" style={{ width: `${Math.min(100, (v / Math.max(1e-9, m.target)) * 100)}%` }} /></div>
                  <span className="w-20 text-right tabular-nums">{v} / {m.target}{m.unit}</span>
                </div>
              );
            })}
          </div>
        )}
        {it.level === "objective" && <details className="mt-2 text-[12.5px]"><summary className="cursor-pointer text-muted">Edit metrics</summary><div className="mt-2"><MetricsEditor id={it.id} metrics={it.metrics} counters={counters} /></div></details>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {it.status === "proposed" && <ActionButton url={`/api/infinity/strategy/${it.id}`} body={{ action: "approve" }} className="chip bg-ink px-2.5 py-1 text-[11.5px] text-bg" toastText="Approved">Approve</ActionButton>}
          {["approved", "active"].includes(it.status) && <ActionButton url={`/api/infinity/strategy/${it.id}`} body={{ action: "prepare" }} className="chip px-2.5 py-1 text-[11.5px]" toastText="Team preparing the work"><Icon name="bolt" size={12} /> Prepare work</ActionButton>}
          {["approved", "active"].includes(it.status) && <ActionButton url={`/api/infinity/strategy/${it.id}`} body={{ action: "done" }} className="chip px-2.5 py-1 text-[11.5px]">Done</ActionButton>}
          {it.status !== "paused" && it.status !== "proposed" && <ActionButton url={`/api/infinity/strategy/${it.id}`} body={{ action: "pause" }} className="chip px-2.5 py-1 text-[11.5px]">Pause</ActionButton>}
          {it.status === "paused" && <ActionButton url={`/api/infinity/strategy/${it.id}`} body={{ action: "resume" }} className="chip px-2.5 py-1 text-[11.5px]">Resume</ActionButton>}
          <ActionButton url={`/api/infinity/strategy/${it.id}`} body={{ action: "drop" }} confirm="Drop this from the strategy?" className="chip px-2.5 py-1 text-[11.5px] text-rose">Drop</ActionButton>
        </div>
        {linked.length > 0 && <div className="mt-2 space-y-1">{linked.map((t) => <Link key={t!.id} href={`/tasks/${t!.id}`} className="flex items-center gap-2 text-[12px] text-accent"><Pill status={t!.status} /> {t!.title}</Link>)}</div>}
        {children.length > 0 && <div className="mt-4 space-y-3">{children.map((c) => <Item key={c.id} it={c} depth={depth + 1} />)}</div>}
      </div>
    );
  };

  return (
    <div>
      <LiveRefresh active={Boolean(planning)} />
      <PageHeader back="/infinity/strategy" title={a.statement} eyebrow={`Ambition · ${a.horizon} · ${a.status}`} />
      <div className="mx-5 lg:mx-0">
        {planning && <div className="flex items-center gap-2 rounded-2xl bg-sky/10 p-4 text-[14px] text-sky"><span className="h-2 w-2 animate-pulse2 rounded-full bg-sky" /> The strategist is researching and building your plan. <Link href={`/tasks/${planTask!.id}`} className="ml-auto underline">Watch</Link></div>}
        {planTask?.status === "blocked" && <div className="rounded-2xl bg-rose/10 p-4 text-[14px] text-rose">Planning is blocked: {planTask.error} <Link href="/settings" className="underline">Fix</Link></div>}
        {a.success.length > 0 && (
          <div className="mt-2 rounded-card bg-ink p-5 text-bg">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-60">Success looks like</div>
            <ul className="mt-2 space-y-1.5 font-serif text-[16.5px] leading-snug">{a.success.map((s) => <li key={s}>— {s}</li>)}</ul>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-bg/15"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, overall * 100)}%` }} /></div>
            <div className="mt-1 text-[12px] opacity-60">{Math.round(overall * 100)}% overall</div>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {proposed && <ActionButton url={`/api/infinity/strategy/${a.id}`} body={{ action: "approve_all" }} className="btn-primary" toastText="Strategy approved">Approve the strategy</ActionButton>}
          <ActionButton url={`/api/infinity/strategy/${a.id}`} body={{ action: "review" }} className="btn-ghost" toastText="Reviewing progress"><Icon name="refresh" size={16} /> Strategic review</ActionButton>
          <ActionButton url={`/api/infinity/strategy/${a.id}`} body={{ action: "replan" }} confirm="Rebuild the plan? Approved items stay; proposed ones are replaced." className="btn-ghost">Re-plan</ActionButton>
        </div>
      </div>
      {roots.length > 0 && <Section title="The plan"><div className="mx-5 space-y-3 lg:mx-0">{roots.map((r) => <Item key={r.id} it={r} depth={0} />)}</div></Section>}
      {(a.assumptions.length > 0 || a.risks.length > 0) && (
        <Section title="Assumptions & risks">
          <div className="mx-5 grid gap-3 lg:mx-0 lg:grid-cols-2">
            <div className="card p-4"><div className="eyebrow mb-2">Assumptions</div><ul className="space-y-1.5 text-[13.5px]">{a.assumptions.map((x) => <li key={x} className={x.startsWith("Sceptic:") ? "text-accent" : ""}>— {x}</li>)}</ul></div>
            <div className="card p-4"><div className="eyebrow mb-2">Risks, gaps & things to stop</div><ul className="space-y-1.5 text-[13.5px]">{a.risks.map((x) => <li key={x}>— {x}</li>)}</ul></div>
          </div>
        </Section>
      )}
      {reviews.length > 0 && (
        <Section title="Strategic reviews">
          <div className="mx-5 space-y-3 lg:mx-0">
            {reviews.map((r) => (
              <div key={r.id} className="card p-5">
                <div className="eyebrow">{fmtDate(r.date, { weekday: "short", day: "numeric", month: "short" })}</div>
                <p className="mt-2 font-serif text-[16px] leading-relaxed">{r.progress}</p>
                {r.highest_leverage && <div className="mt-3 rounded-2xl bg-accent/10 p-3"><div className="text-[11px] font-semibold uppercase tracking-wider text-accent">Highest-leverage action</div><div className="mt-0.5 text-[14.5px] font-semibold">{r.highest_leverage.title}</div><div className="text-[13px] text-muted">{r.highest_leverage.why}</div></div>}
                {[["Blocking us", r.blockers], ["New information", r.new_information], ["Stop doing", r.stop_doing], ["Adjustments", r.adjustments]].map(([k, list]) => (list as string[]).length ? <div key={k as string} className="mt-3"><div className="eyebrow mb-1">{k as string}</div><ul className="space-y-1 text-[13.5px]">{(list as string[]).map((x) => <li key={x}>— {x}</li>)}</ul></div> : null)}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
