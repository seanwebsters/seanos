"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import type { HQItem, JournalEntry, LifeHQ, WeekPriority, WorkProject } from "@/lib/db/types";
import { api, Sheet, useToast } from "./client";
import { Icon } from "./Icon";
import { Art } from "./ui";

/* ------------------------------- Photos ------------------------------- */

/** A photo you can replace with your own; artwork until you do. */
export function PhotoSlot({ target, src, seed, className = "", children, fallback }: { target: string; src: string | null | undefined; seed: string; className?: string; children?: ReactNode; fallback?: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const inner = (
    <>
      {children}
      <button type="button" aria-label="Change photo" onClick={(e) => { e.preventDefault(); e.stopPropagation(); input.current?.click(); }}
        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/35 text-white opacity-0 backdrop-blur transition group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-70">
        {busy ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Icon name="upload" size={13} />}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setBusy(true);
        const fd = new FormData();
        fd.set("file", f); fd.set("target", target);
        const res = await fetch("/api/life/image", { method: "POST", body: fd });
        setBusy(false);
        if (!res.ok) toast({ text: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Upload failed" });
        else router.refresh();
      }} />
    </>
  );
  return src ? (
    <div className={`group relative overflow-hidden bg-raised ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      {inner}
    </div>
  ) : fallback ? <div className={`group relative overflow-hidden ${className}`}>{fallback}{inner}</div> : <Art seed={seed} className={`group ${className}`}>{inner}</Art>;
}

/* ------------------------------ Checklists ------------------------------ */

export function HQList({ section, items, placeholder, values = false, max = 6 }: { section: HQItem["section"]; items: HQItem[]; placeholder: string; values?: boolean; max?: number }) {
  const [text, setText] = useState("");
  const [val, setVal] = useState("");
  const [all, setAll] = useState(false);
  const router = useRouter();
  const shown = all ? items : items.slice(0, max);
  return (
    <div className="flex min-w-0 flex-col">
      <ul className="space-y-1.5">
        {shown.map((i) => (
          <li key={i.id} className="group flex items-center gap-2.5 text-[13px]">
            <button aria-label={i.done ? "Mark not done" : "Mark done"} onClick={async () => { await api(`/api/entity/hq_items/${i.id}`, { done: !i.done }, "PATCH"); router.refresh(); }}
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] ring-1 ${i.done ? "bg-ink text-bg ring-ink" : "ring-line"}`}>{i.done && <Icon name="check" size={11} />}</button>
            <span className={`min-w-0 flex-1 truncate ${i.done ? "text-faint line-through" : ""}`}>{i.title}{i.date ? <span className="text-faint"> · {i.date.slice(5).split("-").reverse().join("/")}</span> : null}</span>
            {values && i.value && <span className="shrink-0 tabular-nums text-muted">{i.value}</span>}
            <button aria-label="Remove" onClick={async () => { await api(`/api/entity/hq_items/${i.id}`, undefined, "DELETE"); router.refresh(); }} className="shrink-0 text-faint opacity-0 transition group-hover:opacity-100 [@media(hover:none)]:hidden"><Icon name="close" size={13} /></button>
          </li>
        ))}
      </ul>
      {items.length > max && <button onClick={() => setAll(!all)} className="mt-1 self-start text-[12px] text-muted">{all ? "Show less" : `+${items.length - max} more`}</button>}
      <form className="mt-2 flex items-center gap-1.5" onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        await api("/api/entity/hq_items", { section, title: text, value: val });
        setText(""); setVal("");
        router.refresh();
      }}>
        <Icon name="plus" size={13} className="shrink-0 text-faint" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
        {values && <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="value" className="w-16 bg-transparent text-right text-[13px] outline-none placeholder:text-faint" />}
      </form>
    </div>
  );
}

/* ------------------------------ Priorities ------------------------------ */

