import Link from "next/link";
import { getDb } from "@/lib/db";
import { getProfile } from "@/lib/bootstrap";
import { env } from "@/lib/env";
import { getWeather } from "@/lib/integrations/weather";
import { THREAD, todayAtAGlance } from "@/lib/pa/assistant";
import { addDays, fmtDate, fmtTime, londonDate, londonParts } from "@/lib/time";
import { Icon } from "@/components/Icon";
import { Assistant } from "@/components/pa";
import { DayTimeline } from "@/components/diary";

export const dynamic = "force-dynamic";

const GREETING = { morning: "Good morning", day: "Good afternoon", evening: "Good evening" } as const;

export default async function Ask({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const sp = await searchParams;
  const db = getDb();
  const now = new Date();
  const today = londonDate();
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : today;
  const [g, profile] = await Promise.all([todayAtAGlance(now), getProfile()]);
  const weather = await getWeather(profile.home_lat, profile.home_lng);
  const hour = londonParts(now).hour;
  const part = hour >= 4 && hour < 12 ? "morning" : hour < 18 ? "day" : "evening";
  const msgs = (await db.list("copilot_messages", { where: { thread: THREAD } })).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-60);
  const ids = new Set(msgs.map((m) => m.id));
  const proposals = (await db.list("pa_proposals")).filter((p) => ids.has(p.message_id)).sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));
  const dayEvents = (await db.list("events")).filter((e) => (e.all_day ? e.start.slice(0, 10) === day : londonParts(new Date(e.start)).date === day));
  const pendingDay = (await db.list("pa_proposals", { where: { status: "pending" } })).filter((p) => p.start && londonParts(new Date(p.start)).date === day);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  const chips = [
    { icon: "check", title: g.priorities.length ? `${g.priorities.length} priorit${g.priorities.length === 1 ? "y" : "ies"}` : "No priorities set", sub: g.priorities.map((p) => p.title).join(", ") || "Tell me what matters this week", tone: "accent" },
    { icon: "calendar", title: g.meetings ? `${g.meetings} in your diary` : "Diary clear", sub: g.first ? `First at ${fmtTime(g.first.start)}` : "Nothing fixed today", tone: "sky" },
    { icon: "tasks", title: `${g.tasksDue} task${g.tasksDue === 1 ? "" : "s"} due`, sub: g.overdue ? `${g.overdue} overdue` : g.tasksSoon ? `${g.tasksSoon} more in the next 3 days` : "Nothing overdue", tone: g.overdue ? "rose" : "sage" },
    g.clashes.length ? { icon: "bolt", title: `${g.clashes.length} clash${g.clashes.length === 1 ? "" : "es"}`, sub: `${g.clashes[0].titles[0]} and ${g.clashes[0].titles[1]}`, tone: "rose" }
      : g.trip ? { icon: "plane", title: g.trip.title, sub: g.trip.days === 0 ? "Today" : `in ${g.trip.days} day${g.trip.days === 1 ? "" : "s"}`, tone: "sky" } : null,
  ].filter(Boolean) as { icon: string; title: string; sub: string; tone: string }[];

  return (
    <div className="wide lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10 lg:pt-10">
      <div className="min-w-0 px-5 lg:px-0">
        <header className="pt-safe flex items-start justify-between gap-4 pt-5 lg:pt-0">
          <div>
            <div className="mb-3 lg:hidden"><div className="display text-[28px] leading-none">Life HQ</div><div className="text-[12.5px] text-muted">Your personal assistant</div></div>
            <h1 className="display text-[34px] leading-[1.05] lg:text-[46px]">{GREETING[part]}, {profile.name.split(" ")[0]}.</h1>
            <p className="mt-1 text-[17px] text-muted lg:text-[20px]">Here&apos;s what&apos;s on today.</p>
          </div>
          <div className="shrink-0 text-right text-[13px] text-muted">
            <div className="flex items-center justify-end gap-2 text-ink">{fmtDate(today, { weekday: "short", day: "numeric", month: "short" })}<Icon name="sun" size={18} className="text-accent" /></div>
            <div>{weather ? `${weather.temp_c}°C · ` : ""}Soho, London</div>
          </div>
        </header>

        {/* Week strip on phones */}
        <div className="no-scrollbar mt-5 flex gap-1.5 overflow-x-auto lg:hidden">
          {week.map((d) => (
            <Link key={d} href={d === today ? "/" : `/?day=${d}`} scroll={false} className={`flex w-12 shrink-0 flex-col items-center rounded-2xl py-2 ${d === day ? "bg-raised font-semibold" : "text-muted"}`}>
              <span className="text-[10.5px]">{fmtDate(d, { weekday: "short" })}</span><span className="text-[16px] tabular-nums">{Number(d.slice(8))}</span>
            </Link>
          ))}
        </div>

        <div className="no-scrollbar mt-5 flex gap-2.5 overflow-x-auto lg:grid lg:grid-cols-4 lg:overflow-visible">
          {chips.map((c) => (
            <div key={c.title} className="flex w-[64%] shrink-0 items-start gap-3 rounded-2xl bg-surface p-3.5 ring-1 ring-line/70 sm:w-[46%] lg:w-auto">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${c.tone === "accent" ? "bg-accent/15 text-accent" : c.tone === "sky" ? "bg-sky/15 text-sky" : c.tone === "rose" ? "bg-rose/15 text-rose" : "bg-sage/15 text-sage"}`}><Icon name={c.icon} size={16} /></span>
              <div className="min-w-0"><div className="truncate text-[14px] font-semibold">{c.title}</div><div className="line-clamp-2 text-[12px] leading-snug text-muted">{c.sub}</div></div>
            </div>
          ))}
        </div>

        {day !== today && (
          <div className="mt-4 rounded-2xl bg-surface p-3 ring-1 ring-line/70 lg:hidden">
            <div className="mb-2 flex items-center justify-between text-[13px]"><span className="font-medium">{fmtDate(day, { weekday: "long", day: "numeric", month: "short" })}</span><Link href={`/diary?date=${day}`} className="text-accent">Open diary</Link></div>
            <DayTimeline date={day} events={dayEvents} proposals={pendingDay} from={7} to={22} compact />
          </div>
        )}

        <div className="mt-6 lg:mt-8"><Assistant initial={{ messages: msgs, proposals }} connected={Boolean(env.anthropicApiKey)} /></div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-6 rounded-[24px] bg-surface p-4 ring-1 ring-line/70">
          <div className="mb-3 flex items-center justify-between">
            <span className="display text-[24px]">{day === today ? "Today" : fmtDate(day, { weekday: "short", day: "numeric", month: "short" })}</span>
            <span className="flex gap-1">
              <Link aria-label="Previous day" href={`/?day=${addDays(day, -1)}`} scroll={false} className="rounded-full p-1.5 text-muted hover:bg-raised"><Icon name="back" size={16} /></Link>
              <Link aria-label="Next day" href={`/?day=${addDays(day, 1)}`} scroll={false} className="rounded-full p-1.5 text-muted hover:bg-raised"><Icon name="chevron" size={16} /></Link>
            </span>
          </div>
          <div className="no-scrollbar max-h-[calc(100vh-140px)] overflow-y-auto pr-1">
            <DayTimeline date={day} events={dayEvents} proposals={pendingDay} from={6} to={23} compact />
          </div>
          <Link href={`/diary?date=${day}`} className="mt-3 block text-center text-[12.5px] text-accent">Open diary</Link>
        </div>
      </aside>
    </div>
  );
}
