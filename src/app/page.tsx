import Link from "next/link";
import { homeData } from "@/lib/services/home";
import { AGENT_BY_KEY, isAgentKey } from "@/lib/ai/agents";
import { fmtDate, fmtTime, relTime } from "@/lib/time";
import { Icon } from "@/components/Icon";
import { AgentBadge, Art, Empty, Img, List, Pill, Rail, Row, Section, agentName } from "@/components/ui";
import { CopyButton, Delegate, LiveRefresh, Patch } from "@/components/client";
import { describeSchedule } from "@/lib/engine/schedule";

export const dynamic = "force-dynamic";

const GREETING = { morning: "Good morning", day: "Good afternoon", evening: "Good evening" } as const;

export default async function Home() {
  const d = await homeData();
  const { part } = d;
  const first = d.profile.name.split(" ")[0];
  const lead = d.stories[0];
  const cards = {
    briefing: <Briefing key="briefing" d={d} />,
    edition: d.edition ? <EditionCard key="edition" d={d} /> : null,
    opportunities: <Opportunities key="opps" d={d} />,
    approvals: d.approvals.length ? <Approvals key="approvals" d={d} /> : null,
    people: d.people.length ? <People key="people" d={d} /> : null,
    outfit: <Outfit key="outfit" d={d} />,
    calendar: <Calendar key="calendar" d={d} />,
    london: d.experiences.length ? <London key="london" d={d} /> : null,
    completed: d.completedRecent.length ? <Completed key="completed" d={d} /> : null,
    active: d.active.length ? <Active key="active" d={d} /> : null,
    activity: <Activity key="activity" d={d} />,
    reading: d.saved.length || d.edition?.big_idea ? <Reading key="reading" d={d} /> : null,
    tomorrow: <Tomorrow key="tomorrow" d={d} />,
    reminders: d.reminders.length ? <Reminders key="reminders" d={d} /> : null,
  };
  const order: (keyof typeof cards)[] =
    part === "morning" ? ["briefing", "edition", "completed", "opportunities", "approvals", "people", "outfit", "calendar", "reminders", "london", "active", "activity"]
    : part === "day" ? ["calendar", "active", "opportunities", "approvals", "briefing", "people", "edition", "completed", "london", "reminders", "activity"]
    : ["completed", "reading", "tomorrow", "approvals", "opportunities", "london", "people", "edition", "reminders", "activity"];

  return (
    <div>
      <LiveRefresh active={d.active.some((t) => t.status === "running" || t.status === "queued")} every={6000} />
      <header className="relative">
        <Img src={part === "morning" ? lead?.image_url : null} seed={`${d.today}-${part}`} alt="" className="h-[300px] w-full lg:mt-8 lg:rounded-[28px]">
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-bg" />
          <div className="pt-safe absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-4 text-white lg:px-8">
            <div className="text-[13px] font-medium opacity-90">{fmtDate(d.today, { weekday: "long", day: "numeric", month: "long" })}</div>
            <div className="flex items-center gap-2">
              {d.weather && <span className="rounded-full bg-black/25 px-3 py-1 text-[13px] backdrop-blur">{d.weather.temp_c}° {d.weather.summary}</span>}
              <Link href="/notifications" aria-label="Notifications" className="flex h-9 w-9 items-center justify-center rounded-full bg-black/25 backdrop-blur"><Icon name="bell" size={18} /></Link>
            </div>
          </div>
        </Img>
        <div className="relative -mt-32 px-5 lg:px-8">
          <h1 className="display text-[46px] leading-[0.98] lg:text-[64px]">{GREETING[part]}, {first}.</h1>
          <p className="mt-3 max-w-xl text-[16px] leading-relaxed text-ink/80">
            {part === "morning" ? "Here's what your team has prepared for you." : part === "day" ? "Here's where things stand, and what's next." : "Here's what got done today, and tomorrow's setup."}
          </p>
          <TeamStrip d={d} />
        </div>
      </header>
      <Setup d={d} />
      {order.map((k) => cards[k])}
      <div className="h-6" />
    </div>
  );
}

type D = Awaited<ReturnType<typeof homeData>>;

function TeamStrip({ d }: { d: D }) {
  const items = [
    d.completedRecent.length ? `${d.completedRecent.length} done ${d.part === "evening" ? "today" : "overnight"}` : null,
    d.active.filter((t) => t.status === "running").length ? `${d.active.filter((t) => t.status === "running").length} in progress` : null,
    d.approvals.length ? `${d.approvals.length} for your review` : null,
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {items.map((t) => <span key={t} className="rounded-full bg-raised px-3 py-1.5 text-[12.5px] font-medium">{t}</span>)}
    </div>
  );
}