const TAG: Record<string, string> = { Work: "bg-sky/15 text-sky", Personal: "bg-accent/15 text-accent", Business: "bg-sage/15 text-sage" };
export function Priorities({ week, items }: { week: string; items: WeekPriority[] }) {
  const router = useRouter();
  return (
    <ol className="space-y-2">
      {[1, 2, 3].map((rank) => {
        const p = items.find((x) => x.rank === rank);
        return <PriorityRow key={rank} rank={rank} p={p} week={week} onDone={() => router.refresh()} />;
      })}
    </ol>
  );
}
function PriorityRow({ rank, p, week, onDone }: { rank: number; p?: WeekPriority; week: string; onDone: () => void }) {
  const [text, setText] = useState("");
  const [tag, setTag] = useState<WeekPriority["tag"]>("Work");
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-raised/60 px-3 py-2.5">
      <button disabled={!p} onClick={async () => { if (p) { await api(`/api/entity/week_priorities/${p.id}`, { done: !p.done }, "PATCH"); onDone(); } }}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${p?.done ? "bg-sage text-white" : "bg-accent/20 text-accent"}`}>{p?.done ? <Icon name="check" size={13} /> : rank}</button>
      {p ? (
        <>
          <span className={`min-w-0 flex-1 text-[13.5px] ${p.done ? "text-faint line-through" : ""}`}>{p.title}</span>
          <button onClick={async () => { await api(`/api/entity/week_priorities/${p.id}`, { tag: p.tag === "Work" ? "Business" : p.tag === "Business" ? "Personal" : "Work" }, "PATCH"); onDone(); }} className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${TAG[p.tag]}`}>{p.tag}</button>
          <button aria-label="Clear" onClick={async () => { await api(`/api/entity/week_priorities/${p.id}`, undefined, "DELETE"); onDone(); }} className="shrink-0 text-faint"><Icon name="close" size={13} /></button>
        </>
      ) : (
        <form className="flex min-w-0 flex-1 items-center gap-2" onSubmit={async (e) => { e.preventDefault(); if (!text.trim()) return; await api("/api/entity/week_priorities", { week, rank, title: text, tag }); setText(""); onDone(); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={rank === 1 ? "The one thing that matters most this week" : "Add a priority"} className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-faint" />
          <select value={tag} onChange={(e) => setTag(e.target.value as WeekPriority["tag"])} className="rounded-full bg-surface px-2 py-0.5 text-[11px]"><option>Work</option><option>Business</option><option>Personal</option></select>
        </form>
      )}
    </li>
  );
}

/* ------------------------------ Area rating ------------------------------ */

export function AreaRate({ me, area }: { me: LifeHQ; area: string }) {
  const [open, setOpen] = useState(false);
  const cur = me.areas[area] ?? { statement: "", progress: null };
  const [stmt, setStmt] = useState(cur.statement);
  const [val, setVal] = useState(cur.progress ?? 50);
  const router = useRouter();
  return (
    <>
      <button onClick={() => setOpen(true)} className="absolute inset-0 z-[1] rounded-card" aria-label={`Edit ${area}`} />
      {open && (
        <Sheet title={`${area[0].toUpperCase()}${area.slice(1)}`} onClose={() => setOpen(false)}>
          <form className="space-y-4 p-5" onSubmit={async (e) => {
            e.preventDefault();
            await api("/api/entity/life_hq/me", { areas: { ...me.areas, [area]: { statement: stmt, progress: ["career", "business", "money"].includes(area) ? cur.progress : val } } }, "PATCH");
            setOpen(false); router.refresh();
          }}>
            <label className="block text-[13px] text-muted">Where I want this to be<input value={stmt} onChange={(e) => setStmt(e.target.value)} className="field mt-1" /></label>
            {["career", "business", "money"].includes(area) ? (
              <p className="text-[13px] text-muted">This bar is worked out from your real numbers ({area === "career" ? "salary against target" : area === "business" ? "revenue recorded in Founder OS" : "savings in Money"}). Change them with "Edit my numbers".</p>
            ) : (
              <label className="block text-[13px] text-muted">How far along it feels, honestly: <b className="text-ink">{val}%</b>
                <input type="range" min={0} max={100} step={5} value={val} onChange={(e) => setVal(Number(e.target.value))} className="mt-2 w-full accent-[rgb(var(--accent))]" />
              </label>
            )}
            <button className="btn-primary w-full">Save</button>
          </form>
        </Sheet>
      )}
    </>
  );
}

export function EditNumbers({ me }: { me: LifeHQ }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ vision: me.vision, quote: me.quote, salary: me.salary, salary_target: me.salary_target, savings: me.savings, savings_target: me.savings_target, revenue_target: me.revenue_target });
  const router = useRouter();
  const num = (k: keyof typeof v, label: string) => <label key={k} className="block text-[12.5px] text-muted">{label}<input inputMode="numeric" value={String(v[k])} onChange={(e) => setV({ ...v, [k]: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })} className="field mt-1 py-2 tabular-nums" /></label>;
  return (
    <>
      <button onClick={() => setOpen(true)} className="chip"><Icon name="edit" size={13} /> Edit my numbers</button>
      {open && (
        <Sheet title="My numbers" onClose={() => setOpen(false)}>
          <form className="space-y-3 p-5" onSubmit={async (e) => { e.preventDefault(); await api("/api/entity/life_hq/me", v, "PATCH"); setOpen(false); router.refresh(); }}>
            <label className="block text-[12.5px] text-muted">Vision<input value={v.vision} onChange={(e) => setV({ ...v, vision: e.target.value })} className="field mt-1 py-2" /></label>
            <label className="block text-[12.5px] text-muted">Quote<input value={v.quote} onChange={(e) => setV({ ...v, quote: e.target.value })} className="field mt-1 py-2" /></label>
            <div className="grid grid-cols-2 gap-3">
              {num("salary", "Salary (£)")}{num("salary_target", "Salary target (£)")}
              {num("savings", "Savings (£), if no accounts added")}{num("savings_target", "Savings target (£)")}
              {num("revenue_target", "Business revenue target (£/year)")}
            </div>
            <button className="btn-primary w-full">Save</button>
          </form>
        </Sheet>
      )}
    </>
  );
}

