"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Routine } from "@/lib/db/types";
import { api, useToast } from "./client";
import { Icon } from "./Icon";

export interface LifeItem { id: string; group: string; title: string; detail: string; kind: "memory" | "record"; href: string | null; table?: string }

export function LifeSearch({ items, groups, initialQuery = "" }: { items: LifeItem[]; groups: string[]; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const [group, setGroup] = useState<string | null>(null);
  const [adding, setAdding] = useState("");
  const [cat, setCat] = useState("Other");
  const router = useRouter();
  const toast = useToast();
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter((i) => (!group || i.group === group) && words.every((w) => `${i.group} ${i.title} ${i.detail}`.toLowerCase().includes(w)));
  }, [items, q, group]);
  const byGroup = groups.map((g) => ({ g, list: shown.filter((i) => i.group === g) })).filter((x) => x.list.length);
  return (
    <div>
      <div className="flex items-center gap-2 rounded-[22px] bg-surface px-4 py-3 ring-1 ring-line">
        <Icon name="search" size={18} className="text-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything Life HQ knows about you" className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint" />
        {q && <button onClick={() => setQ("")} aria-label="Clear" className="text-faint"><Icon name="close" size={16} /></button>}
      </div>
      <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
        <button onClick={() => setGroup(null)} className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] ${!group ? "bg-ink text-bg" : "bg-raised text-muted"}`}>All</button>
        {groups.filter((g) => items.some((i) => i.group === g)).map((g) => <button key={g} onClick={() => setGroup(group === g ? null : g)} className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] ${group === g ? "bg-ink text-bg" : "bg-raised text-muted"}`}>{g}</button>)}
      </div>

      <form className="mt-4 flex items-center gap-2 rounded-2xl px-3 py-2 ring-1 ring-dashed ring-line" onSubmit={async (e) => {
        e.preventDefault();
        if (!adding.trim()) return;
        await api("/api/entity/memories", { content: adding.trim(), category: cat, kind: "fact", scope: cat === "Career" ? "work" : "personal" });
        setAdding(""); toast({ text: "Saved to Life" }); router.refresh();
      }}>
        <Icon name="plus" size={15} className="text-faint" />
        <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add something to remember (or just tell Life HQ in Ask)" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-full bg-raised px-2 py-1 text-[12px]">{["Goals", "Projects", "Career", "Business", "Money", "Health", "Relationships", "Preferences", "Routines", "Home", "Travel", "Other"].map((c) => <option key={c}>{c}</option>)}</select>
      </form>

      <div className="mt-6 space-y-7">
        {byGroup.length === 0 && <p className="text-[14px] text-muted">Nothing matches “{q}”.</p>}
        {byGroup.map(({ g, list }) => (
          <section key={g}>
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">{g}</div>
            <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface ring-1 ring-line/70">
              {list.map((i) => <Row key={`${i.kind}-${i.id}`} i={i} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Row({ i }: { i: LifeItem }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(i.title);
  const router = useRouter();
  if (i.kind === "record") {
    const inner = (
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1"><div className="text-[14.5px]">{i.title}</div>{i.detail && <div className="truncate text-[12.5px] text-muted">{i.detail}</div>}</div>
        {i.href && <Icon name="chevron" size={15} className="shrink-0 text-faint" />}
      </div>
    );
    return i.href ? <Link href={i.href} className="block hover:bg-raised/40">{inner}</Link> : inner;
  }
  return edit ? (
    <form className="space-y-2 px-4 py-3" onSubmit={async (e) => { e.preventDefault(); await api(`/api/entity/memories/${i.id}`, { content: v }, "PATCH"); setEdit(false); router.refresh(); }}>
      <textarea rows={2} value={v} onChange={(e) => setV(e.target.value)} className="field text-[14px]" />
      <div className="flex gap-2">
        <button className="chip">Save</button>
        <button type="button" onClick={() => { setEdit(false); setV(i.title); }} className="chip">Cancel</button>
        <button type="button" onClick={async () => { if (!window.confirm("Forget this?")) return; await api(`/api/entity/memories/${i.id}`, undefined, "DELETE"); router.refresh(); }} className="chip ml-auto text-rose">Forget</button>
      </div>
    </form>
  ) : (
    <button onClick={() => setEdit(true)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-raised/40">
      <div className="min-w-0 flex-1"><div className="text-[14.5px] leading-snug">{i.title}</div>{i.detail && <div className="text-[12px] text-faint">{i.detail}</div>}</div>
      <Icon name="edit" size={14} className="mt-1 shrink-0 text-faint" />
    </button>
  );
}

export function RoutineEditor({ routine }: { routine: Routine }) {
  const [r, setR] = useState(routine);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const t = (k: keyof Routine, label: string) => <label key={k} className="text-[12px] text-muted">{label}<input type="time" value={r[k] as string} onChange={(e) => setR({ ...r, [k]: e.target.value })} className="field mt-1 py-2" /></label>;
  return (
    <form onSubmit={async (e) => { e.preventDefault(); await api("/api/entity/life_hq/me", { routine: r }, "PATCH"); setSaved(true); setTimeout(() => setSaved(false), 1500); router.refresh(); }}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{t("wake", "Wake")}{t("sleep", "Sleep")}{t("work_start", "Work starts")}{t("work_end", "Work ends")}{t("lunch", "Lunch")}{t("dinner", "Dinner")}</div>
      <div className="mt-3 flex flex-wrap gap-1.5">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => <button type="button" key={d} onClick={() => setR({ ...r, work_days: r.work_days.includes(i) ? r.work_days.filter((x) => x !== i) : [...r.work_days, i].sort() })} className={`rounded-full px-3 py-1 text-[12.5px] ${r.work_days.includes(i) ? "bg-ink text-bg" : "bg-raised text-muted"}`}>{d}</button>)}</div>
      <button className="btn-primary mt-3 py-2">{saved ? "Saved" : "Save routine"}</button>
      <p className="mt-2 text-[12px] text-faint">Life HQ uses this to avoid sleep, meals and work hours when it finds time.</p>
    </form>
  );
}

export function AssistantSwitches({ briefing, evening, notifications }: { briefing: { id: string; enabled: boolean } | null; evening: { id: string; enabled: boolean } | null; notifications: boolean }) {
  const router = useRouter();
  const toggle = async (url: string, body: unknown) => { await api(url, body, "PATCH"); router.refresh(); };
  const Sw = ({ on, label, sub, onClick }: { on: boolean; label: string; sub: string; onClick: () => void }) => (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left">
      <div className="min-w-0 flex-1"><div className="text-[14.5px]">{label}</div><div className="text-[12.5px] text-muted">{sub}</div></div>
      <span className={`flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition ${on ? "bg-sage" : "bg-line"}`}><span className={`h-5 w-5 rounded-full bg-white shadow transition ${on ? "translate-x-4" : ""}`} /></span>
    </button>
  );
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface ring-1 ring-line/70">
      {briefing && <Sw on={briefing.enabled} label="Morning briefing" sub="A short note at 7:10 on what matters today. About 4p of API use each." onClick={() => toggle(`/api/entity/automations/${briefing.id}`, { enabled: !briefing.enabled })} />}
      {evening && <Sw on={evening.enabled} label="Plan tomorrow" sub="Each evening at 20:25, tomorrow's shape with time suggestions to approve." onClick={() => toggle(`/api/entity/automations/${evening.id}`, { enabled: !evening.enabled })} />}
      <Sw on={notifications} label="Notifications" sub="Send briefings to your phone. Off means they only appear in Ask." onClick={() => toggle("/api/entity/settings/app", { pa_notifications: !notifications })} />
    </div>
  );
}