function Setup({ d }: { d: D }) {
  if (!d.connected) {
    return (
      <div className="mx-5 mt-7 overflow-hidden rounded-card bg-surface ring-1 ring-line lg:mx-8">
        <Art seed="setup" className="h-24" />
        <div className="p-5">
          <div className="eyebrow text-accent">Connect your team</div>
          <div className="display mt-1 text-[26px] leading-tight">Your agents are ready, but not yet switched on.</div>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">SEAN OS doesn't fake work. Add an Anthropic API key to the server as <code className="rounded bg-raised px-1">ANTHROPIC_API_KEY</code> and the newsroom, studio and research teams can start. Everything else on this screen fills in from their real output.</p>
          <Link href="/settings" className="btn-primary mt-4">Open setup <Icon name="arrow" size={16} /></Link>
        </div>
      </div>
    );
  }
  if (!d.settings.autopilot) {
    return (
      <div className="mx-5 mt-7 rounded-card bg-surface p-5 ring-1 ring-line lg:mx-8">
        <div className="eyebrow text-accent">Autopilot is off</div>
        <div className="display mt-1 text-[24px] leading-tight">Let your team work while you sleep.</div>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">Turning on Autopilot runs the morning edition, briefings and weekly scans on schedule. Estimated around ${(d.settings.daily_budget_cents / 100).toFixed(0)}/day at most, capped by your budget. You can run anything once now instead.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Patch table="settings" id="app" patch={{ autopilot: true }} className="btn-primary" toastText="Autopilot on">Turn on Autopilot</Patch>
          <Delegate label="Run this morning now" kind="morning" className="btn-ghost" icon="play" />
        </div>
      </div>
    );
  }
  return null;
}

function Briefing({ d }: { d: D }) {
  const b = d.briefing;
  return (
    <Section title="Today's priorities">
      {b ? (
        <div className="mx-5 lg:mx-0">
          <p className="mb-4 font-serif text-[18px] leading-relaxed text-ink/85">{b.summary}</p>
          <ol className="space-y-2.5">
            {b.priorities.map((p, i) => {
              const inner = (
                <div className="card flex gap-4 p-4">
                  <div className="display text-[34px] leading-none text-accent">{i + 1}</div>
                  <div className="min-w-0">
                    <div className="text-[16px] font-semibold leading-snug">{p.title}</div>
                    <div className="mt-1 text-[13.5px] leading-relaxed text-muted">{p.why}</div>
                  </div>
                </div>
              );
              return <li key={i}>{p.href?.startsWith("/") ? <Link href={p.href} className="block active:scale-[0.99]">{inner}</Link> : inner}</li>;
            })}
          </ol>
          {b.plan.length > 0 && (
            <div className="mt-4 rounded-card bg-raised/60 p-4">
              <div className="eyebrow mb-2">Plan</div>
              {b.plan.map((p, i) => <div key={i} className="flex gap-3 py-1 text-[14px]"><span className="w-12 tabular-nums text-muted">{p.time}</span>{p.title}</div>)}
            </div>
          )}
        </div>
      ) : (
        <Empty icon="target" title="No briefing yet today" body="Your Chief of Staff prepares this every morning from your calendar, tasks, people and opportunities.">
          <Delegate label="Prepare it now" kind="briefing" className="btn-ghost" icon="play" />
        </Empty>
      )}
    </Section>
  );
}

function EditionCard({ d }: { d: D }) {
  const ed = d.edition!;
  const lead = d.stories[0];
  return (
    <Section title="The Sean Edition" href="/edition">
      <Link href="/edition" className="mx-5 block overflow-hidden rounded-card bg-surface ring-1 ring-line active:scale-[0.99] lg:mx-0">
        <Img src={lead?.image_url} seed={ed.id} alt="" className="aspect-[4/3] w-full lg:aspect-[16/7]">
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">{fmtDate(ed.date, { weekday: "long", day: "numeric", month: "long" })} · {d.stories.length} stories</div>
            <div className="display mt-2 text-[32px] leading-[1.02]">{ed.title}</div>
            <div className="mt-2 line-clamp-2 text-[14px] opacity-85">{ed.standfirst}</div>
          </div>
        </Img>
        <div className="divide-y divide-line">
          {d.stories.slice(1, 4).map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="eyebrow text-[10px]">{s.section}</div>
                <div className="mt-0.5 line-clamp-2 font-serif text-[16px] leading-snug">{s.headline}</div>
              </div>
              <Img src={s.image_url} seed={s.id} alt="" className="h-14 w-14 shrink-0 rounded-xl" />
            </div>
          ))}
        </div>
      </Link>
    </Section>
  );
}

