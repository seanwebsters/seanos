"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CopilotMessage, PaProposal } from "@/lib/db/types";
import { api, useToast } from "./client";
import { Icon } from "./Icon";

const TZ = "Europe/London";
const day = (iso: string) => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("weekday")} ${g("day")} ${g("month")}`;
};
const weekday = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long" }).format(new Date(iso));
// Built by hand: server and browser ICU disagree on the spaces in "9:00 pm".
const time = (iso: string) => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const h = Number(p.find((x) => x.type === "hour")!.value), m = p.find((x) => x.type === "minute")!.value;
  return `${h % 12 || 12}:${m}${h < 12 ? "am" : "pm"}`;
};
const mins = (p: PaProposal) => (p.start && p.end ? Math.round((new Date(p.end).getTime() - new Date(p.start).getTime()) / 60000) : 0);
const dur = (m: number) => (m % 60 === 0 ? `${m / 60} hour${m === 60 ? "" : "s"}` : m > 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`);

type View = { messages: CopilotMessage[]; proposals: PaProposal[] };

const STARTERS = ["What's important today?", "Organise my Thursday", "What am I forgetting?", "Find me two hours to work on my startup"];
const QUICK: { label: string; text: string; send?: boolean }[] = [
  { label: "Add a task", text: "Add a task: " },
  { label: "Plan my day", text: "Plan my day", send: true },
  { label: "Find time to work", text: "Find me an hour to work on " },
  { label: "Remind me", text: "Remind me to " },
  { label: "Ask a question", text: "" },
];

