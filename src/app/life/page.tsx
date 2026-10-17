import Link from "next/link";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/bootstrap";
import { addDays, fmtDate, fmtTime, londonDate, londonTimeToUtc } from "@/lib/time";
import { Empty, Img, List, PageHeader, Row, Section, Stat, Tabs } from "@/components/ui";
import { ActionButton, AskButton, CreateForm, Delegate, LiveRefresh, Patch } from "@/components/client";
import { Icon } from "@/components/Icon";
import { gbp, summarise } from "@/lib/finance";

export const dynamic = "force-dynamic";

export default async function Life({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "london" } = await searchParams;
  const db = getDb();
  const settings = await getSettings();
  const running = (await db.list("tasks", { where: { kind: ["london", "freeform", "meeting_prep"], status: ["queued", "running"] } })).length > 0;
  return (
    <div>
      <LiveRefresh active={running} />
      <PageHeader title="Life" eyebrow="Personal concierge" subtitle="Make the most of your time in London and beyond." actions={<AskButton label="Concierge" suggestions={["Find interesting events in London this weekend", "Book-worthy restaurants for a celebration dinner in Soho", "Plan a long weekend in Copenhagen in November", "Build me a 4-day gym routine for strength", "Recommend 5 books on creativity and technology"]} />} />
      <Tabs base="/life" active={tab} tabs={[{ key: "london", label: "London" }, { key: "calendar", label: "Calendar" }, { key: "fitness", label: "Fitness" }, { key: "money", label: "Money" }, { key: "travel", label: "Travel" }, { key: "growth", label: "Growth" }]} />
      {tab === "london" && <London />}
      {tab === "calendar" && <Calendar icsUrl={settings.calendar_ics_url} />}
      {tab === "fitness" && <Fitness />}
      {tab === "money" && <Money />}
      {tab === "travel" && <Travel />}
      {tab === "growth" && <Growth />}
    </div>
  );
}

async function London() {
  const db = getDb();
  const items = await db.list("experiences", { orderBy: { column: "discovered_at", ascending: false } });
  const saved = items.filter((e) => e.status === "saved" || e.status === "planned");
  const fresh = items.filter((e) => e.status === "new");
  return (
    <>
      <div className="mx-5 mt-3 flex flex-wrap gap-2 lg:mx-0">
        <Delegate label="What's on this week" kind="london" className="btn-primary" icon="sparkle" />
        <Delegate label="This weekend" kind="london" instruction="Find interesting events in London this weekend: exhibitions, talks, openings, food, music." className="btn-ghost" />
        <Delegate label="New restaurants" kind="london" instruction="Find the most interesting new restaurant and bar openings in London right now, especially in and near Soho." className="btn-ghost" />
      </div>
      {fresh.length ? (
        <div className="mx-5 mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:mx-0">
          {fresh.map((e) => (
            <Link key={e.id} href={`/life/experience/${e.id}`}>
              <Img src={e.image_url} seed={e.id} alt="" className="aspect-[4/5] rounded-[20px]">
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-80">{e.kind} · {e.area}</div>
                  <div className="display mt-0.5 line-clamp-3 text-[18px] leading-tight">{e.title}</div>
                </div>
              </Img>
            </Link>
          ))}
        </div>
      ) : <div className="mt-4"><Empty icon="map" title="Nothing new yet" body="Your concierge finds specific, current things with real links and dates. Taste over volume." /></div>}
      {saved.length > 0 && <Section title="Saved & planned"><List>{saved.map((e) => <Row key={e.id} href={`/life/experience/${e.id}`} title={e.title} sub={`${e.venue} · ${e.dates}`} />)}</List></Section>}
    </>
  );
}