function Opportunities({ d }: { d: D }) {
  const o = d.opp;
  const cards = [
    o.trend && { href: `/trends/${o.trend.id}`, kicker: "Trend", title: o.trend.title, body: o.trend.what, img: o.trend.image_url, seed: o.trend.id },
    o.idea && { href: `/ideas/${o.idea.id}`, kicker: "Business idea", title: o.idea.title, body: o.idea.one_liner, img: o.idea.images[0] ?? null, seed: o.idea.id },
    o.person && { href: `/people/${o.person.id}`, kicker: "Founder", title: o.person.name, body: `${o.person.role}, ${o.person.company}`, img: o.person.photo_url, seed: o.person.id },
    o.speaking && { href: `/speaking/${o.speaking.id}`, kicker: o.speaking.kind === "podcast" ? "Podcast" : "Speaking", title: o.speaking.name, body: `${o.speaking.location}${o.speaking.deadline ? ` · apply by ${fmtDate(o.speaking.deadline)}` : ""}`, img: o.speaking.image_url, seed: o.speaking.id },
    o.partnership && { href: `/calmlings/${o.partnership.id}`, kicker: "Calmlings partnership", title: o.partnership.brand, body: o.partnership.concept.title || o.partnership.opportunity, img: o.partnership.images[0] ?? null, seed: o.partnership.id },
  ].filter(Boolean) as { href: string; kicker: string; title: string; body: string; img: string | null; seed: string }[];
  if (!cards.length && !o.action && !d.opportunities.length) {
    return (
      <Section title="Opportunities" href="/opportunities">
        <Empty icon="target" title="Nothing worth your time yet" body="Trend Radar, Venture Studio and Speaking Scout surface only genuinely worthwhile finds. Run a scan to start.">
          <Delegate label="Scan trends" kind="trend_scan" />
          <Delegate label="Find speaking slots" kind="speaking_scan" />
        </Empty>
      </Section>
    );
  }
  return (
    <Section title="Opportunities" href="/opportunities">
      {o.action && (
        <div className="mx-5 mb-3 flex items-start gap-3 rounded-card bg-accent/12 p-4 lg:mx-0">
          <Icon name="bolt" size={18} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="eyebrow text-accent">Do this today</div>
            <div className="mt-1 text-[15px] leading-snug">{o.action}</div>
          </div>
        </div>
      )}
      <Rail>
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="w-[78%] shrink-0 snap-start overflow-hidden rounded-card bg-surface ring-1 ring-line active:scale-[0.99] sm:w-[300px]">
            <Img src={c.img} seed={c.seed} alt="" className="aspect-[16/10] w-full" />
            <div className="p-4">
              <div className="eyebrow">{c.kicker}</div>
              <div className="display mt-1 line-clamp-2 text-[22px] leading-tight">{c.title}</div>
              <div className="mt-1 line-clamp-2 text-[13.5px] text-muted">{c.body}</div>
            </div>
          </Link>
        ))}
        {d.opportunities.map((op) => (
          <Link key={op.id} href={`/opportunities/${op.id}`} className="flex w-[78%] shrink-0 snap-start flex-col justify-between rounded-card bg-ink p-5 text-bg active:scale-[0.99] sm:w-[300px]">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-60">Connected opportunity · {op.score}/10</div>
              <div className="display mt-2 text-[24px] leading-tight">{op.title}</div>
              <div className="mt-2 line-clamp-3 text-[13.5px] opacity-75">{op.thesis}</div>
            </div>
            <div className="mt-4 text-[12px] opacity-60">{op.items.length} linked · {op.actions.length} actions</div>
          </Link>
        ))}
      </Rail>
    </Section>
  );
}

function Approvals({ d }: { d: D }) {
  return (
    <Section title="Waiting for you" href="/approvals">
      <List>
        {d.approvals.slice(0, 4).map((a) => (
          <Row key={a.id} href={`/approvals#${a.id}`} left={<AgentBadge agent={a.agent} />} title={a.title} sub={a.summary} right={<Pill status="pending" label={a.type === "draft" ? "Draft" : "Outreach"} />} />
        ))}
      </List>
    </Section>
  );
}

