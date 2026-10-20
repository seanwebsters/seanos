"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

/* ------------------------------- Toasts ------------------------------- */

type Toast = { id: number; text: string; href?: string };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

/* -------------------------------- Ask -------------------------------- */

export interface AskContext { type: string; id: string; title: string }
interface AskState { open: (opts?: { context?: AskContext; prompt?: string; suggestions?: string[] }) => void }
const AskCtx = createContext<AskState>({ open: () => {} });
export const useAsk = () => useContext(AskCtx);

export async function api<T = unknown>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error ?? `Request failed (${res.status})`);
  return j as T;
}

const DEFAULT_SUGGESTIONS = [
  "Research 20 potential Calmlings brand partners",
  "Find me 10 interesting people to meet",
  "Create five LinkedIn posts for next week",
  "Find interesting events in London this weekend",
  "Research the AI animation market",
  "Every Monday, find me new partnership opportunities",
];

export function Providers({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ask, setAsk] = useState<{ context?: AskContext; prompt?: string; suggestions?: string[] } | null>(null);
  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x, { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 4200);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAsk({});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      <AskCtx.Provider value={{ open: (o) => setAsk(o ?? {}) }}>
        {children}
        {ask && <AskSheet {...ask} onClose={() => setAsk(null)} />}
        <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col items-center gap-2 pt-[calc(env(safe-area-inset-top)+12px)]">
          {toasts.map((t) => (
            <div key={t.id} className="glass pointer-events-auto flex animate-rise items-center gap-3 rounded-full px-4 py-2.5 text-[14px] shadow-2xl ring-1 ring-line">
              <Icon name="check" size={16} className="text-sage" />
              <span>{t.text}</span>
              {t.href && <Link href={t.href} className="font-semibold text-accent">View</Link>}
            </div>
          ))}
        </div>
      </AskCtx.Provider>
    </ToastCtx.Provider>
  );
}

export function Sheet({ onClose, children, title }: { onClose: () => void; children: ReactNode; title?: string }) {
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center lg:items-center">
      <div className="absolute inset-0 animate-fade bg-black/50" onClick={onClose} />
      <div
        className="relative max-h-[92vh] w-full max-w-xl animate-sheet overflow-y-auto rounded-t-sheet bg-surface pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-2xl ring-1 ring-line lg:rounded-sheet"
        style={{ transform: drag ? `translateY(${drag}px)` : undefined, transition: start.current === null ? "transform .3s cubic-bezier(.32,.72,0,1)" : "none" }}
      >
        <div
          className="sticky top-0 z-10 bg-surface/95 px-5 pb-2 pt-2.5 backdrop-blur"
          onTouchStart={(e) => (start.current = e.touches[0].clientY)}
          onTouchMove={(e) => start.current !== null && setDrag(Math.max(0, e.touches[0].clientY - start.current))}
          onTouchEnd={() => {
            start.current = null;
            if (drag > 110) onClose();
            setDrag(0);
          }}
        >
          <div className="mx-auto h-1.5 w-10 rounded-full bg-line" />
          {title && (
            <div className="mt-3 flex items-center justify-between">
              <div className="display text-[24px]">{title}</div>
              <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-raised text-muted" aria-label="Close"><Icon name="close" size={16} /></button>
            </div>
          )}
        </div>
        <div className="px-5 pt-2">{children}</div>
      </div>
    </div>
  );
}

type SpeechRec = { start(): void; stop(): void; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; interimResults: boolean; lang: string; continuous: boolean };

