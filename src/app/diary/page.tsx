import Link from "next/link";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/bootstrap";
import { clashes, findSlots } from "@/lib/pa/slots";
import { ensureLifeHQ } from "@/lib/life/core";
import { addDays, fmtDate, fmtTime, londonDate, londonParts } from "@/lib/time";
import { Icon } from "@/components/Icon";
import { AddEvent, CalendarConnect, DayTimeline } from "@/components/diary";

export const dynamic = "force-dynamic";

export default async function Diary({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  const sp = await searchParams;
  const today = londonDate();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const view = sp.view === "week" ? "week" : "day";
  const db = getDb();
  const settings = await getSettings();
  const me = await ensureLifeHQ();
  const all = await db.list("events");
  const onDay = (d: string) => all.filter((e) => (e.all_day ? e.start.slice(0, 10) === d : londonParts(new Date(e.start)).date === d)).sort((a, b) => a.start.localeCompare(b.start));
  const pending = await db.list("pa_proposals", { where: { status: "pending" } });
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(date, -weekday);
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const step = view === "week" ? 7 : 1;
  const events = onDay(date);
  const cl = clashes(events);
  // Free time for the day: the same engine the assistant uses, shown plainly.
  const free = findSlots({ now: date === today ? new Date() : new Date(`${date}T00:00:00Z`), events: all, routine: me.routine, duration: 60, category: "personal", earliest: date, deadline: addDays(date, 1), count: 3 });
  const busyMin = events.filter((e) => !e.all_day).reduce((s, e) => s + ((e.end ? new Date(e.end).getTime() : new Date(e.start).getTime() + 3600000) - new Date(e.start).getTime()) / 60000, 0);

  return (
    <div className="wide px-5 pb-10 lg:px-0 lg:pt-10">
      <header className="pt-safe flex flex-wrap items-center gap-3 pt-5 lg:pt-0">
        <h1 className="display mr-auto text-[36px] leading-none lg:text-[44px]">Diary</h1>
        <div className="flex rounded-full bg-raised p-1 text-[13px]">
          <Link href={`/diary?date=${date}`} className={`rounded-full px-3.5 py-1.5 ${view === "day" ? "bg-surface font-medium shadow-sm" : "text-muted"}`}>Day</Link>
          <Link href={`/diary?date=${date}&view=week`} className={`rounded-full px-3.5 py-1.5 ${view === "week" ? "bg-surface font-medium shadow-sm" : "text-muted"}`}>Week</Link>
        </div>
        <AddEvent date={date} />
      </header>

      <div className="mt-5 flex items-center gap-2">
        <Link aria-label="Previous" href={`/diary?date=${addDays(date, -step)}${view === "week" ? "&view=week" : ""}`} className="rounded-full p-2 text-muted ring-1 ring-line hover:bg-raised"><Icon name="back" size={16} /></Link>
        <Link aria-label="Next" href={`/diary?date=${addDays(date, step)}${view === "week" ? "&view=week" : ""}`} className="rounded-full p-2 text-muted ring-1 ring-line hover:bg-raised"><Icon name="chevron" size={16} /></Link>
        <span className="text-[17px] font-medium">{view === "week" ? `${fmtDate(monday, { day: "numeric", month: "short" })} – ${fmtDate(addDays(monday, 6), { day: "numeric", month: "short" })}` : fmtDate(date, { weekday: "long", day: "numeric", month: "long" })}</span>
        {date !== today && <Link href={`/diary${view === "week" ? "?view=week" : ""}`} className="ml-2 text-[13px] text-accent">Today</Link>}
      </div>

      <div className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto">
        {week.map((d) => (
          <Link key={d} href={`/diary?date=${d}`} className={`flex w-12 shrink-0 flex-col items-center rounded-2xl py-2 lg:w-16 ${d === date && view === "day" ? "bg-ink text-bg" : d === today ? "bg-raised font-semibold" : "text-muted"}`}>
            <span className="text-[10.5px]">{fmtDate(d, { weekday: "short" })}</span><span className="text-[16px] tabular-nums">{Number(d.slice(8))}</span>
            <span className={`mt-1 h-1 w-1 rounded-full ${onDay(d).length ? (d === date && view === "day" ? "bg-bg" : "bg-accent") : "bg-transparent"}`} />
          </Link>
        ))}
      </div>

      {view === "day" ? (
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="rounded-[24px] bg-surface p-4 ring-1 ring-line/70">
            {events.length === 0 && <p className="mb-3 text-[13.5px] text-muted">Nothing in the diary. Add something, or tell Life HQ what you need to get done.</p>}
            <DayTimeline date={date} events={events} proposals={pending.filter((p) => p.start && londonParts(new Date(p.start)).date === date)} editable />
          </div>
          <aside className="space-y-4">
            <div className="rounded-2xl p-4 ring-1 ring-line">
              <div className="text-[13px] font-medium">The shape of the day</div>
              <div className="mt-1 text-[13px] text-muted">{Math.round(busyMin / 60 * 10) / 10}h booked{busyMin > 8 * 60 ? ": a full day, so keep extras light." : "."}</div>
              {cl.length > 0 && <div className="mt-2 rounded-xl bg-rose/10 px-3 py-2 text-[12.5px] text-rose">{cl.map((c) => `${c.titles[0]} overlaps ${c.titles[1]} at ${fmtTime(c.at)}`).join(". ")}</div>}
              <div className="mt-3 text-[13px] font-medium">Free hours</div>
              {free.length ? <ul className="mt-1 space-y-1 text-[13px]">{free.map((f) => <li key={f.start} className="flex justify-between"><span>{fmtTime(f.start)}–{fmtTime(f.end)}</span><span className="text-muted">{f.reason.replace("Good focus time, no conflicts", "No conflicts")}</span></li>)}</ul> : <div className="mt-1 text-[13px] text-muted">No free hour outside sleep, meals and plans.</div>}
              <Link href="/" className="mt-3 inline-flex items-center gap-1 text-[13px] text-accent">Ask Life HQ to fill one <Icon name="arrow" size={13} /></Link>
            </div>
            <CalendarConnect url={settings.calendar_ics_url} syncedAt={settings.calendar_synced_at ?? null} />
          </aside>
        </div>
      ) : (
        <div className="mt-5 divide-y divide-line overflow-hidden rounded-[24px] bg-surface ring-1 ring-line/70">
          {week.map((d) => {
            const evs = onDay(d);
            const sug = pending.filter((p) => p.start && londonParts(new Date(p.start)).date === d);
            return (
              <Link key={d} href={`/diary?date=${d}`} className="flex gap-4 px-4 py-3.5 hover:bg-raised/40">
                <div className={`w-14 shrink-0 ${d === today ? "text-accent" : ""}`}><div className="text-[12px] text-muted">{fmtDate(d, { weekday: "short" })}</div><div className="display text-[24px] leading-none">{d.slice(8)}</div></div>
                <div className="min-w-0 flex-1 space-y-1">
                  {evs.length === 0 && sug.length === 0 && <div className="pt-1 text-[13px] text-faint">Free</div>}
                  {evs.map((e) => <div key={e.id} className="flex gap-2 text-[13.5px]"><span className="w-12 shrink-0 tabular-nums text-muted">{e.all_day ? "all day" : fmtTime(e.start)}</span><span className="truncate">{e.title}</span>{e.source === "ics" && <span className="text-[11px] text-faint">calendar</span>}</div>)}
                  {sug.map((p) => <div key={p.id} className="flex gap-2 text-[13px] text-accent"><span className="w-12 shrink-0 tabular-nums">{fmtTime(p.start!)}</span><span className="truncate">Suggested: {p.title}</span></div>)}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