/* ------------------------------- Projects ------------------------------- */

const STATUSES: WorkProject["status"][] = ["Not set", "Planning", "Development", "Testing", "Active", "Blocked", "Complete"];
export const STATUS_STYLE: Record<string, string> = { "Not set": "bg-raised text-muted", Planning: "bg-accent/15 text-accent", Development: "bg-[#eda100]/15 text-[#b07a00]", Testing: "bg-[#8a6bbf]/15 text-[#7a5bb0]", Active: "bg-sage/15 text-sage", Blocked: "bg-rose/15 text-rose", Complete: "bg-ink text-bg" };
export function ProjectControls({ p }: { p: WorkProject }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ status: p.status, progress: p.progress ?? 0, next_action: p.next_action, notes: p.notes });
  const router = useRouter();
  return (
    <>
      <button onClick={() => setOpen(true)} className="absolute inset-0 z-[1]" aria-label={`Edit ${p.name}`} />
      {open && (
        <Sheet title={p.name} onClose={() => setOpen(false)}>
          <form className="space-y-3 p-5" onSubmit={async (e) => { e.preventDefault(); await api(`/api/entity/work_projects/${p.id}`, v, "PATCH"); setOpen(false); router.refresh(); }}>
            <div className="flex flex-wrap gap-1.5">{STATUSES.map((s) => <button type="button" key={s} onClick={() => setV({ ...v, status: s })} className={`rounded-full px-3 py-1 text-[12.5px] font-medium ${v.status === s ? "bg-ink text-bg" : "bg-raised text-muted"}`}>{s}</button>)}</div>
            <label className="block text-[13px] text-muted">Progress: <b className="text-ink">{v.progress}%</b><input type="range" min={0} max={100} step={5} value={v.progress} onChange={(e) => setV({ ...v, progress: Number(e.target.value) })} className="mt-2 w-full" /></label>
            <label className="block text-[13px] text-muted">Next action<input value={v.next_action} onChange={(e) => setV({ ...v, next_action: e.target.value })} className="field mt-1 py-2" /></label>
            <label className="block text-[13px] text-muted">Notes<textarea rows={4} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className="field mt-1" /></label>
            <p className="text-[11.5px] text-faint">Calm work. It stays separate from your own ventures in Founder OS.</p>
            <button className="btn-primary w-full">Save</button>
          </form>
        </Sheet>
      )}
    </>
  );
}

/* -------------------------------- Journal -------------------------------- */

export function JournalToday({ today, entry, prompts }: { today: string; entry: JournalEntry | null; prompts: string[] }) {
  const [open, setOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>(entry?.answers ?? {});
  const router = useRouter();
  return (
    <>
      <ul className="space-y-1.5">
        {prompts.map((q) => (
          <li key={q}><button onClick={() => setOpen(true)} className="flex w-full items-center gap-2.5 text-left text-[13px]">
            <span className={`h-3.5 w-3.5 shrink-0 rounded-full ring-1 ${entry?.answers[q]?.trim() ? "bg-sage ring-sage" : "ring-line"}`} />{q}
          </button></li>
        ))}
      </ul>
      <button onClick={() => setOpen(true)} className="chip mt-3">{entry ? "Continue today's entry" : "Write today's entry"}</button>
      {open && (
        <Sheet title="Journal" onClose={() => setOpen(false)}>
          <form className="space-y-3 p-5" onSubmit={async (e) => {
            e.preventDefault();
            if (entry) await api(`/api/entity/journal/${entry.id}`, { answers }, "PATCH");
            else await api("/api/entity/journal", { date: today, answers });
            setOpen(false); router.refresh();
          }}>
            {prompts.map((q) => <label key={q} className="block text-[13px] font-medium">{q}<textarea rows={2} value={answers[q] ?? ""} onChange={(e) => setAnswers({ ...answers, [q]: e.target.value })} className="field mt-1 font-serif text-[15px]" /></label>)}
            <p className="text-[11.5px] text-faint">Private. Agents don't read your journal.</p>
            <button className="btn-primary w-full">Save</button>
          </form>
        </Sheet>
      )}
    </>
  );
}

/* ----------------------------- Quick capture ----------------------------- */

type Kind = "task" | "idea" | "journal" | "expense" | "person" | "goal" | "event" | "project" | "win";
const CAPTURE: { kind: Kind; label: string }[] = [
  { kind: "task", label: "New Task" }, { kind: "idea", label: "New Idea" }, { kind: "journal", label: "New Journal Entry" }, { kind: "expense", label: "New Expense" },
  { kind: "person", label: "New Person" }, { kind: "goal", label: "New Goal" }, { kind: "event", label: "New Event" }, { kind: "project", label: "New Project" },
];
export function QuickCapture({ today }: { today: string }) {
  const [kind, setKind] = useState<Kind | null>(null);
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CAPTURE.map((c) => <button key={c.kind} onClick={() => setKind(c.kind)} className="flex items-center gap-1.5 rounded-xl bg-raised/70 px-3 py-2.5 text-left text-[12.5px] font-medium ring-1 ring-line/60 active:scale-[0.98]"><Icon name="plus" size={13} className="text-faint" />{c.label}</button>)}
      </div>
      {kind && <CaptureSheet kind={kind} today={today} onClose={() => setKind(null)} />}
    </>
  );
}
export function AddWin({ today }: { today: string }) {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)} className="chip"><Icon name="plus" size={13} /> Add a win</button>{open && <CaptureSheet kind="win" today={today} onClose={() => setOpen(false)} />}</>;
}