function AskSheet({ context, prompt, suggestions, onClose }: { context?: AskContext; prompt?: string; suggestions?: string[]; onClose: () => void }) {
  const [text, setText] = useState(prompt ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  const router = useRouter();
  const toast = useToast();
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const speechSupported = typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);
  const toggleMic = () => {
    if (listening) return rec.current?.stop();
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const R = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!R) return;
    const r = new R();
    r.lang = "en-GB";
    r.interimResults = true;
    r.continuous = false;
    const base = text ? `${text} ` : "";
    r.onresult = (e) => setText(base + Array.from(e.results).map((x) => x[0].transcript).join(""));
    r.onend = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  };

  const submit = async (instruction: string) => {
    if (!instruction.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const { task } = await api<{ task: { id: string } }>("/api/tasks", { instruction, context_ref: context ?? null });
      onClose();
      toast({ text: "Delegated to your team", href: `/tasks/${task.id}` });
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const list = suggestions?.length ? suggestions : context ? [] : DEFAULT_SUGGESTIONS;
  return (
    <Sheet onClose={onClose} title="Ask SEAN OS">
      {context && (
        <div className="mb-3 inline-flex max-w-full items-center gap-2 rounded-full bg-accent/12 px-3 py-1.5 text-[12.5px] text-accent">
          <Icon name="link" size={14} /> <span className="truncate">{context.title}</span>
        </div>
      )}
      <div className="relative">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(text);
          }}
          rows={4}
          placeholder={context ? "What should the team do with this?" : "Delegate anything…"}
          className="field min-h-[120px] resize-none pr-12 text-[17px] leading-snug"
        />
        {speechSupported && (
          <button onClick={toggleMic} aria-label="Dictate" className={`absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full ${listening ? "animate-pulse2 bg-rose text-white" : "bg-surface text-muted ring-1 ring-line"}`}>
            <Icon name="mic" size={18} />
          </button>
        )}
      </div>
      {err && <div className="mt-2 text-[13px] text-rose">{err}</div>}
      <button disabled={busy || !text.trim()} onClick={() => submit(text)} className="btn-primary mt-3 w-full py-3.5 text-[15px]">
        {busy ? "Delegating…" : <>Delegate <Icon name="arrow" size={16} /></>}
      </button>
      {list.length > 0 && (
        <div className="mt-5">
          <div className="eyebrow mb-2">{context ? "Quick actions" : "Try"}</div>
          <div className="flex flex-col gap-1.5 pb-2">
            {list.map((s) => (
              <button key={s} onClick={() => (context ? submit(s) : setText(s))} className="flex items-center justify-between rounded-2xl bg-raised px-4 py-3 text-left text-[14.5px] active:scale-[0.99]">
                <span>{s}</span> <Icon name={context ? "bolt" : "arrow"} size={16} className="text-muted" />
              </button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

export function AskButton({ context, label = "Ask", suggestions, className = "btn-ghost" }: { context?: AskContext; label?: string; suggestions?: string[]; className?: string }) {
  const { open } = useAsk();
  return (
    <button onClick={() => open({ context, suggestions })} className={className}>
      <Icon name="sparkle" size={16} /> {label}
    </button>
  );
}

export function AskBar() {
  const { open } = useAsk();
  return (
    <button onClick={() => open()} className="glass flex w-full items-center gap-3 whitespace-nowrap rounded-full px-4 py-3 text-left text-[15px] text-muted shadow-xl ring-1 ring-line">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[#141413]"><Icon name="sparkle" size={15} /></span>
      Ask SEAN OS…
      <span className="ml-auto hidden rounded-md bg-raised px-1.5 py-0.5 text-[11px] lg:inline">⌘K</span>
    </button>
  );
}

/* ----------------------------- Navigation ----------------------------- */

/** The five sections of the one-page Home, in order. */
export const ZONES = [
  { id: "today", label: "Today", icon: "sun" },
  { id: "founder", label: "Founder", icon: "rocket" },
  { id: "news", label: "News", icon: "edition" },
  { id: "opportunities", label: "Opportunities", icon: "target" },
  { id: "money", label: "Money", icon: "wallet" },
  { id: "life", label: "Life", icon: "life" },
  { id: "team", label: "Team", icon: "agents" },
];

const TABS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/founder", label: "Founder", icon: "rocket" },
  { href: "/approvals", label: "Inbox", icon: "inbox" },
  { href: "/agents", label: "Agents", icon: "agents" },
  { href: "/more", label: "More", icon: "grid" },
];

/** Every workspace, grouped so there are five places to look rather than twenty. */
const GROUPS: { title: string; items: { href: string; label: string; icon: string }[] }[] = [
  { title: "Build", items: [
    { href: "/founder", label: "Founder OS", icon: "rocket" },
    { href: "/ideas", label: "Ideas", icon: "bulb" },
    { href: "/opportunities", label: "Opportunities", icon: "target" },
    { href: "/trends", label: "Trends", icon: "trend" },
  ] },
  { title: "Create & work", items: [
    { href: "/studio", label: "Studio", icon: "studio" },
    { href: "/calmlings", label: "Calmlings", icon: "briefcase" },
    { href: "/speaking", label: "Speaking", icon: "stage" },
    { href: "/edition", label: "Edition", icon: "edition" },
  ] },
  { title: "You", items: [
    { href: "/life", label: "Life", icon: "life" },
    { href: "/finance", label: "Money", icon: "wallet" },
    { href: "/people", label: "People", icon: "people" },
    { href: "/wardrobe", label: "Wardrobe", icon: "shirt" },
  ] },
  { title: "Intelligence", items: [
    { href: "/infinity", label: "SEAN ∞", icon: "sparkle" },
    { href: "/intelligence", label: "Insights", icon: "chart" },
    { href: "/memory", label: "Memory", icon: "brain" },
  ] },
  { title: "System", items: [
    { href: "/tasks", label: "Tasks", icon: "tasks" },
    { href: "/automations", label: "Automations", icon: "clock" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ] },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

export function TabBar({ badge }: { badge: number }) {
  const path = usePathname();
  const { open } = useAsk();
  if (path.startsWith("/sign-in") || path.includes("/deck")) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg via-bg/80 to-transparent" />
      <div className="relative mx-auto max-w-md px-4 pb-[calc(env(safe-area-inset-bottom)+10px)]">
        <button onClick={() => open()} className="glass mb-2.5 flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-left text-[14.5px] text-muted shadow-xl ring-1 ring-line active:scale-[0.99]">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[#141413]"><Icon name="sparkle" size={15} /></span>
          Ask SEAN OS…
          <Icon name="mic" size={18} className="ml-auto" />
        </button>
        <nav className="glass flex items-center justify-around rounded-[26px] px-1 py-1.5 shadow-2xl ring-1 ring-line">
          {TABS.map((t) => {
            const on = isActive(path, t.href) || (t.href === "/more" && GROUPS.some((g) => g.items.some((i) => i.href !== "/founder" && isActive(path, i.href))));
            return (
              <Link key={t.href} href={t.href} className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10.5px] font-medium transition ${on ? "text-ink" : "text-faint"}`}>
                <Icon name={t.icon} size={23} stroke={on ? 2 : 1.6} />
                {t.label}
                {t.href === "/approvals" && badge > 0 && <span className="absolute right-[24%] top-0.5 min-w-[16px] rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-[#141413]">{badge}</span>}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export function Sidebar({ badge, unread, ventures = [] }: { badge: number; unread: number; ventures?: { id: string; name: string }[] }) {
  const path = usePathname();
  if (path.startsWith("/sign-in") || path.includes("/deck")) return null;
  const item = (t: { href: string; label: string; icon: string }, count?: number, small = false) => (
    <Link key={t.href} href={t.href} className={`flex items-center gap-3 rounded-xl px-3 ${small ? "py-1.5 text-[13.5px]" : "py-2 text-[14px]"} transition ${isActive(path, t.href) ? "bg-raised font-medium text-ink" : "text-muted hover:text-ink"}`}>
      <Icon name={t.icon} size={small ? 16 : 18} /> {t.label}
      {count ? <span className="ml-auto rounded-full bg-accent px-1.5 text-[11px] font-semibold text-[#141413]">{count}</span> : null}
    </Link>
  );
  const open = GROUPS.findIndex((g) => g.items.some((i) => isActive(path, i.href)));
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-bg px-4 py-6 lg:flex">
      <Link href="/" className="mb-6 px-3">
        <div className="display text-[28px] leading-none">SEAN OS</div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-faint">Personal organisation</div>
      </Link>
      <div className="mb-4"><AskBar /></div>
      <nav className="no-scrollbar flex-1 space-y-0.5 overflow-y-auto">
        {TABS.filter((t) => t.href !== "/more").map((t) => item(t, t.href === "/approvals" ? badge : undefined))}
        {path === "/" && (
          <>
            <div className="eyebrow px-3 pb-1 pt-5">On this page</div>
            {ZONES.map((z) => <a key={z.id} href={`#${z.id}`} className="flex items-center gap-3 rounded-xl px-3 py-1.5 text-[13.5px] text-muted hover:text-ink"><Icon name={z.icon} size={16} /> {z.label}</a>)}
          </>
        )}
        {path.startsWith("/founder") && (
          <>
            <div className="flex items-center justify-between px-3 pb-1 pt-5"><span className="eyebrow">Ventures</span><Link href="/founder/new" aria-label="New venture" className="text-muted hover:text-ink"><Icon name="plus" size={16} /></Link></div>
            {ventures.map((v) => (
              <Link key={v.id} href={`/founder/v/${v.id}`} className={`flex items-center gap-3 rounded-xl px-3 py-1.5 text-[13.5px] transition ${path.startsWith(`/founder/v/${v.id}`) ? "bg-raised font-medium text-ink" : "text-muted hover:text-ink"}`}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-raised text-[10px] font-semibold text-ink">{v.name.slice(0, 1)}</span>
                <span className="truncate">{v.name}</span>
              </Link>
            ))}
          </>
        )}
        <div className="pt-4">
          {GROUPS.map((g, i) => (
            <details key={g.title} open={i === open} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-faint hover:text-ink">
                {g.title}<Icon name="chevron" size={14} className="transition group-open:rotate-90" />
              </summary>
              <div className="pb-1">{g.items.map((t) => item(t, undefined, true))}</div>
            </details>
          ))}
        </div>
      </nav>
      <Link href="/notifications" className="mt-3 flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] text-muted hover:text-ink">
        <Icon name="bell" size={18} /> Notifications {unread > 0 && <span className="ml-auto rounded-full bg-raised px-1.5 text-[11px]">{unread}</span>}
      </Link>
    </aside>
  );
}

export function MoreGrid() {
  return (
    <div className="space-y-6 px-5 lg:px-0">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="eyebrow mb-2">{g.title}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {g.items.map((t) => (
              <Link key={t.href} href={t.href} className="card flex items-center gap-3 px-3.5 py-3 active:scale-[0.98]">
                <Icon name={t.icon} size={18} className="shrink-0 text-accent" />
                <span className="truncate text-[14px] font-medium">{t.label}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Sticky jump bar for the one-page Home; highlights the section in view. */
export function PageNav() {
  const [active, setActive] = useState(ZONES[0].id);
  // The active section is the last one whose top has passed just under the bar.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      let cur = ZONES[0].id;
      for (const z of ZONES) {
        const el = document.getElementById(z.id);
        if (el && el.getBoundingClientRect().top <= 140) cur = z.id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = ZONES[ZONES.length - 1].id;
      setActive(cur);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);
  const bar = useRef<HTMLElement>(null);
  // Keep the active chip in view by scrolling the bar sideways only, never the page.
  useEffect(() => {
    const b = bar.current, c = document.getElementById(`nav-${active}`);
    if (b && c) b.scrollTo({ left: c.offsetLeft - b.clientWidth / 2 + c.clientWidth / 2, behavior: "smooth" });
  }, [active]);
  return (
    <nav ref={bar} aria-label="Sections" className="no-scrollbar pt-safe sticky top-0 z-30 mt-5 flex gap-1.5 overflow-x-auto bg-bg/90 px-5 py-2.5 backdrop-blur lg:px-0">
      {ZONES.map((z) => (
        <a key={z.id} id={`nav-${z.id}`} href={`#${z.id}`} className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${active === z.id ? "bg-ink text-bg" : "bg-raised text-muted"}`}>
          <Icon name={z.icon} size={14} /> {z.label}
        </a>
      ))}
    </nav>
  );
}

/* ------------------------------- Actions ------------------------------- */

export function ActionButton({ url, body, method = "POST", children, className = "btn-ghost", confirm, toastText, after }: { url: string; body?: unknown; method?: string; children: ReactNode; className?: string; confirm?: string; toastText?: string; after?: "back" | string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  return (
    <button
      disabled={busy}
      className={className}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm && !window.confirm(confirm)) return;
        setBusy(true);
        try {
          const res = await api<{ task?: { id: string } }>(url, body, method);
          if (res.task) toast({ text: toastText ?? "Delegated to your team", href: `/tasks/${res.task.id}` });
          else if (toastText) toast({ text: toastText });
          if (after === "back") router.back();
          else if (after) router.push(after);
          router.refresh();
        } catch (err) {
          alert((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : children}
    </button>
  );
}

/** One-tap delegation: creates a task about an item. */
export function Delegate({ label, instruction, kind, params, context, className = "chip", icon = "bolt" }: { label: string; instruction?: string; kind?: string; params?: Record<string, unknown>; context?: AskContext; className?: string; icon?: string }) {
  return (
    <ActionButton url="/api/tasks" body={{ instruction: instruction ?? label, kind, params, context_ref: context ?? null }} className={className}>
      <Icon name={icon} size={14} /> {label}
    </ActionButton>
  );
}

export function Patch({ table, id, patch, children, className = "chip", toastText }: { table: string; id: string; patch: Record<string, unknown>; children: ReactNode; className?: string; toastText?: string }) {
  return <ActionButton url={`/api/entity/${table}/${id}`} body={patch} method="PATCH" className={className} toastText={toastText}>{children}</ActionButton>;
}

export function Feedback({ target, id, title, options }: { target: string; id: string; title: string; options: { signal: string; label: string; icon?: string }[] }) {
  const [sent, setSent] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.signal}
          disabled={Boolean(sent)}
          className={`chip ${sent === o.signal ? "bg-accent/20 text-accent" : ""}`}
          onClick={async () => {
            setSent(o.signal);
            await api("/api/feedback", { target, id, title, signal: o.signal });
            router.refresh();
          }}
        >
          {o.icon && <Icon name={o.icon} size={14} />} {sent === o.signal ? "Noted" : o.label}
        </button>
      ))}
    </div>
  );
}

export function CopyButton({ text, label = "Copy", className = "chip" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      <Icon name={done ? "check" : "copy"} size={14} /> {done ? "Copied" : label}
    </button>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(null);
  useEffect(() => setTheme(document.documentElement.dataset.theme ?? "system"), []);
  const set = (t: string) => {
    setTheme(t);
    if (t === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    document.cookie = `theme=${t}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <div className="flex rounded-full bg-raised p-1">
      {["system", "dark", "light"].map((t) => (
        <button key={t} onClick={() => set(t)} className={`rounded-full px-3 py-1.5 text-[13px] capitalize ${theme === t ? "bg-surface font-medium shadow ring-1 ring-line" : "text-muted"}`}>{t}</button>
      ))}
    </div>
  );
}

/** Keeps a page fresh while agents are working on it. */
export function LiveRefresh({ active, every = 4000 }: { active: boolean; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [active, every, router]);
  return null;
}

export function OnlineBadge() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  if (online) return null;
  return <div className="fixed inset-x-0 top-0 z-[90] bg-rose py-1 text-center text-[12px] font-medium text-white pt-[calc(env(safe-area-inset-top)+4px)]">You're offline. Showing saved pages; new requests will wait.</div>;
}

/** Inline editor for one field of an entity. */
export function EditField({ table, id, field, value, multiline = false, placeholder, type = "text", className = "" }: { table: string; id: string; field: string; value: string; multiline?: boolean; placeholder?: string; type?: string; className?: string }) {
  const [v, setV] = useState(value);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const save = async () => {
    if (v === value) return;
    const val = type === "number" ? Number(v) : type === "datetime-local" ? (v ? new Date(v).toISOString() : null) : v;
    await api(`/api/entity/${table}/${id}`, { [field]: val }, "PATCH");
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
    router.refresh();
  };
  const props = { value: v, placeholder, onBlur: save, className: `field ${className}`, onChange: (e: { target: { value: string } }) => setV(e.target.value) };
  return (
    <div className="relative">
      {multiline ? <textarea rows={4} {...props} /> : <input type={type} {...props} />}
      {saved && <span className="absolute right-3 top-3 text-[11px] text-sage">Saved</span>}
    </div>
  );
}

/** Small create form for any creatable entity. */
export function CreateForm({ table, fields, submit = "Add", extra = {}, className = "" }: { table: string; fields: { name: string; label: string; type?: string; options?: string[] }[]; submit?: string; extra?: Record<string, unknown>; className?: string }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form
      className={`space-y-2 ${className}`}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const data: Record<string, unknown> = { ...extra };
        for (const f of fields) {
          const v = vals[f.name] ?? "";
          data[f.name] = f.type === "number" ? (v === "" ? null : Number(v)) : f.type === "datetime-local" && v ? new Date(v).toISOString() : f.type === "list" ? v.split(",").map((x) => x.trim()).filter(Boolean) : v;
        }
        try {
          await api(`/api/entity/${table}`, data);
          setVals({});
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {fields.map((f) =>
        f.options ? (
          <select key={f.name} value={vals[f.name] ?? f.options[0]} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} className="field">
            {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : f.type === "textarea" ? (
          <textarea key={f.name} rows={3} placeholder={f.label} value={vals[f.name] ?? ""} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} className="field" />
        ) : (
          <input key={f.name} type={f.type === "list" ? "text" : f.type ?? "text"} placeholder={f.label} value={vals[f.name] ?? ""} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} className="field" />
        ),
      )}
      <button disabled={busy} className="btn-primary w-full">{busy ? "Saving…" : submit}</button>
    </form>
  );
}

export function PrintButton() {
  return <button onClick={() => window.print()} className="flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[13px] backdrop-blur">Save PDF</button>;
}