function People({ d }: { d: D }) {
  return (
    <Section title="Three people to reach out to" href="/people">
      <Rail>
        {d.people.map((p) => (
          <div key={p.id} className="flex w-[84%] shrink-0 snap-start flex-col rounded-card bg-surface p-4 ring-1 ring-line sm:w-[320px]">
            <Link href={`/people/${p.id}`} className="flex items-center gap-3">
              <Img src={p.photo_url} seed={p.name} alt={p.name} className="h-14 w-14 shrink-0 rounded-full" />
              <div className="min-w-0">
                <div className="truncate text-[16px] font-semibold">{p.name}</div>
                <div className="truncate text-[13px] text-muted">{p.role} · {p.company}</div>
              </div>
            </Link>
            <p className="mt-3 line-clamp-3 text-[13.5px] leading-relaxed text-ink/80">{p.why_get_along}</p>
            <div className="mt-3 rounded-2xl bg-raised p-3 font-serif text-[14.5px] italic leading-snug">"{p.message}"</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopyButton text={p.message} />
              <Patch table="people" id={p.id} patch={{ status: "contacted", last_contact_at: new Date().toISOString() }} toastText="Marked as contacted"><Icon name="check" size={14} /> Contacted</Patch>
            </div>
          </div>
        ))}
      </Rail>
    </Section>
  );
}

function Outfit({ d }: { d: D }) {
  const o = d.outfit;
  const items = o ? d.wardrobe.filter((w) => o.item_ids.includes(w.id)) : [];
  return (
    <Section title="What to wear" href="/wardrobe">
      {o ? (
        <Link href="/wardrobe" className="mx-5 block rounded-card bg-surface p-4 ring-1 ring-line lg:mx-0">
          {items.length > 0 && (
            <div className="mb-4 grid grid-cols-3 gap-2">
              {items.slice(0, 3).map((w) => <Img key={w.id} src={w.image} seed={w.id} alt={w.name} className="aspect-[3/4] rounded-2xl" />)}
            </div>
          )}
          <div className="eyebrow">{o.weather ? `${o.weather.temp_c}° · ${o.weather.summary}` : o.occasion}</div>
          <div className="display mt-1 text-[24px] leading-tight">{o.title}</div>
          <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{o.rationale}</p>
          {o.missing.length > 0 && <div className="mt-2 text-[12.5px] text-faint">Would complete it: {o.missing.join(", ")}</div>}
        </Link>
      ) : (
        <Empty icon="shirt" title="No outfit yet" body="Your stylist works from the weather, your calendar and what you own. Add a few pieces to your wardrobe for better suggestions.">
          <Delegate label="Style me today" kind="outfit" />
          <Link href="/wardrobe" className="chip"><Icon name="upload" size={14} /> Add clothes</Link>
        </Empty>
      )}
    </Section>
  );
}

function Calendar({ d }: { d: D }) {
  return (
    <Section title={d.part === "day" ? "Up next" : "Today"} href="/life?tab=calendar">
      {d.todayEvents.length ? (
        <List>
          {d.todayEvents.map((e) => (
            <Row key={e.id} href={e.prep_report_id ? `/reports/${e.prep_report_id}` : undefined} left={<div className="w-12 text-[13px] font-semibold tabular-nums text-accent">{e.all_day ? "All day" : fmtTime(e.start)}</div>} title={e.title} sub={e.location || undefined}
              right={e.prep_report_id ? <Pill status="completed" label="Prep ready" /> : <Delegate label="Prep" kind="meeting_prep" params={{ event_id: e.id }} context={{ type: "event", id: e.id, title: e.title }} className="chip" />} />
          ))}
        </List>
      ) : (
        <Empty icon="calendar" title={d.settings.calendar_ics_url ? "Nothing in the diary" : "Calendar not connected"} body={d.settings.calendar_ics_url ? "A clear day. Good for deep work." : "Paste your calendar's private iCal link in Settings to see meetings and get preparation notes."}>
          {!d.settings.calendar_ics_url && <Link href="/settings#calendar" className="chip">Connect calendar</Link>}
        </Empty>
      )}
    </Section>
  );
}

function London({ d }: { d: D }) {
  return (
    <Section title={d.part === "evening" ? "London tonight" : "London"} href="/life?tab=london">
      <Rail>
        {d.experiences.map((e) => (
          <Link key={e.id} href={`/life/experience/${e.id}`} className="w-[62%] shrink-0 snap-start sm:w-[240px]">
            <Img src={e.image_url} seed={e.id} alt="" className="aspect-[4/5] rounded-card">
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] opacity-80">{e.kind} · {e.area}</div>
                <div className="display mt-1 text-[21px] leading-tight">{e.title}</div>
                <div className="mt-1 text-[12px] opacity-75">{e.dates}</div>
              </div>
            </Img>
          </Link>
        ))}
      </Rail>
    </Section>
  );
}

