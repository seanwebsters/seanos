import Link from "next/link";
import { commandCentre } from "@/lib/services/infinity";
import { relTime } from "@/lib/time";
import { ActionButton, Delegate, LiveRefresh } from "@/components/client";
import { Empty, Section } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { WorldGraph } from "@/components/WorldGraph";
import { AskWorld, EmergencyStop } from "./client";

export const dynamic = "force-dynamic";

const LEVEL = ["", "Observe", "Prepare", "Execute internally", "External with approval", "Pre-authorised"];
const KIND: Record<string, string> = { opportunity: "Opportunity", risk: "Risk", weak_assumption: "Weak assumption", contradiction: "Contradiction", attention: "Attention", collaborator: "Collaborator", possibility: "Possibility", neglected: "Neglected", connection: "Connection", overcomplication: "Simplify" };

export default async function Infinity() {
  const d = await commandCentre();
  const missingRunning = d.running.some((t) => t.kind === "missing");
  return (
    <div>
      <LiveRefresh active={d.running.length > 0} every={5000} />
      <header className="pt-safe px-5 pt-6 lg:px-0 lg:pt-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="-ml-2 flex items-center gap-0.5 rounded-full px-2 py-1 text-[15px] text-accent"><Icon name="back" size={22} /> SEAN OS</Link>
          <Link href="/infinity/trust" className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium ${d.settings.halted ? "bg-rose text-white" : "bg-raised text-muted"}`}>
            <span className={`h-2 w-2 rounded-full ${d.settings.halted ? "bg-white" : "bg-sage"}`} /> {d.settings.halted ? "Stopped" : `L${d.settings.autonomy_level} · ${LEVEL[d.settings.autonomy_level]}`}
          </Link>
        </div>
        <div className="mt-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-accent">Personal intelligence layer</div>
        <h1 className="display mt-1 text-[64px] leading-[0.9] lg:text-[84px]">SEAN <span className="text-accent">∞</span></h1>
        <p className="mt-3 max-w-lg text-[15.5px] leading-relaxed text-muted">Your world, your missions and the moves that matter, connected and backed by evidence. You stay in charge of every consequential decision.</p>
      </header>

      {d.settings.halted && <div className="mx-5 mt-5 flex items-center justify-between gap-3 rounded-card bg-rose/12 p-4 text-rose lg:mx-0"><span className="text-[14px] font-medium">All agents are stopped. Nothing runs until you resume.</span><EmergencyStop halted /></div>}

      {/* NEXT BEST MOVE */}
      <section className="mx-5 mt-7 overflow-hidden rounded-[28px] bg-ink p-6 text-bg lg:mx-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] opacity-60">Next best move</div>
        {d.nbm ? (
          <>
            <div className="display mt-2 text-[32px] leading-[1.02]">{d.nbm.title}</div>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed opacity-80">{d.nbm.insight}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">{d.nbm.evidence.map((e) => e.href ? <Link key={e.id} href={e.href} className="rounded-full bg-bg/15 px-2.5 py-1 text-[11.5px]">{e.label}</Link> : <span key={e.id} className="rounded-full bg-bg/15 px-2.5 py-1 text-[11.5px]">{e.label}</span>)}</div>
            <div className="mt-5 flex flex-wrap gap-2">
              <ActionButton url={`/api/insights/${d.nbm.id}`} body={{ action: "act" }} className="btn bg-accent text-[#141413]" toastText="Your team is on it"><Icon name="bolt" size={16} /> Do it</ActionButton>
              <ActionButton url={`/api/insights/${d.nbm.id}`} body={{ action: "dismiss" }} className="btn bg-bg/15 text-bg">Not now</ActionButton>
            </div>
          </>
        ) : (
          <>
            <div className="display mt-2 text-[28px] leading-tight">No move recommended yet</div>
            <p className="mt-2 max-w-xl text-[14.5px] opacity-75">It comes from evidence: run <em>What am I missing?</em> or a strategic review once you have an active ambition.</p>
          </>
        )}
      </section>

      {/* WHAT AM I MISSING */}
      <section className="mx-5 mt-4 rounded-[28px] bg-surface p-6 ring-1 ring-line lg:mx-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="display text-[34px] leading-none">What am I missing?</div>
            <p className="mt-2 max-w-md text-[13.5px] text-muted">Scans your goals, work, network, research and recent decisions for blind spots. It only reports what the evidence supports, and sometimes the answer is nothing.</p>
          </div>
          <Delegate label={missingRunning ? "Looking…" : "Find out"} kind="missing" className="btn-primary px-6 py-3 text-[15px]" icon="search" />
        </div>
        {d.lastMissing && (
          <div className="mt-5">
            <div className="mb-2 text-[12px] text-faint">Last run {relTime(d.lastMissing.completed_at ?? d.lastMissing.updated_at)} · {d.lastMissing.status === "completed" ? d.lastMissing.summary : d.lastMissing.error}</div>
            <div className="space-y-2.5">
              {d.findings.slice(0, 5).map((f) => (
                <div key={f.id} className="rounded-2xl bg-raised p-4">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-accent">{KIND[f.kind] ?? f.kind}<span className="font-normal normal-case tracking-normal text-faint">impact {f.impact}/5 · {Math.round(f.confidence * 100)}% sure</span></div>
                  <div className="mt-1 text-[16px] font-semibold leading-snug">{f.title}</div>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink/80">{f.insight}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">{f.evidence.map((e) => e.href ? <Link key={e.id} href={e.href} className="rounded-full bg-surface px-2.5 py-1 text-[11.5px] text-muted ring-1 ring-line">{e.label}</Link> : <span key={e.id} className="rounded-full bg-surface px-2.5 py-1 text-[11.5px] text-muted ring-1 ring-line">{e.label}</span>)}</div>
                  {f.status === "new" && f.recommendation && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionButton url={`/api/insights/${f.id}`} body={{ action: "act" }} className="chip bg-ink text-bg"><Icon name="bolt" size={14} /> {f.recommendation.label}</ActionButton>
                      <ActionButton url={`/api/insights/${f.id}`} body={{ action: "dismiss" }} className="chip">Dismiss</ActionButton>
                    </div>
                  )}
                  {f.status === "acted" && f.task_id && <Link href={`/tasks/${f.task_id}`} className="mt-2 inline-block text-[12.5px] text-accent">In progress →</Link>}
                </div>
              ))}
            </div>
            {d.findings.length > 0 && <Link href="/infinity/missing" className="mt-3 inline-block text-[13px] text-muted">All findings →</Link>}
          </div>
        )}
      </section>

      {/* YOUR WORLD */}
      <Section title="Your world" href="/infinity/world">
        <div className="mx-5 lg:mx-0"><WorldGraph height={300} compact /></div>
        <div className="mx-5 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted lg:mx-0">
          <span>{d.counts.nodes} entities · {d.counts.edges} relationships</span>
          <Link href="/infinity/changes" className="text-accent">+{d.month.added.length} this month</Link>
          {d.conflicts.length > 0 && <Link href="/infinity/world?view=conflicts" className="text-rose">{d.conflicts.length} contradiction{d.conflicts.length > 1 ? "s" : ""} to resolve</Link>}
          <Delegate label="Update from my records" kind="graph_extract" className="chip ml-auto" icon="refresh" />
        </div>
      </Section>

      {/* ASK */}
      <Section title="Ask your world">
        <div className="mx-5 lg:mx-0">
          <AskWorld examples={["What connections am I missing?", "Which of my ideas overlap?", "Who in my network could help with Calmlings partnerships?", "What has changed since last month?"]} />
          {d.answers.length > 0 && (
            <div className="mt-4 space-y-2">
              {d.answers.map((r) => <Link key={r.id} href={`/reports/${r.id}`} className="card block p-4"><div className="text-[14.5px] font-medium">{r.title}</div><div className="mt-0.5 line-clamp-2 text-[13px] text-muted">{r.summary}</div></Link>)}
            </div>
          )}
          {d.running.filter((t) => t.kind === "graph_ask").map((t) => <div key={t.id} className="mt-2 flex items-center gap-2 text-[13px] text-muted"><span className="h-2 w-2 animate-pulse2 rounded-full bg-sky" /> {t.title}</div>)}
        </div>
      </Section>

      {/* MISSIONS */}
      <Section title="Active missions" href="/infinity/strategy">
        {d.missions.length ? (
          <div className="mx-5 space-y-2.5 lg:mx-0">
            {d.missions.map(({ a, progress, objectives, activeTasks }) => (
              <Link key={a.id} href={`/infinity/strategy/${a.id}`} className="card block p-5 active:scale-[0.99]">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted"><span>{a.horizon} · {a.status}</span><span>{Math.round(progress * 100)}%</span></div>
                <div className="mt-1.5 font-serif text-[19px] font-medium leading-snug">{a.statement}</div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, progress * 100)}%` }} /></div>
                <div className="mt-2 text-[12px] text-faint">{objectives} objectives · {activeTasks} workstream{activeTasks === 1 ? "" : "s"} running</div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty icon="target" title="Give SEAN ∞ an ambition" body="Not a task: where you want to be. It becomes a strategy, objectives, projects and work your team can start on.">
            <Link href="/infinity/strategy" className="btn-primary">Set an ambition</Link>
          </Empty>
        )}
      </Section>

      {/* NEW CONNECTIONS */}
      <Section title="New connections" href="/infinity/world">
        {d.conv.length || d.links.length ? (
          <div className="mx-5 space-y-2.5 lg:mx-0">
            {d.conv.map((c) => (
              <div key={c.node.id} className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/infinity/node/${c.node.id}`} className="text-[16px] font-semibold">{c.node.name}</Link>
                  <span className="text-[11.5px] text-muted">{c.legs.length} threads converge</span>
                </div>
                <ul className="mt-2 space-y-1.5 text-[13px] text-ink/80">{c.legs.map((l, i) => <li key={i} className="flex gap-2"><span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-accent">{l.kind}</span><span className="min-w-0">{l.text}</span></li>)}</ul>
                <div className="mt-3"><Delegate label="Turn into a coordinated opportunity" instruction={`Build a coordinated opportunity around ${c.node.name}. These threads converge: ${c.legs.map((l) => `${l.kind}: ${l.text}`).join("; ")}. Prepare: a short brief, a Calmlings angle if relevant, a warm intro request draft via the person in Sean's network, and a speaking pitch angle if an event is involved. Everything external stays a draft.`} context={{ type: "node", id: c.node.id, title: c.node.name }} /></div>
              </div>
            ))}
            {d.links.map((m) => (
              <div key={`${m.a.id}${m.b.id}`} className="rounded-2xl bg-raised p-4 text-[13.5px]">
                <Link href={`/infinity/node/${m.a.id}`} className="font-medium">{m.a.name}</Link> <span className="text-muted">and</span> <Link href={`/infinity/node/${m.b.id}`} className="font-medium">{m.b.name}</Link> <span className="text-muted">aren't connected, but both relate to {m.via.slice(0, 3).map((v) => v.name).join(", ")}.</span>
              </div>
            ))}
          </div>
        ) : <Empty icon="link" title="No unexpected connections yet" body="They appear when several of your threads (people, events, projects, ideas) meet around the same company or technology." />}
      </Section>

      {/* CONFLICTS */}
      {d.conflicts.length > 0 && (
        <Section title="Contradictions" href="/infinity/world?view=conflicts">
          <div className="mx-5 space-y-2 lg:mx-0">{d.conflicts.slice(0, 3).map((c) => <Link key={c.id} href={`/infinity/node/${c.node_id}`} className="block rounded-2xl bg-rose/10 p-4 text-[13.5px]">{c.description}</Link>)}</div>
        </Section>
      )}

      <div className="mx-5 mt-10 grid grid-cols-2 gap-2.5 lg:mx-0 lg:grid-cols-4">
        {[["/infinity/world", "grid", "Explore the graph"], ["/infinity/strategy", "target", "Strategy"], ["/infinity/changes", "clock", "What changed"], ["/infinity/trust", "lock", "Trust & autonomy"]].map(([href, icon, label]) => (
          <Link key={href} href={href} className="card flex flex-col gap-6 p-4"><Icon name={icon} size={20} className="text-accent" /><span className="text-[14px] font-medium">{label}</span></Link>
        ))}
      </div>
      <p className="mx-5 mt-6 text-[12px] text-faint lg:mx-0">Coming in the next phases: Intelligence Council, Future Engine, Venture Lab and Organisation Generator. See docs/SEAN_INFINITY_PLAN.md.</p>
    </div>
  );
}
