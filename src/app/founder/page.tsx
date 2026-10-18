import Link from "next/link";
import { Art, AgentBadge, agentName } from "@/components/ui";
import { Delegate, LiveRefresh } from "@/components/client";
import { CopilotChat, TaskCheck } from "@/components/founder";
import { Icon } from "@/components/Icon";
import { dashboardData, STAGE_GROUPS } from "@/lib/founder/views";
import { STREAMS, money, type StreamKey } from "@/lib/founder/finmodel";
import { dayPart, fmtDate, fmtTime, relTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const COLORS = ["var(--fe-1)", "var(--fe-2)", "var(--fe-3)", "var(--fe-4)"];

function Skyline() {
  // A quiet London silhouette: Elizabeth Tower, the Eye, the Shard and rooftops.
  return (
    <svg viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-0 h-[62%] w-full" aria-hidden>
      <defs>
        <linearGradient id="fo-city" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b2a3e" stopOpacity="0.85" /><stop offset="1" stopColor="#1d1624" /></linearGradient>
      </defs>
      <g fill="none" stroke="#3b2a3e" strokeOpacity="0.55" strokeWidth="2">
        <circle cx="300" cy="120" r="78" /><circle cx="300" cy="120" r="6" fill="#3b2a3e" />
        {Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; return <line key={i} x1="300" y1="120" x2={300 + Math.cos(a) * 78} y2={120 + Math.sin(a) * 78} />; })}
      </g>
      <path fill="url(#fo-city)" d="M0 220V170h40v-20h30v30h25v-40h20v40h30v-25h35v35h40v-30l10-10 10 10v30h30V160h25v20h40V120h12V70l8-30 8 30v50h12v40h50v-20h35v30h45v-55h18V90h10l5-20 5 20h10v35h18v55h40v-35h40v20h55l70-150 22 150h30v-30h40v40h50v-50h20v-25h30v25h20v50h40v-20h45v35h50v-60h25v60h40v-25h40v35h30V220z" />
      <g fill="#ffcf8a" opacity="0.8">
        {Array.from({ length: 70 }, (_, i) => <rect key={i} x={(i * 97) % 1180 + 10} y={168 + ((i * 37) % 44)} width="3" height="4" />)}
      </g>
    </svg>
  );
}