function Completed({ d }: { d: D }) {
  return (
    <Section title={d.part === "evening" ? "Done today" : "Completed overnight"} href="/tasks?tab=completed">
      <List>
        {d.completedRecent.slice(0, 5).map((t) => (
          <Row key={t.id} href={`/tasks/${t.id}`} left={<AgentBadge agent={t.agent} />} title={t.title} sub={t.summary ?? undefined} right={t.status === "awaiting_approval" ? <Pill status="awaiting_approval" label="Review" /> : <Icon name="check" size={18} className="text-sage" />} />
        ))}
      </List>
    </Section>
  );
}

function Active({ d }: { d: D }) {
  return (
    <Section title="In progress" href="/tasks">
      <List>
        {d.active.slice(0, 5).map((t) => (
          <Row key={t.id} href={`/tasks/${t.id}`} left={<AgentBadge agent={t.agent} />} title={t.title} sub={t.status === "blocked" ? t.error : `${agentName(t.agent)} · ${Math.round(t.progress * 100)}%`} right={<Pill status={t.status} />} />
        ))}
      </List>
    </Section>
  );
}

function Activity({ d }: { d: D }) {
  return (
    <Section title="Agent activity" href="/agents">
      {d.logs.length ? (
        <div className="mx-5 space-y-3 lg:mx-0">
          {d.logs.slice(0, 6).map((l) => (
            <Link key={l.id} href={`/tasks/${l.task_id}`} className="flex items-start gap-3">
              <AgentBadge agent={l.agent ?? "chief_of_staff"} size={26} />
              <div className="min-w-0 flex-1 text-[13.5px] leading-snug">
                <span className="font-medium">{l.agent && isAgentKey(l.agent) ? AGENT_BY_KEY[l.agent].name : "System"}</span> <span className="text-muted">{l.message}</span>
              </div>
              <span className="shrink-0 text-[11.5px] text-faint">{relTime(l.at)}</span>
            </Link>
          ))}
        </div>
      ) : (
        <Empty icon="agents" title="Quiet so far" body="Every entry here is real work from a real task. Delegate something to see your team in action." />
      )}
    </Section>
  );
}

function Reading({ d }: { d: D }) {
  return (
    <Section title="Evening reading">
      {d.edition?.big_idea && (
        <Link href="/edition#big-idea" className="mx-5 block rounded-card bg-surface p-5 ring-1 ring-line lg:mx-0">
          <div className="eyebrow text-accent">The Big Idea</div>
          <p className="mt-2 line-clamp-5 font-serif text-[17px] leading-relaxed">{d.edition.big_idea}</p>
        </Link>
      )}
      {d.saved.length > 0 && (
        <List className="mt-3">
          {d.saved.map((s) => <Row key={s.id} href={`/edition/story/${s.id}`} title={s.headline} sub={s.section} left={<Img src={s.image_url} seed={s.id} alt="" className="h-11 w-11 shrink-0 rounded-xl" />} />)}
        </List>
      )}
    </Section>
  );
}

function Tomorrow({ d }: { d: D }) {
  return (
    <Section title="Tomorrow">
      {d.tomorrowEvents.length ? (
        <List>
          {d.tomorrowEvents.map((e) => (
            <Row key={e.id} left={<div className="w-12 text-[13px] font-semibold tabular-nums text-accent">{e.all_day ? "All day" : fmtTime(e.start)}</div>} title={e.title} sub={e.location || undefined}
              right={e.prep_report_id ? <Link href={`/reports/${e.prep_report_id}`} className="chip">Prep</Link> : <Delegate label="Prepare me" kind="meeting_prep" params={{ event_id: e.id }} context={{ type: "event", id: e.id, title: e.title }} />} />
          ))}
        </List>
      ) : (
        <Empty icon="calendar" title="Nothing scheduled tomorrow" body={d.settings.autopilot ? `Your morning run is set: ${describeSchedule({ cadence: "daily", weekday: null, hour: 5, minute: 30 }).toLowerCase()}.` : "Turn on Autopilot to wake up to a fresh edition and briefing."} />
      )}
    </Section>
  );
}

function Reminders({ d }: { d: D }) {
  return (
    <Section title="Reminders">
      <List>
        {d.reminders.slice(0, 6).map((r) => <Row key={r} title={r} left={<Icon name="clock" size={18} className="text-accent" />} />)}
      </List>
    </Section>
  );
}

