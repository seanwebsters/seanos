import Link from "next/link";
import type { ReactNode } from "react";
import { lifeData, JOURNAL_PROMPTS, type LifeData } from "@/lib/life/core";
import { fmtDate, fmtTime } from "@/lib/time";
import { Icon } from "@/components/Icon";
import { PageNav } from "@/components/client";
import { Skyline } from "@/components/Skyline";
import { AddWin, AreaRate, EditNumbers, HQList, JournalToday, PhotoSlot, Priorities, ProjectControls, QuickCapture, STATUS_STYLE } from "@/components/life";

export const dynamic = "force-dynamic";

const GREETING = { morning: "Good morning", day: "Good afternoon", evening: "Good evening" } as const;
const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

export default async function LifeHQ() {
  const d = await lifeData();
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" }).format(new Date()));
  const part = hour >= 4 && hour < 12 ? "morning" : hour < 18 ? "day" : "evening";
  const first = d.profile.name.split(" ")[0];
  const img = d.me.images;
  const year = Number(d.today.slice(0, 4)) + (d.today.slice(5, 7) >= "10" ? 1 : 0);

  return (
    <div className="wide pb-12">
      {/* Hero */}
      <PhotoSlot target="hero" src={img.hero} seed="lifehq" fallback={<Skyline />} className="h-[210px] w-full lg:mt-6 lg:h-[250px] lg:rounded-[28px]">
        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/15 to-transparent" />
        <div className="pt-safe absolute inset-x-0 bottom-0 px-6 pb-7 text-white lg:px-10 lg:pb-9">
          <h1 className="font-display text-[52px] leading-none tracking-[0.06em] lg:text-[72px]">LIFE HQ</h1>
          <div className="mt-2 max-w-xs text-[11.5px] font-medium uppercase leading-relaxed tracking-[0.28em] text-white/85 lg:max-w-md lg:text-[12.5px]">{d.me.vision}</div>
          <div className="mt-3 h-px w-14 bg-white/70" />
        </div>
        <div className="absolute right-8 top-8 hidden rotate-[-6deg] font-display text-[26px] italic text-white/90 lg:block">A life I&apos;m proud of.</div>
      </PhotoSlot>

      <PageNav />

      {/* My life right now */}
      <section id="now" className="mt-4 grid gap-4 px-5 lg:grid-cols-[1.15fr_1fr_0.8fr] lg:px-0 [&>*]:min-w-0">
        <div className="card p-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
            <span>{fmtDate(d.today, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
            {d.weather && <span className="flex items-center gap-1.5"><Icon name="sun" size={14} className="text-accent" />{d.weather.temp_c}°C</span>}
            <span>London</span>
          </div>
          <h2 className="display mt-3 text-[34px] leading-tight lg:text-[38px]">{GREETING[part]}, {first}.</h2>
          <div className="mt-1 flex flex-wrap gap-x-2.5 text-[13.5px] text-muted"><span>{d.profile.role} @ {d.profile.company}</span><span className="text-line">|</span><span>Age {d.age}</span><span className="text-line">|</span><span>Soho, London</span></div>
          <blockquote className="mt-5 rounded-2xl bg-raised/70 px-5 py-4 font-display text-[19px] italic leading-snug text-ink/85">&ldquo;{d.me.quote}&rdquo;</blockquote>
          <div className="mt-3"><EditNumbers me={d.me} /></div>
        </div>
        <div className="card p-5">
          <Label>This week — top 3 priorities</Label>
          <div className="mt-3"><Priorities week={d.week} items={d.priorities} /></div>
        </div>
        <div className="card p-5">
          <Label>Upcoming</Label>
          {d.upcoming.map((u, i) => (
            <div key={u.date} className="mt-3">
              <div className="text-[12.5px] font-medium text-muted">{i === 0 ? "Today" : "Tomorrow"}</div>
              {u.events.length + u.items.length + u.ventureTasks.length === 0 ? <div className="mt-1 text-[12.5px] text-faint">Nothing scheduled</div> : (
                <ul className="mt-1.5 space-y-1.5 text-[13px]">
                  {u.events.map((e) => <li key={e.id} className="flex gap-2"><span className="w-11 shrink-0 tabular-nums text-faint">{e.all_day ? "all day" : fmtTime(e.start)}</span><span className="truncate">{e.title}</span></li>)}
                  {u.items.map((t) => <li key={t.id} className="flex gap-2"><Icon name="check" size={13} className="mt-0.5 shrink-0 text-faint" /><span className={`truncate ${t.done ? "text-faint line-through" : ""}`}>{t.title}</span></li>)}
                  {u.ventureTasks.map((t) => <li key={t.id} className="flex gap-2"><Icon name="rocket" size={13} className="mt-0.5 shrink-0 text-faint" /><Link href={`/founder/v/${t.venture_id}?tab=tasks`} className="truncate">{t.title} <span className="text-faint">· {t.venture}</span></Link></li>)}
                </ul>
              )}
            </div>
          ))}
          <Link href="/diary" className="mt-3 inline-block text-[12px] text-accent">Calendar →</Link>
        </div>
      </section>

      {/* Life overview */}
      <section id="overview" className="mt-8 px-5 lg:px-0">
        <Label>Life overview</Label>
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8 [&>*]:min-w-0">
          {d.areas.map((a) => <AreaCard key={a.key} a={a} me={d.me} />)}
        </div>
      </section>

      {/* Calm projects + Founder HQ + Money */}
      <div className="mt-8 grid gap-6 px-5 lg:grid-cols-2 lg:px-0 [&>*]:min-w-0">
        <section id="career">
          <Head title="Active projects (Calm)" />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 [&>*]:min-w-0">
            {d.projects.map((p) => (
              <div key={p.id} className="card relative overflow-hidden">
                <PhotoSlot target={`project:${p.id}`} src={p.image} seed={p.name} className="h-[104px] w-full" />
                <div className="p-3">
                  <div className="truncate text-[13.5px] font-semibold">{p.name}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${STATUS_STYLE[p.status]}`}>{p.status}</span>
                    {p.progress !== null && <><Bar value={p.progress / 100} color="var(--fe-3)" /><span className="text-[11px] tabular-nums text-muted">{p.progress}%</span></>}
                  </div>
                </div>
                <ProjectControls p={p} />
              </div>
            ))}
          </div>
          <Spread projects={d.projects} />
        </section>

        <div className="space-y-6">
          <section id="founder">
            <Head title="My own business — Founder HQ" href="/founder" />
            <div className="card grid overflow-hidden sm:grid-cols-[1.3fr_1fr] [&>*]:min-w-0">
              <PhotoSlot target="section:founder" src={img["section:founder"]} seed="founder-hq" className="min-h-[150px]">
                <Overlay>Build something of my own that generates {gbp(d.me.revenue_target)} in annual revenue.</Overlay>
              </PhotoSlot>
              <div className="p-4">
                <ul className="space-y-2">{d.journey.map((j) => <li key={j.label} className="flex items-center gap-2.5 text-[13px]"><span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] ring-1 ${j.done ? "bg-sage text-white ring-sage" : "ring-line"}`}>{j.done && <Icon name="check" size={11} />}</span><span className={j.done ? "text-muted" : ""}>{j.label}</span></li>)}</ul>
                <div className="mt-3 text-[11.5px] text-faint">Ticks itself from your ventures and recorded numbers. {d.arr > 0 ? `Run-rate ${gbp(d.arr)} a year.` : "No revenue recorded yet."}</div>
              </div>
            </div>
          </section>

          <section id="money">
            <Head title="Money & wealth" href="/finance" />
            <div className="grid gap-2.5 sm:grid-cols-[0.9fr_1.2fr_1fr] [&>*]:min-w-0">
              <div className="card p-4">
                <div className="text-[12px] text-muted">Savings goal</div>
                <div className="display mt-1 text-[32px] leading-none">{gbp(d.me.savings_target)}</div>
                <div className="mt-3"><Bar value={d.money.savings / d.me.savings_target} color="var(--fe-3)" thick /></div>
                <div className="mt-2 text-[13px] font-medium">{gbp(d.money.savings)} <span className="text-muted">({Math.round((d.money.savings / d.me.savings_target) * 100)}%)</span></div>
              </div>
              <div className="card p-3"><SavingsChart history={d.money.history} target={d.me.savings_target} /></div>
              <div className="card p-4 text-[13px]">
                {[["Income", d.money.hasTxns ? gbp(d.money.income) : "–"], ["Expenses", d.money.hasTxns ? `−${gbp(d.money.spend)}` : "–"], ["Saved", d.money.hasTxns ? gbp(d.money.net) : "–"], ["Investments", gbp(d.money.investments)]].map(([k, v]) => <div key={k} className="flex justify-between py-1"><span className="text-muted">{k}</span><span className="tabular-nums">{v}</span></div>)}
                <div className="mt-1 flex justify-between border-t border-line pt-2 font-semibold"><span>Net worth</span><span className="tabular-nums">{gbp(d.money.netWorth)}</span></div>
                {!d.money.hasTxns && <Link href="/finance?tab=transactions" className="mt-2 block text-[11.5px] text-accent">Import a statement for this month →</Link>}
              </div>
            </div>
            <div className="mt-1.5 text-[11px] text-faint">Personal money only. Business numbers stay in Founder OS.</div>
          </section>
        </div>
      </div>

      {/* Life sections */}
      <div className="mt-8 grid gap-6 px-5 lg:grid-cols-2 lg:px-0 [&>*]:min-w-0">
        <Block id="health" title="Health & fitness" href="/lifestyle" img={img["section:health"]} statement={d.me.areas.health?.statement || "Stronger. Healthier. More energy."}>
          <div className="mb-2 flex justify-between text-[13px]"><span className="text-muted">Workouts logged this week</span><span className="tabular-nums">{d.workoutsThisWeek}</span></div>
          <HQList section="health" items={d.sections.health} placeholder="Add a habit or metric" values />
        </Block>
        <Block id="home" title="Home & lifestyle" img={img["section:home"]} statement={d.me.areas.home?.statement || "A calm, mature and inspiring home in Soho."}>
          <HQList section="home" items={d.sections.home} placeholder="Add something for the flat" />
        </Block>
        <Block id="friends" title="Friends, family & relationships" href="/people" img={img["section:friends"]} statement={d.me.areas.friends?.statement || "More time with the people who matter."}>
          <HQList section="friends" items={d.sections.friends} placeholder="Add a plan or person to see" />
        </Block>
        <Block id="travel" title="Travel & experiences" href="/lifestyle?tab=london" img={img["section:travel"]} statement={d.me.areas.travel?.statement || "More experiences. More perspective. A bigger world."}>
          <HQList section="travel" items={d.sections.travel} placeholder="Add a trip or place" />
        </Block>
        <Block id="reputation" title="Personal reputation" href="/speaking" img={img["section:reputation"]} statement={d.me.areas.reputation?.statement || "A recognised voice in creative innovation, AI and entertainment."}>
          <HQList section="reputation" items={d.sections.reputation} placeholder="Add a talk, post or press idea" />
        </Block>
        <Block id="journal" title="Journal & reflection" img={img["section:journal"]} statement="A clearer mind. A more intentional life.">
          <div className="mb-2 text-[12.5px] font-medium text-muted">Today</div>
          <JournalToday today={d.today} entry={d.journal} prompts={JOURNAL_PROMPTS} />
        </Block>
      </div>

      {/* Year ahead + capture + wins */}
      <div className="mt-8 grid gap-6 px-5 lg:grid-cols-[1.3fr_1fr] lg:px-0 [&>*]:min-w-0">
        <section id="vision">
          <Head title={`${year}: the year I level up`} />
          <div className="card grid overflow-hidden sm:grid-cols-[minmax(190px,0.8fr)_1.4fr] [&>*]:min-w-0">
            <PhotoSlot target="section:vision" src={img["section:vision"]} seed="level-up-2027" className="min-h-[200px]">
              <Overlay>Bigger career. My own business. A healthier, happier, more fulfilling life.</Overlay>
            </PhotoSlot>
            <div className="p-4">
              <ul className="space-y-2">
                {d.areas.map((a) => (
                  <li key={a.key} className="flex items-center gap-2.5 text-[12.5px]">
                    <Icon name={a.icon} size={14} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate"><b className="font-medium">{a.label}</b> <span className="text-muted">— {a.statement}</span></span>
                    {a.progress === null ? <span className="text-[11px] text-faint">not rated</span> : <><span className="w-20 shrink-0"><Bar value={a.progress} color={a.color} /></span><span className="w-8 text-right tabular-nums text-muted">{Math.round(a.progress * 100)}%</span></>}
                  </li>
                ))}
              </ul>
              <div className="mt-3 border-t border-line pt-3"><HQList section="vision" items={d.sections.vision} placeholder="Add a goal for the year" values max={4} /></div>
            </div>
          </div>
        </section>
        <div className="space-y-6">
          <section>
            <Head title="Quick capture" />
            <div className="card p-3"><QuickCapture today={d.today} /></div>
          </section>
          <section id="wins">
            <Head title="Recent wins" action={<AddWin today={d.today} />} />
            <div className="card p-4">
              {d.wins.length ? (
                <ul className="space-y-2">{d.wins.map((w, i) => <li key={w.id} className="flex items-center gap-2.5 text-[13px]"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ["var(--fe-2)", "var(--fe-3)", "var(--fe-1)", "var(--fe-4)"][i % 4] }} /><span className="min-w-0 flex-1 truncate">{w.title}</span><span className="shrink-0 text-[11.5px] text-faint">{fmtDate(w.date)}</span></li>)}</ul>
              ) : <p className="text-[13px] text-muted">Nothing here yet. Add one win every Friday, however small. When you feel stagnant, read this first.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink">{children}</div>;
}

function Head({ title, href, action }: { title: string; href?: string; action?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <Label>{title}</Label>
      {href ? <Link href={href} className="flex items-center gap-0.5 text-[12px] text-muted hover:text-ink">View all <Icon name="arrow" size={12} /></Link> : action}
    </div>
  );
}

function Bar({ value, color, thick = false }: { value: number; color: string; thick?: boolean }) {
  const v = Math.max(0, Math.min(1, value));
  return <div className={`${thick ? "h-2" : "h-1.5"} w-full overflow-hidden rounded-full bg-raised`}><div className="h-full rounded-full" style={{ width: `${Math.max(v > 0 ? 4 : 0, v * 100)}%`, background: color }} /></div>;
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4 font-display text-[19px] italic leading-snug text-white">{children}</div>
    </>
  );
}

function AreaCard({ a, me }: { a: LifeData["areas"][number]; me: LifeData["me"] }) {
  return (
    <div className="card relative flex flex-col p-3.5" title={a.basis}>
      <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${a.color} 16%, transparent)`, color: a.color }}><Icon name={a.icon} size={16} /></span><span className="text-[13.5px] font-semibold">{a.label}</span></div>
      <div className="mt-2 line-clamp-2 min-h-[34px] text-[12px] leading-snug text-muted">{a.statement}</div>
      <div className="mt-auto flex items-center gap-2 pt-3">
        {a.progress === null ? <span className="text-[11.5px] text-accent">Tap to rate</span> : <><Bar value={a.progress} color={a.color} /><span className="text-[11px] tabular-nums text-muted">{Math.round(a.progress * 100)}%</span></>}
      </div>
      <AreaRate me={me} area={a.key} />
    </div>
  );
}

function Block({ id, title, href, img, statement, children }: { id: string; title: string; href?: string; img: string | null | undefined; statement: string; children: ReactNode }) {
  return (
    <section id={id}>
      <Head title={title} href={href} />
      <div className="card grid overflow-hidden sm:grid-cols-[1.15fr_1fr] [&>*]:min-w-0">
        <PhotoSlot target={`section:${id}`} src={img} seed={`hq-${id}`} className="min-h-[150px]"><Overlay>{statement}</Overlay></PhotoSlot>
        <div className="p-4">{children}</div>
      </div>
    </section>
  );
}

/** A gentle warning when too many Calm projects are live at once. */
function Spread({ projects }: { projects: LifeData["projects"] }) {
  const live = projects.filter((p) => ["Active", "Development", "Testing"].includes(p.status)).length;
  const unset = projects.filter((p) => p.status === "Not set").length;
  return (
    <div className="mt-2 text-[12px] text-muted">
      {unset === projects.length ? "Tap a project to set its status and progress." : live > 3 ? <span className="text-rose">{live} projects are live at once. Which one gets less of you this month?</span> : `${live} live · ${projects.filter((p) => p.status === "Blocked").length} blocked · ${projects.filter((p) => p.status === "Complete").length} complete`}
    </div>
  );
}

/** Savings by month as recorded, with a dashed straight-line projection to the target when there's a trend. */
function SavingsChart({ history, target }: { history: Record<string, number>; target: number }) {
  const pts = Object.entries(history).sort(([a], [b]) => a.localeCompare(b)).slice(-6);
  const W = 260, H = 130, L = 8, R = 8, T = 10, B = 20;
  if (pts.length === 0) return null;
  const first = pts[0], last = pts.at(-1)!;
  const months = pts.length - 1;
  const slope = months > 0 ? (last[1] - first[1]) / months : 0;
  const proj = slope > 0 ? Array.from({ length: 4 }, (_, i) => last[1] + slope * (i + 1)) : [];
  const max = Math.max(...pts.map((p) => p[1]), ...proj, 1);
  const n = pts.length + proj.length;
  const x = (i: number) => +(L + (n > 1 ? i / (n - 1) : 0.5) * (W - L - R)).toFixed(1);
  const y = (v: number) => +(T + (1 - v / max) * (H - T - B)).toFixed(1);
  const label = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleString("en-GB", { month: "short" });
  const monthsToGoal = slope > 0 ? Math.ceil((target - last[1]) / slope) : null;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Savings over time">
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="rgb(var(--line))" strokeDasharray="2 4" />)}
        <polyline fill="none" stroke="var(--fe-1)" strokeWidth="2" points={pts.map((p, i) => `${x(i)},${y(p[1])}`).join(" ")} />
        {pts.map((p, i) => <circle key={p[0]} cx={x(i)} cy={y(p[1])} r="3" fill="var(--fe-1)"><title>{`${p[0]}: £${Math.round(p[1]).toLocaleString("en-GB")}`}</title></circle>)}
        {proj.length > 0 && <polyline fill="none" stroke="var(--fe-2)" strokeWidth="2" strokeDasharray="4 4" points={[[pts.length - 1, last[1]] as [number, number], ...proj.map((v, i) => [pts.length + i, v] as [number, number])].map(([i, v]) => `${x(i)},${y(v)}`).join(" ")} />}
        {pts.map((p, i) => <text key={p[0]} x={x(i)} y={H - 5} fontSize="9" textAnchor="middle" fill="rgb(var(--faint))">{label(p[0])}</text>)}
      </svg>
      <div className="px-1 text-[11px] text-faint">{pts.length < 2 ? "Savings over time. The line builds as each month is recorded." : monthsToGoal !== null && monthsToGoal > 0 ? `At this pace, £${Math.round(target / 1000)}k in about ${monthsToGoal} months (projection).` : "Flat or falling this period."}</div>
    </div>
  );
}
