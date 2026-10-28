"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CalendarEvent, PaProposal } from "@/lib/db/types";
import { api, Sheet, useToast } from "./client";
import { Icon } from "./Icon";

const TZ = "Europe/London";
const parts = (iso: string) => {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  return { h: Number(f.find((x) => x.type === "hour")!.value), m: Number(f.find((x) => x.type === "minute")!.value) };
};
const hhmm = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const localInput = (iso: string, date: string) => `${date}T${hhmm(iso)}`;

const TONE: Record<string, string> = {
  ics: "bg-[#8a6bbf]/12 border-[#8a6bbf]",
  assistant: "bg-accent/15 border-accent",
  manual: "bg-sky/12 border-sky",
};

/** A day as a timeline. Events are positioned from their real times; suggestions waiting for approval are dashed. */
export function DayTimeline({ date, events, proposals = [], from = 6, to = 23, compact = false, editable = false }: { date: string; events: CalendarEvent[]; proposals?: PaProposal[]; from?: number; to?: number; compact?: boolean; editable?: boolean }) {
  const [open, setOpen] = useState<CalendarEvent | null>(null);
  const hour = compact ? 46 : 60;
  const allDay = events.filter((e) => e.all_day);
  const timed = events.filter((e) => !e.all_day);
  const y = (iso: string) => { const p = parts(iso); return ((p.h + p.m / 60) - from) * hour; };
  // Side-by-side columns for overlapping events.
  const cols: { e: CalendarEvent; col: number; of: number }[] = [];
  const sorted = [...timed].sort((a, b) => a.start.localeCompare(b.start));
  for (const e of sorted) {
    const s = new Date(e.start).getTime(), en = e.end ? new Date(e.end).getTime() : s + 3600000;
    const overlapping = cols.filter((c) => { const cs = new Date(c.e.start).getTime(), ce = c.e.end ? new Date(c.e.end).getTime() : cs + 3600000; return cs < en && ce > s; });
    const used = new Set(overlapping.map((c) => c.col));
    let col = 0; while (used.has(col)) col++;
    cols.push({ e, col, of: 1 });
    for (const c of [...overlapping, cols.at(-1)!]) c.of = Math.max(c.of, overlapping.length + 1);
  }
  return (
    <div>
      {allDay.length > 0 && <div className="mb-2 space-y-1">{allDay.map((e) => <button key={e.id} onClick={() => setOpen(e)} className={`block w-full truncate rounded-lg border-l-[3px] px-2.5 py-1 text-left text-[12.5px] ${TONE[e.source === "ics" ? "ics" : e.created_by === "assistant" ? "assistant" : "manual"]}`}>{e.title} · all day</button>)}</div>}
      <div className="relative" style={{ height: (to - from) * hour }}>
        {Array.from({ length: to - from }, (_, i) => (
          <div key={i} className="absolute inset-x-0 flex" style={{ top: i * hour }}>
            <span className="w-11 shrink-0 -translate-y-2 text-[11px] tabular-nums text-faint">{String(from + i).padStart(2, "0")}:00</span>
            <span className="mt-0 h-px flex-1 bg-line/70" />
          </div>
        ))}
        <div className="absolute inset-y-0 left-12 right-0">
          {cols.map(({ e, col, of }) => {
            const top = Math.max(0, y(e.start)), end = e.end ? y(e.end) : top + hour;
            const h = Math.max(compact ? 26 : 30, Math.min((to - from) * hour, end) - top - 2);
            return (
              <button key={e.id} onClick={() => setOpen(e)} className={`absolute overflow-hidden rounded-lg border-l-[3px] px-2.5 py-1 text-left ${TONE[e.source === "ics" ? "ics" : e.created_by === "assistant" ? "assistant" : "manual"]}`} style={{ top, height: h, left: `${(col / of) * 100}%`, width: `calc(${100 / of}% - 3px)` }}>
                <div className="truncate text-[12.5px] font-medium leading-tight">{e.title}</div>
                {h > 34 && <div className="truncate text-[11px] text-muted">{hhmm(e.start)}{e.end ? `–${hhmm(e.end)}` : ""}{e.location ? ` · ${e.location}` : ""}</div>}
              </button>
            );
          })}
          {proposals.filter((p) => p.status === "pending" && p.start && p.end && p.kind !== "delete_event").map((p) => (
            <Link key={p.id} href="/" className="absolute inset-x-0 rounded-lg border border-dashed border-accent bg-accent/5 px-2.5 py-1 text-[12px] text-accent" style={{ top: y(p.start!), height: Math.max(26, y(p.end!) - y(p.start!) - 2) }}>
              Suggested: {p.title}
            </Link>
          ))}
        </div>
      </div>
      {open && <EventSheet e={open} date={date} editable={editable} onClose={() => setOpen(null)} />}
    </div>
  );
}