async function Calendar({ icsUrl }: { icsUrl: string | null }) {
  const db = getDb();
  const today = londonDate();
  const from = londonTimeToUtc(today, 0, 0).toISOString();
  const events = (await db.list("events", { orderBy: { column: "start", ascending: true } })).filter((e) => (e.all_day ? e.start >= today : e.start >= from));
  const days = Array.from({ length: 10 }, (_, i) => addDays(today, i));
  return (
    <>
      <div className="mx-5 mt-3 flex flex-wrap gap-2 lg:mx-0">
        {icsUrl ? <ActionButton url="/api/calendar" className="btn-ghost" toastText="Calendar synced"><Icon name="refresh" size={16} /> Sync calendar</ActionButton> : <Link href="/settings#calendar" className="btn-primary">Connect calendar</Link>}
      </div>
      <div className="mx-5 mt-4 space-y-4 lg:mx-0">
        {days.map((d) => {
          const list = events.filter((e) => (e.all_day ? e.start === d : londonDate(new Date(e.start)) === d));
          if (!list.length && d !== today) return null;
          return (
            <div key={d}>
              <div className="eyebrow mb-2">{d === today ? "Today" : fmtDate(d, { weekday: "long", day: "numeric", month: "short" })}</div>
              {list.length ? (
                <div className="space-y-2">
                  {list.map((e) => (
                    <div key={e.id} className="card flex items-center gap-3 p-3.5">
                      <div className="w-12 text-[13px] font-semibold tabular-nums text-accent">{e.all_day ? "All day" : fmtTime(e.start)}</div>
                      <div className="min-w-0 flex-1"><div className="truncate text-[14.5px] font-medium">{e.title}</div>{e.location && <div className="truncate text-[12px] text-muted">{e.location}</div>}</div>
                      {e.prep_report_id ? <Link href={`/reports/${e.prep_report_id}`} className="chip">Prep</Link> : <Delegate label="Prepare me" kind="meeting_prep" params={{ event_id: e.id }} context={{ type: "event", id: e.id, title: e.title }} />}
                    </div>
                  ))}
                </div>
              ) : <div className="text-[13px] text-faint">Nothing scheduled</div>}
            </div>
          );
        })}
      </div>
      <Section title="Add an event">
        <div className="mx-5 lg:mx-0"><CreateForm table="events" submit="Add to calendar" fields={[{ name: "title", label: "What" }, { name: "start", label: "Start", type: "datetime-local" }, { name: "location", label: "Where" }, { name: "description", label: "Notes, attendees, agenda", type: "textarea" }]} /></div>
      </Section>
    </>
  );
}

async function Fitness() {
  const db = getDb();
  const workouts = await db.list("life", { where: { kind: "workout" }, orderBy: { column: "date", ascending: false } });
  const weekAgo = addDays(londonDate(), -7);
  const thisWeek = workouts.filter((w) => w.date > weekAgo);
  return (
    <>
      <div className="mx-5 mt-3 grid grid-cols-2 gap-2.5 lg:mx-0"><Stat label="This week" value={thisWeek.length} sub="sessions" /><Stat label="Minutes" value={thisWeek.reduce((s, w) => s + (w.amount ?? 0), 0)} sub="last 7 days" /></div>
      <div className="mx-5 mt-3 flex flex-wrap gap-2 lg:mx-0">
        <Delegate label="Plan my training week" instruction="Build Sean a training plan for this week based on his logged workouts and goals. Use general fitness guidance, not medical advice." />
      </div>
      <Section title="Log a workout"><div className="mx-5 lg:mx-0"><CreateForm table="life" extra={{ kind: "workout" }} submit="Log" fields={[{ name: "title", label: "What did you do?" }, { name: "amount", label: "Minutes", type: "number" }, { name: "notes", label: "Notes" }]} /></div></Section>
      {workouts.length > 0 && <Section title="History"><List>{workouts.slice(0, 20).map((w) => <Row key={w.id} title={w.title} sub={`${fmtDate(w.date)}${w.amount ? ` · ${w.amount} min` : ""}${w.notes ? ` · ${w.notes}` : ""}`} />)}</List></Section>}
    </>
  );
}

async function Money() {
  const db = getDb();
  const today = londonDate();
  const [txns, budgets, recurring, accounts, goals] = await Promise.all([db.list("transactions"), db.list("budgets"), db.list("recurring"), db.list("accounts"), db.list("finance_goals")]);
  const s = summarise({ today, txns, budgets, recurring, accounts, goals });
  return (
    <>
      <div className="mx-5 mt-3 grid grid-cols-2 gap-2.5 lg:mx-0"><Stat label="Spent this month" value={gbp(s.spendThisMonth)} sub={s.totalBudget ? `${gbp(s.budgetLeft)} of budgets left` : "No budget set"} /><Stat label="Net worth" value={gbp(s.netWorth)} sub={`${s.upcoming.length} bills in 14 days`} /></div>
      <Link href="/finance" className="mx-5 mt-3 flex items-center justify-between rounded-card bg-ink p-5 text-bg lg:mx-0">
        <div><div className="display text-[24px]">Open Finance</div><div className="text-[13px] opacity-70">Budgets, transactions, bills, goals and your planner</div></div>
        <Icon name="arrow" size={20} />
      </Link>
    </>
  );
}