function CaptureSheet({ kind, today, onClose }: { kind: Kind; today: string; onClose: () => void }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [c, setC] = useState(kind === "event" || kind === "task" || kind === "win" || kind === "expense" ? today : "");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const spec: Record<Kind, { title: string; a: string; b?: string; c?: string; cType?: string; go: () => Promise<unknown> }> = {
    task: { title: "New task", a: "What needs doing?", c: "Due", cType: "date", go: () => api("/api/entity/hq_items", { section: "tasks", title: a, date: c || null }) },
    idea: { title: "New idea", a: "The idea in a line", b: "Notes", go: () => api("/api/entity/ideas", { title: a, one_liner: a, notes: b }) },
    journal: { title: "Journal", a: "What's on your mind?", go: () => api("/api/entity/journal", { date: today, answers: { "What's on my mind?": a } }) },
    expense: { title: "New expense", a: "What was it?", b: "Amount (£)", c: "Date", cType: "date", go: () => api("/api/entity/transactions", { description: a, amount: Number(b), direction: "out", date: c }) },
    person: { title: "New person", a: "Name", b: "Company or how you know them", go: () => api("/api/entity/people", { name: a, company: b, category: "Met" }) },
    goal: { title: "New goal", a: "The goal", b: "Target (optional, e.g. 12 trips)", go: () => api("/api/entity/hq_items", { section: "vision", title: a, value: b }) },
    event: { title: "New event", a: "What is it?", b: "Where (optional)", c: "When", cType: "datetime-local", go: () => api("/api/entity/events", { title: a, location: b, start: c ? new Date(c.length === 10 ? `${c}T09:00` : c).toISOString() : new Date().toISOString() }) },
    project: { title: "New Calm project", a: "Project name", b: "Notes", go: () => api("/api/entity/work_projects", { name: a, notes: b }) },
    win: { title: "Add a win", a: "What went well?", b: "Area (Career, Business, Money, Health…)", c: "Date", cType: "date", go: () => api("/api/entity/wins", { title: a, area: b || "Life", date: c }) },
  };
  const s = spec[kind];
  return (
    <Sheet title={s.title} onClose={onClose}>
      <form className="space-y-3 p-5" onSubmit={async (e) => {
        e.preventDefault();
        if (!a.trim() || (kind === "expense" && !(Number(b) > 0))) return;
        setBusy(true);
        try { await s.go(); toast({ text: "Saved" }); onClose(); router.refresh(); }
        catch (x) { toast({ text: (x as Error).message }); setBusy(false); }
      }}>
        {kind === "journal" ? <textarea autoFocus rows={6} value={a} onChange={(e) => setA(e.target.value)} placeholder={s.a} className="field font-serif text-[15px]" /> : <input autoFocus value={a} onChange={(e) => setA(e.target.value)} placeholder={s.a} className="field" />}
        {s.b && <input value={b} onChange={(e) => setB(e.target.value)} placeholder={s.b} inputMode={kind === "expense" ? "decimal" : undefined} className="field" />}
        {s.c && <label className="block text-[12.5px] text-muted">{s.c}<input type={s.cType} value={c} onChange={(e) => setC(e.target.value)} className="field mt-1" /></label>}
        {kind === "project" && <p className="text-[11.5px] text-faint">For Calm work. Your own businesses go in Founder OS.</p>}
        <button disabled={busy} className="btn-primary w-full">{busy ? "Saving…" : "Save"}</button>
      </form>
    </Sheet>
  );
}