function EventSheet({ e, date, editable, onClose }: { e: CalendarEvent; date: string; editable: boolean; onClose: () => void }) {
  const [title, setTitle] = useState(e.title);
  const [start, setStart] = useState(e.all_day ? "" : localInput(e.start, date));
  const [end, setEnd] = useState(e.end && !e.all_day ? localInput(e.end, date) : "");
  const [location, setLocation] = useState(e.location);
  const router = useRouter();
  const toast = useToast();
  const readOnly = e.source === "ics" || !editable;
  return (
    <Sheet title={readOnly ? e.title : "Edit event"} onClose={onClose}>
      <div className="space-y-3 p-5">
        {readOnly ? (
          <>
            <div className="text-[15px]">{e.all_day ? "All day" : `${hhmm(e.start)}${e.end ? `–${hhmm(e.end)}` : ""}`}{e.location ? ` · ${e.location}` : ""}</div>
            {e.description && <p className="whitespace-pre-line text-[13.5px] text-muted">{e.description}</p>}
            {e.source === "ics" && <p className="text-[12.5px] text-faint">From your connected calendar. Life HQ can read it but not change it; edit it in your calendar app.</p>}
          </>
        ) : (
          <form className="space-y-3" onSubmit={async (x) => {
            x.preventDefault();
            try {
              await api(`/api/entity/events/${e.id}`, { title, location, start: new Date(start).toISOString(), end: end ? new Date(end).toISOString() : null }, "PATCH");
              onClose(); router.refresh();
            } catch (err) { toast({ text: (err as Error).message }); }
          }}>
            <input value={title} onChange={(x) => setTitle(x.target.value)} className="field" />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[12px] text-muted">Starts<input type="datetime-local" value={start} onChange={(x) => setStart(x.target.value)} className="field mt-1 py-2" /></label>
              <label className="text-[12px] text-muted">Ends<input type="datetime-local" value={end} onChange={(x) => setEnd(x.target.value)} className="field mt-1 py-2" /></label>
            </div>
            <input value={location} onChange={(x) => setLocation(x.target.value)} placeholder="Where (optional)" className="field" />
            {e.created_by === "assistant" && <p className="text-[12px] text-faint">Added by Life HQ after you approved it.</p>}
            <div className="flex gap-2">
              <button className="btn-primary flex-1">Save</button>
              <a href={`/api/pa/ics/${e.id}`} className="btn-ghost">Add to calendar app</a>
              <button type="button" onClick={async () => { if (!window.confirm(`Delete "${e.title}"?`)) return; await api(`/api/entity/events/${e.id}`, undefined, "DELETE"); onClose(); router.refresh(); }} className="btn-ghost text-rose">Delete</button>
            </div>
          </form>
        )}
      </div>
    </Sheet>
  );
}

export function AddEvent({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState(`${date}T09:00`);
  const [end, setEnd] = useState(`${date}T10:00`);
  const [location, setLocation] = useState("");
  const [allDay, setAllDay] = useState(false);
  const router = useRouter();
  return (
    <>
      <button onClick={() => setOpen(true)} className="chip"><Icon name="plus" size={14} /> Add to diary</button>
      {open && (
        <Sheet title="New event" onClose={() => setOpen(false)}>
          <form className="space-y-3 p-5" onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            await api("/api/entity/events", allDay ? { title, location, all_day: true, start: start.slice(0, 10) } : { title, location, start: new Date(start).toISOString(), end: new Date(end).toISOString() });
            setOpen(false); setTitle(""); router.refresh();
          }}>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is it?" className="field" />
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day</label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[12px] text-muted">Starts<input type={allDay ? "date" : "datetime-local"} value={allDay ? start.slice(0, 10) : start} onChange={(e) => setStart(allDay ? `${e.target.value}T09:00` : e.target.value)} className="field mt-1 py-2" /></label>
              {!allDay && <label className="text-[12px] text-muted">Ends<input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="field mt-1 py-2" /></label>}
            </div>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where (optional)" className="field" />
            <button className="btn-primary w-full">Add</button>
          </form>
        </Sheet>
      )}
    </>
  );
}

export function CalendarConnect({ url, syncedAt }: { url: string | null; syncedAt: string | null }) {
  const [v, setV] = useState(url ?? "");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  return (
    <details className="rounded-2xl p-4 ring-1 ring-line">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[14px]">
        <span className={`h-2 w-2 rounded-full ${url ? "bg-sage" : "bg-faint"}`} />
        {url ? `Calendar connected (read-only)${syncedAt ? ` · synced ${hhmm(syncedAt)}` : ""}` : "Connect your calendar"}
        <Icon name="chevron" size={15} className="ml-auto text-faint" />
      </summary>
      <p className="mt-2 text-[12.5px] text-muted">Paste your calendar&apos;s private iCal address. In Google Calendar it&apos;s Settings → your calendar → &quot;Secret address in iCal format&quot;; in iCloud, share the calendar publicly and copy the link. Life HQ reads it to find free time. It can&apos;t change it, so things you approve are added to your Life HQ diary, and you can export each one to your calendar app.</p>
      <form className="mt-3 flex gap-2" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("/api/entity/settings/app", { calendar_ics_url: v.trim() || null }, "PATCH");
          if (v.trim()) { const j = await api<{ events: number }>("/api/calendar"); toast({ text: `Synced ${j.events} events` }); }
          router.refresh();
        } catch (x) { toast({ text: (x as Error).message }); }
        finally { setBusy(false); }
      }}>
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder="https://calendar.google.com/…/basic.ics" className="field py-2 text-[13px]" />
        <button disabled={busy} className="btn-primary py-2">{busy ? "Syncing…" : url ? "Save & sync" : "Connect"}</button>
      </form>
    </details>
  );
}