async function Travel() {
  const db = getDb();
  const trips = await db.list("life", { where: { kind: "trip" }, orderBy: { column: "date", ascending: true } });
  const plans = (await db.list("reports", { orderBy: { column: "created_at", ascending: false } })).filter((r) => r.tags.includes("travel") || /itinerar|trip|travel/i.test(r.title)).slice(0, 6);
  return (
    <>
      <div className="mx-5 mt-3 flex flex-wrap gap-2 lg:mx-0">
        <AskButton label="Plan a trip" className="btn-primary" suggestions={["Plan a long weekend in Copenhagen: design, food and great hotels", "Where should I go for a creative recharge in winter?", "Plan 4 days in Tokyo around design, animation and food"]} />
      </div>
      {plans.length > 0 && <Section title="Itineraries"><List>{plans.map((r) => <Row key={r.id} href={`/reports/${r.id}`} title={r.title} sub={r.summary} />)}</List></Section>}
      <Section title="Trips">
        {trips.length > 0 && <List className="mb-3">{trips.map((t) => <Row key={t.id} title={t.title} sub={`${fmtDate(t.date, { day: "numeric", month: "short", year: "numeric" })}${t.notes ? ` · ${t.notes}` : ""}`} right={<Delegate label="Plan it" instruction={`Plan Sean's trip: ${t.title} on ${t.date}. ${t.notes}. Hotels, restaurants, things to do, with real links.`} />} />)}</List>}
        <div className="mx-5 lg:mx-0"><CreateForm table="life" extra={{ kind: "trip" }} submit="Add trip" fields={[{ name: "title", label: "Where" }, { name: "date", label: "When", type: "date" }, { name: "notes", label: "Who with, what for" }]} /></div>
      </Section>
    </>
  );
}

async function Growth() {
  const db = getDb();
  const goals = await db.list("life", { where: { kind: "learning_goal" } });
  const reading = await db.list("life", { where: { kind: "reading" } });
  return (
    <>
      <div className="mx-5 mt-3 flex flex-wrap gap-2 lg:mx-0">
        <Delegate label="Reading recommendations" instruction="Recommend 5 books and 5 long-form essays for Sean based on his interests and goals, with why each matters. Real titles only." />
        <Delegate label="Weekly review" kind="weekly_review" />
      </div>
      <Section title="Learning goals">
        {goals.length > 0 && <div className="mx-5 mb-3 space-y-2 lg:mx-0">{goals.map((g) => (
          <div key={g.id} className="card flex items-center gap-3 p-4">
            <Patch table="life" id={g.id} patch={{ done: !g.done }} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${g.done ? "bg-sage text-[#141413]" : "ring-1 ring-line"}`}>{g.done ? <Icon name="check" size={14} /> : null}</Patch>
            <div className="min-w-0 flex-1"><div className={`text-[14.5px] font-medium ${g.done ? "text-muted line-through" : ""}`}>{g.title}</div>{g.notes && <div className="text-[12.5px] text-muted">{g.notes}</div>}</div>
            {!g.done && <Delegate label="Plan" instruction={`Create a practical learning plan for: ${g.title}. ${g.notes}`} />}
          </div>
        ))}</div>}
        <div className="mx-5 lg:mx-0"><CreateForm table="life" extra={{ kind: "learning_goal" }} submit="Add goal" fields={[{ name: "title", label: "What do you want to learn?" }, { name: "notes", label: "Why / by when" }]} /></div>
      </Section>
      <Section title="Reading list">
        {reading.length > 0 && <List className="mb-3">{reading.map((r) => <Row key={r.id} title={r.title} sub={r.notes} right={<Patch table="life" id={r.id} patch={{ done: !r.done }} className="chip">{r.done ? "Read ✓" : "Mark read"}</Patch>} />)}</List>}
        <div className="mx-5 lg:mx-0"><CreateForm table="life" extra={{ kind: "reading" }} submit="Add" fields={[{ name: "title", label: "Title" }, { name: "notes", label: "Author / why" }]} /></div>
      </Section>
    </>
  );
}