export function Assistant({ initial, connected }: { initial: View; connected: boolean }) {
  const [view, setView] = useState<View>(initial);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [speech, setSpeech] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const toast = useToast();
  const pending = view.messages.some((m) => m.status === "pending");

  const load = async () => {
    try {
      const v = await api<View>("/api/pa", undefined, "GET");
      setView((prev) => {
        if (prev.messages.some((m) => m.status === "pending") && !v.messages.some((m) => m.status === "pending")) router.refresh();
        return v;
      });
    } catch {}
  };
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(load, 1500);
    return () => clearInterval(t);
  }, [pending]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [view.messages.length, pending]);
  useEffect(() => { setSpeech(typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)); }, []);

  const send = async (t: string) => {
    const msg = t.trim();
    if (!msg || busy) return;
    setBusy("send");
    // Show Sean's words straight away; the reply fills in when it's real.
    setView((v) => ({ ...v, messages: [...v.messages, { id: `local-${Date.now()}`, thread: "pa", role: "sean", text: msg, actions: [], task_id: null, status: "done", created_at: new Date().toISOString() }, { id: `local-r-${Date.now()}`, thread: "pa", role: "cofounder", text: "", actions: [], task_id: null, status: "pending", created_at: new Date().toISOString() }] }));
    setText("");
    try { await api("/api/pa", { text: msg }); await load(); }
    catch (e) { toast({ text: (e as Error).message }); await load(); }
    finally { setBusy(null); }
  };
  const decide = async (p: PaProposal, decision: "approve" | "reject") => {
    setBusy(p.id);
    try { await api(`/api/pa/proposals/${p.id}`, { decision }); await load(); router.refresh(); }
    catch (e) { toast({ text: (e as Error).message }); await load(); }
    finally { setBusy(null); }
  };
  const another = async (messageId: string) => {
    setBusy(`another-${messageId}`);
    try { await api("/api/pa/another", { message_id: messageId }); await load(); }
    catch (e) { toast({ text: (e as Error).message }); }
    finally { setBusy(null); }
  };
  const listen = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const R = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!R) return;
    const r = new R();
    r.lang = "en-GB";
    r.interimResults = false;
    r.onresult = (e) => setText((t) => `${t}${t ? " " : ""}${e.results[0][0].transcript}`);
    r.onend = () => setListening(false);
    setListening(true);
    r.start();
  };

  const last = view.messages.filter((m) => m.role === "cofounder").at(-1);
  return (
    <div className="flex min-h-0 flex-col">
      <div className="space-y-5 pb-4">
        {view.messages.length === 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-[15px] text-muted">Tell me anything: a task, a deadline, something to remember, or a day that needs sorting out. I&apos;ll check your diary and suggest times, and nothing goes in it until you say so.</p>
            <div className="flex flex-wrap gap-2 pt-2">{STARTERS.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full bg-raised px-3.5 py-2 text-[13.5px] text-ink/85 active:scale-[0.98]">{s}</button>)}</div>
          </div>
        )}
        {view.messages.map((m) => {
          if (m.role === "sean") return <div key={m.id} className="ml-auto w-fit max-w-[85%] rounded-[22px] rounded-br-md bg-raised px-5 py-3.5 text-[15.5px] leading-relaxed">{m.text}</div>;
          const props = view.proposals.filter((p) => p.message_id === m.id);
          const open = props.filter((p) => p.status === "pending");
          const firstOpen = open[0];
          const otherDay = open.find((p) => firstOpen && p.start && firstOpen.start && day(p.start) !== day(firstOpen.start));
          const isLast = m.id === last?.id;
          return (
            <div key={m.id} className="flex gap-3.5">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent"><Icon name="sparkle" size={17} /></span>
              <div className="min-w-0 flex-1">
                {m.status === "pending" ? (
                  <div className="flex items-center gap-2 py-2 text-[14.5px] text-muted"><span className="h-1.5 w-1.5 animate-pulse2 rounded-full bg-accent" /> Checking your diary…</div>
                ) : m.status === "failed" ? (
                  <div className="rounded-2xl bg-rose/10 px-4 py-3 text-[14px] text-rose">{m.text}</div>
                ) : (
                  <div className="whitespace-pre-line text-[15.5px] leading-relaxed">{m.text}</div>
                )}
                {props.length > 0 && (
                  <div className="mt-3 divide-y divide-line overflow-hidden rounded-2xl ring-1 ring-line">
                    {props.map((p) => (
                      <div key={p.id} className={`flex items-center gap-3.5 px-4 py-3.5 ${p.status === "superseded" || p.status === "rejected" ? "opacity-45" : ""}`}>
                        <Icon name={p.kind === "delete_event" ? "trash" : "calendar"} size={20} className="shrink-0 text-muted" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[14.5px] font-medium">{p.kind === "delete_event" ? `Remove "${p.title}"` : p.kind === "move_event" ? `Move "${p.title}"` : day(p.start!)}{p.kind === "create_event" && p.start && <span className="hidden font-normal text-ink/80 sm:inline"> · {time(p.start)}–{time(p.end!)}</span>}</div>
                          {p.start && <div className={`text-[13px] text-ink/80 ${p.kind === "create_event" ? "sm:hidden" : ""}`}>{p.kind === "create_event" ? "" : `${day(p.start)} · `}{time(p.start)}–{time(p.end!)}{p.kind === "create_event" ? ` · ${dur(mins(p))}` : ""}</div>}
                          <div className="line-clamp-2 text-[12.5px] leading-snug text-muted">{p.kind === "create_event" ? <><span className="hidden sm:inline">{dur(mins(p))} · </span>{p.reason}</> : p.reason}</div>
                        </div>
                        {p.status === "pending" ? (
                          <button disabled={!!busy} onClick={() => decide(p, "approve")} className="shrink-0 rounded-full bg-raised px-4 py-1.5 text-[13.5px] font-medium active:scale-[0.97] disabled:opacity-50">{busy === p.id ? "…" : p.kind === "create_event" ? "Add" : p.kind === "move_event" ? "Move" : "Remove"}</button>
                        ) : p.status === "approved" ? <span className="flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-sage"><Icon name="check" size={14} /> Done</span> : null}
                      </div>
                    ))}
                  </div>
                )}
                {m.actions.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {m.actions.map((a, i) => (
                      <Link key={i} href={a.ref ?? "#"} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] ${a.ok ? "bg-sage/10" : "bg-rose/10 text-rose"}`}>
                        <Icon name={a.ok ? "check" : "close"} size={14} className={a.ok ? "text-sage" : ""} /><span className="min-w-0 flex-1 truncate">{a.label}</span><Icon name="chevron" size={14} className="text-faint" />
                      </Link>
                    ))}
                  </div>
                )}
                {isLast && open.length > 0 && open.every((p) => p.kind === "create_event") && (
                  <>
                    <p className="mt-4 text-[15px]">Would you like me to add one of these to your diary?</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button disabled={!!busy} onClick={() => decide(firstOpen, "approve")} className="rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-bg active:scale-[0.98]">Add the first one</button>
                      {otherDay && <button disabled={!!busy} onClick={() => decide(otherDay, "approve")} className="rounded-full px-5 py-2.5 text-[14px] ring-1 ring-line active:scale-[0.98]">Add the {weekday(otherDay.start!)} one</button>}
                      <button disabled={!!busy} onClick={() => another(m.id)} className="rounded-full px-5 py-2.5 text-[14px] ring-1 ring-line active:scale-[0.98]">{busy === `another-${m.id}` ? "Looking…" : "Find another time"}</button>
                    </div>
                  </>
                )}
                {isLast && open.length > 0 && !open.every((p) => p.kind === "create_event") && <p className="mt-3 text-[13px] text-muted">Nothing changes until you tap.</p>}
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>

      {/* The input sits above the tab bar on phones and at the bottom of the column on desktop. */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+68px)] z-20 -mx-1 bg-gradient-to-t from-bg via-bg to-transparent px-1 pb-2 pt-4 lg:bottom-0 lg:pb-6">
        {!connected && <div className="mb-2 rounded-xl bg-surface px-3 py-2 text-[12px] text-muted ring-1 ring-line">Add an Anthropic API key on the server to switch the assistant on. Your diary and Life work without it.</div>}
        <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex items-end gap-1 rounded-[28px] bg-surface p-1.5 sm:gap-2 sm:p-2 shadow-[0_8px_30px_rgb(0_0_0/0.06)] ring-1 ring-line">
          <button type="button" aria-label="Quick actions" onClick={() => input.current?.focus()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-raised sm:h-11 sm:w-11"><Icon name="plus" size={20} /></button>
          <textarea ref={input} rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }} placeholder="What do you need?"
            className="max-h-40 min-h-[40px] min-w-0 flex-1 resize-none bg-transparent py-2 text-[16px] leading-snug outline-none placeholder:text-faint sm:min-h-[44px] sm:py-2.5" />
          {speech && <button type="button" aria-label="Speak" onClick={listen} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-11 sm:w-11 ${listening ? "bg-rose/15 text-rose" : "text-muted hover:bg-raised"}`}><Icon name="mic" size={19} /></button>}
          <button disabled={!text.trim() || !!busy} aria-label="Send" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-bg disabled:bg-faint/60 sm:h-11 sm:w-11"><Icon name="arrow" size={18} className="-rotate-90" /></button>
        </form>
        <div className="no-scrollbar mt-2.5 flex gap-2 overflow-x-auto">
          {QUICK.map((q) => <button key={q.label} onClick={() => { if (q.send) send(q.text); else { setText(q.text); input.current?.focus(); } }} className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] text-ink/80 ring-1 ring-line hover:bg-raised"><Icon name="plus" size={13} className="text-faint" />{q.label}</button>)}
        </div>
      </div>
    </div>
  );
}

interface SpeechRec { lang: string; interimResults: boolean; onresult: (e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void; onend: () => void; start: () => void }