export default async function FounderPage({ searchParams }: { searchParams: Promise<{ f?: string; fv?: string }> }) {
  const sp = await searchParams;
  const d = await dashboardData({ filter: sp.f ?? "all", finVenture: sp.fv ?? null });
  const b = d.briefing;
  const attention = ((b?.data as { attention?: { title: string; venture: string | null; why: string }[] })?.attention ?? []);
  const actions = ((b?.data as { actions?: { title: string; venture: string | null; why: string }[] })?.actions ?? []);
  const briefDate = (b?.data as { date?: string })?.date;
  const live = d.runningAgents + d.queued > 0;
  const greeting = ({ morning: "Good morning", day: "Good afternoon", evening: "Good evening" } as const)[dayPart()];

  // Financial overview geometry.
  const streams = (Object.keys(STREAMS) as StreamKey[]).filter((s) => d.byQuarter.some((q) => q[s] > 0));
  const shown = streams.slice(0, 4);
  const qTotal = d.byQuarter.map((q) => streams.reduce((s, k) => s + q[k], 0));
  const maxQ = Math.max(1, ...qTotal);
  const y3 = d.byQuarter.slice(8).reduce((s, q) => s + streams.reduce((a, k) => a + q[k], 0), 0);
  const y3By = Object.fromEntries(streams.map((k) => [k, d.byQuarter.slice(8).reduce((s, q) => s + q[k], 0)]));

  return (
    <div className="wide pb-10">
      <LiveRefresh active={live} every={5000} />
      {/* Hero */}
      <section className="relative mx-0 overflow-hidden lg:mt-6 lg:rounded-[28px]">
        <div className="fo-hero relative h-[300px] lg:h-[400px]">
          <Skyline />
          <div className="pt-safe relative z-10 px-6 pt-12 text-white lg:px-10 lg:pt-12">
            <h1 className="display text-[56px] leading-[0.95] drop-shadow lg:text-[96px]">Founder OS</h1>
            <p className="mt-2 max-w-md text-[17px] text-white/90 lg:text-[21px]">Your AI cofounder for the business side of building.</p>
            <p className="mt-1 text-[13px] text-white/70 lg:text-[15px]">Strategy · Finance · Fundraising · Partnerships · Operations · Growth</p>
          </div>
          <div className="absolute bottom-24 right-[34%] hidden rotate-[-8deg] font-display text-[22px] italic leading-tight text-white/85 xl:block">Big ideas.<br />Real plans.<br />Let&apos;s build.</div>
        </div>
        {/* Briefing card */}
        <div className="relative z-10 mx-4 -mt-20 lg:absolute lg:right-5 lg:top-5 lg:mx-0 lg:mt-0 lg:w-[330px]">
          <div className="glass rounded-[22px] p-4 shadow-2xl ring-1 ring-line">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-bg"><Icon name="mic" size={16} /></span>
              <div className="min-w-0">
                <div className="text-[14px] font-medium">{greeting}, Sean.</div>
                <div className="text-[13px] text-muted">{b ? `Here's what needs your attention${briefDate ? ` (${fmtDate(briefDate)})` : ""}:` : "No briefing yet. Your cofounder can prepare one from your real records."}</div>
              </div>
            </div>
            {b ? (
              <ol className="mt-3 space-y-1.5">
                {[...actions, ...attention].slice(0, 5).map((a, i) => {
                  const v = d.ventures.find((x) => x.name === a.venture);
                  return (
                    <li key={i}><Link href={v ? `/founder/v/${v.id}` : "/founder"} className="flex items-center gap-2.5 rounded-xl px-1 py-1 text-[13.5px] hover:bg-raised">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-raised text-[11px] tabular-nums">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate" title={a.why}>{a.title}</span>
                      {i === 0 && <Icon name="arrow" size={14} className="text-faint" />}
                    </Link></li>
                  );
                })}
              </ol>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Delegate label={b ? "Refresh briefing" : "Prepare my briefing"} kind="founder_briefing" instruction="Founder briefing" className="chip" icon="refresh" />
              <Delegate label="Rank my ventures" kind="commercial_analysis" instruction="Rank my ventures" className="chip" icon="chart" />
            </div>
          </div>
        </div>
      </section>

      <div className="mt-4 grid gap-5 lg:mt-[-72px] lg:grid-cols-[minmax(0,1fr)_330px] lg:px-5">
        <div className="min-w-0 space-y-5">
          {/* KPI strip */}
          <div className="no-scrollbar relative z-10 flex gap-3 overflow-x-auto px-5 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
            <Kpi label="Forecast revenue" hint="year 1, base case" value={d.modelled.length ? money(d.y1) : "–"} sub={d.modelled.length ? `${d.modelled.length} model${d.modelled.length > 1 ? "s" : ""} · forecast` : "No models yet"} />
            <Kpi label="Active ventures" value={String(d.ventures.length)} sub={`${d.counts.building} building · ${d.counts.live} live · ${d.counts.concept} concepts`} />
            <Kpi label="Cash position" value={d.cash !== null ? money(d.cash) : "–"} sub={d.cash !== null ? "from your actuals" : "Add actuals in a model"} />
            <Kpi label="Next funding target" value={d.fundraising?.round ? money(d.fundraising.round.target, d.fundraising.round.currency) : "–"} sub={d.fundraising ? `${d.fundraising.venture.name} · estimate` : "No funding plan yet"} />
            <Kpi label="Key meetings" value={String(d.events.length)} sub="next 7 days, from your calendar" />
          </div>

          {/* Ventures */}
          <section className="card mx-5 overflow-hidden py-4 lg:mx-0">
            <div className="flex flex-wrap items-center gap-2 px-5">
              <h2 className="display mr-auto text-[28px] leading-none">Your Ventures</h2>
              <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
                {Object.entries(STAGE_GROUPS).filter(([k]) => k !== "concept").map(([k, g]) => (
                  <Link key={k} href={`/founder?f=${k}`} scroll={false} className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] font-medium ${(sp.f ?? "all") === k ? "bg-ink text-bg" : "bg-raised text-muted"}`}>{g.label} ({d.counts[k]})</Link>
                ))}
              </div>
              <Link href="/founder/new" className="chip"><Icon name="plus" size={13} /> New venture</Link>
            </div>
            <div className="no-scrollbar mt-4 flex snap-x gap-3 overflow-x-auto px-5 pb-1">
              {d.cards.length ? d.cards.map(({ v, progress, next }) => (
                <Link key={v.id} href={`/founder/v/${v.id}`} className="w-[230px] shrink-0 snap-start rounded-2xl p-3 ring-1 ring-line transition hover:bg-raised/60">
                  <div className="flex gap-3">
                    <Art seed={v.name} className="h-[92px] w-[64px] shrink-0 rounded-xl"><span className="absolute inset-0 flex items-center justify-center font-display text-[30px] text-white/90">{v.name[0]}</span></Art>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5"><span className="truncate text-[15px] font-semibold">{v.name}</span>{v.conflicts.length > 0 && <span title={v.conflicts[0]} className="text-[11px] text-rose">⚑</span>}</div>
                      <div className="mt-0.5 line-clamp-3 text-[12px] leading-snug text-muted">{v.tagline}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-sage" style={{ width: `${progress}%` }} /></div><span className="text-[11.5px] tabular-nums text-muted">{progress}%</span></div>
                  <div className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted"><span className={`h-1.5 w-1.5 rounded-full ${v.status === "running" ? "animate-pulse2 bg-sky" : v.stage === "concept" ? "bg-faint" : "bg-sage"}`} />{next}{v.health && <span className="ml-auto">health {v.health.score}</span>}</div>
                </Link>
              )) : <div className="py-6 text-[13.5px] text-muted">Nothing in this group yet.</div>}
            </div>
            <p className="mt-3 px-5 text-[11.5px] text-faint">Progress counts what exists (strategy, model, funding plan, readiness, 90-day plan, legal checklist, tasks done). Seeded ventures are proposed concepts until you confirm them.</p>
          </section>

          <div className="grid gap-5 lg:grid-cols-3">
            {/* Financial overview */}
            <section className="card mx-5 p-5 lg:mx-0">
              <h2 className="display text-[24px] leading-none">Financial Overview</h2>
              <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
                <Link href="/founder" scroll={false} className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] ${!sp.fv ? "bg-ink text-bg" : "bg-raised text-muted"}`}>All ventures</Link>
                {d.modelled.map((v) => <Link key={v.id} href={`/founder?fv=${v.id}`} scroll={false} className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] ${sp.fv === v.id ? "bg-ink text-bg" : "bg-raised text-muted"}`}>{v.name}</Link>)}
              </div>
              {streams.length ? (
                <>
                  <div className="display mt-4 text-[40px] leading-none">{money(y3)}</div>
                  <div className="text-[12px] text-muted">Projected revenue, year 3 (base forecast, GBP)</div>
                  <svg viewBox="0 0 240 110" className="mt-3 w-full" role="img" aria-label="Quarterly revenue by stream">
                    {d.byQuarter.map((q, i) => {
                      let yy = 100;
                      return <g key={i}>{[...shown, ...streams.slice(4)].map((k, j) => { const h = (q[k] / maxQ) * 92; yy -= h; return h > 0 ? <rect key={k} x={i * 20 + 3} y={yy} width="14" height={Math.max(0.5, h)} rx="1.5" fill={j < 4 ? COLORS[j] : "rgb(var(--faint))"} /> : null; })}</g>;
                    })}
                    <line x1="0" x2="240" y1="100.5" y2="100.5" stroke="rgb(var(--line))" />
                    {[0, 1, 2].map((y) => <text key={y} x={y * 80 + 4} y="109" fontSize="7" fill="rgb(var(--faint))">Y{y + 1}</text>)}
                  </svg>
                  <div className="mt-2 space-y-1">
                    {streams.map((k, j) => <div key={k} className="flex items-center gap-2 text-[12.5px]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: j < 4 ? COLORS[j] : "rgb(var(--faint))" }} />{STREAMS[k]}<span className="ml-auto tabular-nums text-muted">{y3 ? Math.round((y3By[k] / y3) * 100) : 0}%</span></div>)}
                  </div>
                  <details className="mt-2 text-[12px]"><summary className="cursor-pointer text-muted">Table</summary>
                    <table className="mt-1 w-full tabular-nums"><tbody>{d.byQuarter.map((q, i) => <tr key={i} className="border-t border-line"><td className="py-0.5">Y{Math.floor(i / 4) + 1} Q{(i % 4) + 1}</td><td className="text-right">{money(qTotal[i])}</td></tr>)}</tbody></table>
                  </details>
                </>
              ) : (
                <div className="mt-6 text-[13.5px] text-muted">No financial models yet. Open a venture and run <b>Build the business</b>, or ask the CFO agent for a model.</div>
              )}
            </section>

            {/* Fundraising pipeline */}
            <section className="card mx-5 p-5 lg:mx-0">
              <h2 className="display text-[24px] leading-none">Fundraising Pipeline</h2>
              {d.fundraising ? (
                <>
                  <div className="mt-3 flex gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold">{d.fundraising.venture.name}</div>
                      <div className="text-[11.5px] text-muted">{d.fundraising.round?.instrument ?? "Round"}</div>
                      {d.fundraising.round && <div className="mt-1"><span className="display text-[30px]">{money(d.fundraising.round.target, d.fundraising.round.currency)}</span> <span className="text-[12px] text-muted">target (estimate)</span></div>}
                    </div>
                    <Art seed={d.fundraising.venture.name} className="h-[70px] w-[96px] shrink-0 rounded-xl" />
                  </div>
                  <div className="mt-2 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-sky" style={{ width: `${Math.round(d.fundraising.readiness * 100)}%` }} /></div><span className="text-[11.5px] tabular-nums text-muted">{Math.round(d.fundraising.readiness * 100)}% ready</span></div>
                  <ul className="mt-3 space-y-1.5">
                    {d.fundraising.items.map((it) => <li key={it.label} className="flex items-center gap-2 text-[13px]"><span className={`flex h-4 w-4 items-center justify-center rounded-full ${it.done ? "bg-sage text-white" : "ring-1 ring-line"}`}>{it.done && <Icon name="check" size={10} />}</span><span className={it.done ? "text-muted" : ""}>{it.label}</span><span className="ml-auto text-[12px] text-faint">{it.value}</span></li>)}
                  </ul>
                  <Link href={`/founder/v/${d.fundraising.venture.id}?tab=funding`} className="chip mt-4">View pipeline <Icon name="arrow" size={13} /></Link>
                </>
              ) : <div className="mt-6 text-[13.5px] text-muted">No venture has a funding plan yet. Building a business produces one, with readiness checklist, deck and investor shortlist.</div>}
            </section>

            {/* Upcoming tasks */}
            <section className="card mx-5 p-5 lg:mx-0">
              <div className="flex items-center justify-between"><h2 className="display text-[24px] leading-none">Upcoming Tasks</h2>{d.overdue > 0 && <span className="rounded-full bg-rose/15 px-2 py-0.5 text-[11px] font-semibold text-rose">{d.overdue} overdue</span>}</div>
              {d.upcoming.length ? (
                <ul className="mt-3 space-y-2.5">
                  {d.upcoming.map((t) => (
                    <li key={t.id} className="flex items-start gap-2.5">
                      <span className="mt-0.5"><TaskCheck id={t.id} done={false} /></span>
                      <Link href={`/founder/v/${t.venture_id}?tab=tasks`} className="min-w-0 flex-1"><div className="truncate text-[13px]">{t.title}</div><div className="text-[11px] text-faint">{d.ventureName(t.venture_id)}</div></Link>
                      {t.owner.toLowerCase() === "sean" ? <span title="You" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[9px] font-semibold text-bg">S</span> : <AgentBadge agent={t.owner} size={20} />}
                      <span className={`w-12 text-right text-[11px] ${t.due! < d.today ? "text-rose" : "text-muted"}`}>{t.due === d.today ? "Today" : fmtDate(t.due!, { weekday: "short" })}</span>
                    </li>
                  ))}
                </ul>
              ) : <div className="mt-6 text-[13.5px] text-muted">Nothing due in the next 7 days.</div>}
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card mx-5 p-5 lg:mx-0">
              <div className="flex items-center justify-between"><h2 className="display text-[24px] leading-none">Investor Opportunities</h2><Link href="/founder/investors" className="chip">View all <Icon name="arrow" size={13} /></Link></div>
              {d.opportunities.length ? (
                <div className="mt-3 grid gap-2 xl:grid-cols-2">
                  {d.opportunities.map(({ p, inv, venture }) => (
                    <Link key={p.id} href={`/founder/investors?id=${p.id}`} className="flex items-center gap-2.5 rounded-xl px-1 py-1.5 hover:bg-raised">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-[13px] font-bold">{inv.name[0]}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{inv.firm || inv.name}</span><span className="block truncate text-[11px] text-faint">{venture?.name} · {inv.sectors.slice(0, 2).join(", ")}</span></span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${p.warm_intro ? "bg-accent/15 text-accent" : p.fit_score >= 8 ? "bg-sage/15 text-sage" : "bg-sky/15 text-sky"}`}>{p.warm_intro ? "Warm intro" : p.fit_score >= 8 ? "Strong fit" : "Relevant"}</span>
                    </Link>
                  ))}
                </div>
              ) : <div className="mt-4 text-[13.5px] text-muted">No investors researched yet. Investor Research only adds investors it can verify with a live source.</div>}
            </section>
            <section className="card mx-5 p-5 lg:mx-0">
              <div className="flex items-center justify-between"><h2 className="display text-[24px] leading-none">Partnership Opportunities</h2><Link href="/calmlings" className="chip">View all <Icon name="arrow" size={13} /></Link></div>
              <div className="mt-1 text-[11.5px] text-faint">Calmlings partnerships belong to your Calm work and stay separate from your own ventures.</div>
              {d.partnerships.length ? (
                <div className="mt-3 grid gap-2 xl:grid-cols-2">
                  {d.partnerships.map((p) => (
                    <Link key={p.id} href={`/calmlings/${p.id}`} className="flex items-center gap-2.5 rounded-xl px-1 py-1.5 hover:bg-raised">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-[13px] font-bold">{p.brand[0]}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{p.brand}</span><span className="block truncate text-[11px] text-faint">{p.category}</span></span>
                      <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[10.5px] font-semibold text-muted">Calm · {p.status.replace(/_/g, " ")}</span>
                    </Link>
                  ))}
                </div>
              ) : <div className="mt-4 text-[13.5px] text-muted">No partnership research yet.</div>}
            </section>
          </div>
        </div>

        {/* Right column */}
        <aside className="min-w-0 space-y-5 lg:pt-[84px]">
          <section className="card relative z-10 mx-5 flex flex-col overflow-hidden lg:mx-0">
            <div className="flex items-center justify-between px-4 pt-4"><h2 className="display text-[28px] leading-none">AI Cofounder</h2><Link href="/founder/copilot" className="text-[12px] text-muted">Open</Link></div>
            {d.deliverables.length > 0 && (
              <div className="mt-3 space-y-1.5 px-4">
                {d.deliverables.map((x) => (
                  <Link key={x.id} href={`/founder/v/${x.venture_id}?tab=${x.kind === "deck" ? "funding" : x.kind === "funding_requirements" ? "finance" : x.kind === "plan_90" ? "tasks" : "strategy"}`} className="flex items-center gap-3 rounded-2xl p-2.5 ring-1 ring-line hover:bg-raised">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-raised text-accent"><Icon name={x.kind === "deck" ? "studio" : x.kind === "funding_requirements" ? "chart" : "book"} size={16} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{x.title}</span><span className="block text-[11px] text-faint">{d.ventureName(x.venture_id)} · v{x.version} · editable</span></span>
                    <Icon name="chevron" size={15} className="text-faint" />
                  </Link>
                ))}
              </div>
            )}
            <CopilotChat suggestions={["Which venture should I focus on this quarter?", "Build the business for Webster", "What's blocking my fundraising?"]} />
          </section>

          <section className="card mx-5 p-4 lg:mx-0">
            <div className="flex items-center justify-between"><h2 className="display text-[24px] leading-none">Agent Activity</h2><span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${d.runningAgents ? "bg-sage/15 text-sage" : "bg-raised text-muted"}`}><span className={`h-1.5 w-1.5 rounded-full bg-current ${d.runningAgents ? "animate-pulse2" : ""}`} />{d.runningAgents ? `${d.runningAgents} running` : d.queued ? `${d.queued} queued` : "Idle"}</span></div>
            {d.activity.length ? (
              <ul className="mt-3 space-y-3">
                {d.activity.map((t) => (
                  <li key={t.id}><Link href={`/tasks/${t.id}`} className="flex items-center gap-3">
                    <AgentBadge agent={t.agent} size={30} />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{agentName(t.agent)}</span><span className="block truncate text-[11.5px] text-muted">{t.title}</span></span>
                    <span className="shrink-0 text-[11px] text-faint">{t.status === "running" ? "now" : t.status === "queued" ? "queued" : t.status === "completed" ? relTime(t.updated_at) : t.status}</span>
                  </Link></li>
                ))}
              </ul>
            ) : <div className="mt-3 text-[13px] text-muted">No Founder OS agent work yet. Activity shows only real tasks.</div>}
          </section>

          {d.events.length > 0 && (
            <section className="card mx-5 p-4 lg:mx-0">
              <h2 className="display text-[22px] leading-none">This week</h2>
              <ul className="mt-2 space-y-1.5">{d.events.slice(0, 5).map((e) => <li key={e.id} className="flex justify-between text-[13px]"><span className="truncate">{e.title}</span><span className="text-muted">{fmtDate(e.start, { weekday: "short" })} {e.all_day ? "" : fmtTime(e.start)}</span></li>)}</ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, hint }: { label: string; value: string; sub: string; hint?: string }) {
  return (
    <div className="card w-[170px] shrink-0 p-4 shadow-sm lg:w-auto">
      <div className="text-[12.5px] font-medium">{label}</div>
      {hint && <div className="text-[11px] text-faint">({hint})</div>}
      <div className="display mt-1.5 text-[34px] leading-none tabular-nums">{value}</div>
      <div className="mt-1.5 text-[11.5px] leading-snug text-muted">{sub}</div>
    </div>
  );
}
