import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { LENSES } from "@/lib/council/workflows";
import { ActionButton, Delegate, LiveRefresh } from "@/components/client";
import { PageHeader, Section, hostOf } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { DecideForm } from "../../client";

export const dynamic = "force-dynamic";

const STANCE = { support: "bg-sage/15 text-sage", oppose: "bg-rose/15 text-rose", conditional: "bg-accent/15 text-accent" } as const;

export default async function DecisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const d = await db.get("decisions", id);
  if (!d) notFound();
  const task = d.task_id ? await db.get("tasks", d.task_id) : null;
  const scenario = d.scenario_id ? await db.get("scenarios", d.scenario_id) : null;
  const ctx = { type: "decision", id: d.id, title: d.question.slice(0, 80) };
  return (
    <div>
      <LiveRefresh active={d.status === "deliberating"} />
      <PageHeader back="/infinity/council" title={d.question} eyebrow="Intelligence Council" />
      <div className="mx-5 lg:mx-0">
        {d.status === "deliberating" && (
          <div className="rounded-2xl bg-sky/10 p-4 text-[14px] text-sky">
            <div className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse2 rounded-full bg-sky" /> The council is deliberating. Each lens works independently. {task && <Link href={`/tasks/${task.id}`} className="ml-auto underline">Watch</Link>}</div>
            {task?.status === "blocked" && <div className="mt-2 text-rose">{task.error}</div>}
          </div>
        )}
        {d.recommendation && (
          <div className="rounded-[28px] bg-ink p-6 text-bg">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-60">Recommendation · {Math.round(d.recommendation.confidence * 100)}% confidence</div>
            <div className="display mt-2 text-[30px] leading-tight">{d.recommendation.option}</div>
            <p className="mt-2 text-[14.5px] leading-relaxed opacity-80">{d.recommendation.rationale}</p>
            {d.would_change.length > 0 && <div className="mt-4"><div className="text-[11px] font-semibold uppercase tracking-wider opacity-60">What would change this</div><ul className="mt-1.5 space-y-1 text-[13.5px] opacity-85">{d.would_change.map((x) => <li key={x}>— {x}</li>)}</ul></div>}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {scenario ? <Link href={`/infinity/future/${scenario.id}`} className="btn-ghost"><Icon name="clock" size={16} /> Scenario model</Link> : <ActionButton url={`/api/infinity/decisions/${d.id}`} body={{ action: "model" }} className="btn-ghost" toastText="Modelling the futures"><Icon name="clock" size={16} /> Model the futures</ActionButton>}
          {d.status !== "deliberating" && <ActionButton url={`/api/infinity/decisions/${d.id}`} body={{ action: "rerun" }} className="btn-ghost" toastText="Council reconvened"><Icon name="refresh" size={16} /> Reconvene{scenario ? " with the model" : ""}</ActionButton>}
        </div>
      </div>
      {d.views.length > 0 && (
        <Section title="Independent views">
          <div className="mx-5 grid gap-2.5 sm:grid-cols-2 lg:mx-0">
            {LENSES.map((l) => {
              const v = d.views.find((x) => x.lens === l.key);
              if (!v) return null;
              return (
                <details key={l.key} className="card p-4">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-2"><span className="text-[14.5px] font-semibold">{l.name}</span><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STANCE[v.stance]}`}>{v.stance} · {v.score}/10</span></div>
                    <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink/85">{v.summary}</p>
                  </summary>
                  <div className="mt-3 space-y-2 text-[13px]">
                    {[["Points", v.points], ["Risks", v.risks], ["Assumes", v.assumptions], ["Needs answering", v.questions]].map(([k, list]) => (list as string[]).length ? <div key={k as string}><div className="eyebrow mb-1">{k as string}</div><ul className="space-y-1">{(list as string[]).map((x) => <li key={x}>— {x}</li>)}</ul></div> : null)}
                    {v.preferred_option && <div className="text-muted">Prefers: <span className="text-ink">{v.preferred_option}</span></div>}
                  </div>
                </details>
              );
            })}
          </div>
          <div className="mx-5 mt-3 flex items-center gap-1 lg:mx-0" aria-label="Scores by lens">
            {LENSES.map((l) => { const v = d.views.find((x) => x.lens === l.key); return v ? <div key={l.key} className="min-w-0 flex-1 text-center"><div className="mx-auto w-full max-w-8 rounded-t-[4px] bg-accent" style={{ height: `${v.score * 6}px` }} title={`${l.name}: ${v.score}/10`} /><div className="mt-1 truncate text-[10px] text-muted">{l.name.replace("The ", "").split(" ")[0]}</div><div className="text-[10px] tabular-nums text-faint">{v.score}</div></div> : null; })}
          </div>
        </Section>
      )}
      {d.disagreements.length > 0 && (
        <Section title="Where they disagree">
          <div className="mx-5 space-y-2 lg:mx-0">{d.disagreements.map((x) => <div key={x.topic} className="card p-4"><div className="text-[14.5px] font-semibold">{x.topic}</div><ul className="mt-1.5 space-y-1 text-[13px] text-muted">{x.positions.map((p) => <li key={p}>— {p}</li>)}</ul></div>)}</div>
        </Section>
      )}
      {d.tradeoffs.length > 0 && <Section title="Trade-offs"><ul className="mx-5 space-y-1.5 text-[14px] lg:mx-0">{d.tradeoffs.map((t) => <li key={t}>— {t}</li>)}</ul></Section>}
      {(d.unknowns.length > 0 || d.evidence.length > 0) && (
        <Section title="What we found">
          <div className="mx-5 space-y-2 lg:mx-0">
            {d.unknowns.map((u) => <div key={u.question} className="rounded-2xl bg-raised p-4"><div className="text-[13.5px] font-medium">{u.question}</div><div className="mt-1 text-[13px] text-muted">{u.finding}</div></div>)}
            {d.evidence.map((e) => <div key={e.claim} className="text-[13px]">— {e.claim} {e.source_url ? <a href={e.source_url} target="_blank" rel="noreferrer noopener" className="text-accent">{hostOf(e.source_url)}</a> : <span className="text-faint">(unsourced)</span>}</div>)}
          </div>
        </Section>
      )}
      {d.next_steps.length > 0 && (
        <Section title="Reduce the uncertainty">
          <div className="mx-5 flex flex-wrap gap-2 lg:mx-0">{d.next_steps.map((n) => <Delegate key={n.label} label={n.label} instruction={n.instruction} context={ctx} />)}</div>
        </Section>
      )}
      {d.status !== "deliberating" && d.options.length > 0 && (
        <Section title={d.decided_option ? `You decided: ${d.decided_option}` : "Your decision"}>
          <div className="mx-5 lg:mx-0">{d.decided_option ? <p className="text-[14px] text-muted">{d.decision_note || "No reasoning recorded."}</p> : <DecideForm id={d.id} options={d.options} recommended={d.recommendation?.option ?? null} />}</div>
        </Section>
      )}
    </div>
  );
}
