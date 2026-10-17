import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { AGENT_BY_KEY, isAgentKey } from "@/lib/ai/agents";
import type { Source } from "@/lib/db/types";

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const PALETTES = [
  ["#1b1a17", "#b08a52", "#e9dcc0"],
  ["#10151b", "#3d5a73", "#c9d6e0"],
  ["#17130f", "#8c4a32", "#e8b896"],
  ["#121512", "#4f6b55", "#cfe0c9"],
  ["#16121a", "#6b4f86", "#dccdea"],
  ["#1a1414", "#9a5b5b", "#efcfc4"],
  ["#111316", "#5b6670", "#e6e1d6"],
];

/** Procedural cinematic artwork, used when a real image isn't available. */
export function Art({ seed, className = "", children }: { seed: string; className?: string; children?: ReactNode }) {
  const h = hash(seed);
  const [a, b, c] = PALETTES[h % PALETTES.length];
  const x1 = 20 + (h % 60), y1 = 15 + ((h >> 5) % 50), x2 = 30 + ((h >> 9) % 60), y2 = 50 + ((h >> 13) % 45);
  return (
    <div
      className={`grain relative overflow-hidden ${className}`}
      style={{ background: `radial-gradient(120% 90% at ${x1}% ${y1}%, ${c}cc 0%, transparent 45%), radial-gradient(90% 80% at ${x2}% ${y2}%, ${b} 0%, transparent 60%), linear-gradient(160deg, ${a}, ${b}88 60%, ${a})` }}
    >
      {children}
    </div>
  );
}

/** Real image with an artistic fallback. Remote images are the cited source's own preview image. */
export function Img({ src, seed, alt, className = "", children }: { src: string | null | undefined; seed: string; alt: string; className?: string; children?: ReactNode }) {
  if (!src) return <Art seed={seed} className={className}>{children}</Art>;
  return (
    <div className={`relative overflow-hidden bg-raised ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
      {children}
    </div>
  );
}

export function PageHeader({ title, eyebrow, back, actions, subtitle }: { title: string; eyebrow?: string; back?: string; actions?: ReactNode; subtitle?: ReactNode }) {
  return (
    <header className="pt-safe px-5 pb-2 pt-4 lg:px-0 lg:pt-10">
      <div className="flex h-10 items-center justify-between">
        {back ? (
          <Link href={back} className="-ml-2 flex items-center gap-0.5 rounded-full px-2 py-1 text-[15px] text-accent active:opacity-60">
            <Icon name="back" size={22} /> Back
          </Link>
        ) : <span />}
        <div className="flex items-center gap-2">{actions}</div>
      </div>
      {eyebrow && <div className="eyebrow mt-2">{eyebrow}</div>}
      <h1 className="display mt-1 text-[40px] leading-[1.02] lg:text-[52px]">{title}</h1>
      {subtitle && <div className="mt-2 text-[15px] text-muted">{subtitle}</div>}
    </header>
  );
}

export function Section({ title, href, action, children, className = "" }: { title: string; href?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mt-9 animate-rise ${className}`}>
      <div className="mb-3 flex items-end justify-between px-5 lg:px-0">
        <h2 className="display text-[26px] leading-none">{title}</h2>
        {href ? (
          <Link href={href} className="flex items-center text-[13px] font-medium text-muted active:opacity-60">
            See all <Icon name="chevron" size={16} />
          </Link>
        ) : action}
      </div>
      {children}
    </section>
  );
}

export function Rail({ children }: { children: ReactNode }) {
  return <div className="no-scrollbar -mb-2 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 lg:px-0">{children}</div>;
}

export function Empty({ icon = "sparkle", title, body, children }: { icon?: string; title: string; body?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-5 flex flex-col items-center rounded-card border border-dashed border-line px-6 py-10 text-center lg:mx-0">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-raised text-accent"><Icon name={icon} size={22} /></div>
      <div className="display text-[22px]">{title}</div>
      {body && <div className="mt-1.5 max-w-sm text-[14px] leading-relaxed text-muted">{body}</div>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

const STATUS: Record<string, string> = {
  queued: "bg-raised text-muted", running: "bg-sky/15 text-sky", awaiting_approval: "bg-accent/15 text-accent", completed: "bg-sage/15 text-sage",
  failed: "bg-rose/15 text-rose", blocked: "bg-rose/15 text-rose", paused: "bg-raised text-muted", cancelled: "bg-raised text-faint",
  pending: "bg-accent/15 text-accent", approved: "bg-sage/15 text-sage", rejected: "bg-rose/15 text-rose", draft: "bg-raised text-muted",
  scheduled: "bg-sky/15 text-sky", published: "bg-sage/15 text-sage", open: "bg-sage/15 text-sage", rolling: "bg-sage/15 text-sage", closed: "bg-raised text-faint", unknown: "bg-raised text-muted", invite_only: "bg-raised text-muted",
  explore: "bg-sage/15 text-sage", monitor: "bg-sky/15 text-sky", discard: "bg-raised text-faint",
};
export function Pill({ status, label }: { status: string; label?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${STATUS[status] ?? "bg-raised text-muted"}`}>
    {status === "running" && <span className="h-1.5 w-1.5 animate-pulse2 rounded-full bg-current" />}
    {label ?? status.replace(/_/g, " ")}
  </span>;
}

export function AgentBadge({ agent, size = 32 }: { agent: string; size?: number }) {
  const def = isAgentKey(agent) ? AGENT_BY_KEY[agent] : null;
  return (
    <span title={def?.name} className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-[#141413]" style={{ width: size, height: size, background: def?.hue ?? "#d9c7a3", fontSize: size * 0.32 }}>
      {def?.glyph ?? "AI"}
    </span>
  );
}

export function agentName(agent: string) {
  return isAgentKey(agent) ? AGENT_BY_KEY[agent].name : agent;
}

export function Sources({ sources, title = "Sources" }: { sources: Source[]; title?: string }) {
  if (!sources.length) return null;
  return (
    <div className="mt-8">
      <div className="eyebrow mb-2">{title}</div>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface ring-1 ring-line/70">
        {sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-3 px-4 py-3 active:bg-raised">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">{s.title}</div>
                <div className="truncate text-[12px] text-muted">{s.publisher ? `${s.publisher} · ` : ""}{hostOf(s.url)}{s.date ? ` · ${s.date}` : ""}</div>
              </div>
              <Icon name="external" size={16} className="text-faint" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function hostOf(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

function inline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*([^*]+)\*)/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[2]) out.push(<strong key={k++}>{m[2]}</strong>);
    else if (m[3]) out.push(<a key={k++} href={m[4]} target="_blank" rel="noreferrer noopener">{m[3]}</a>);
    else if (m[5]) out.push(<em key={k++}>{m[5]}</em>);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

/** Small, safe markdown renderer (no raw HTML). */
export function Markdown({ text, className = "prose-sean" }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r/g, "").split("\n");
  let i = 0, k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (/^#{1,2}\s/.test(l)) { blocks.push(<h2 key={k++}>{inline(l.replace(/^#+\s/, ""))}</h2>); i++; continue; }
    if (/^#{3,}\s/.test(l)) { blocks.push(<h3 key={k++}>{inline(l.replace(/^#+\s/, ""))}</h3>); i++; continue; }
    if (/^>\s?/.test(l)) { blocks.push(<blockquote key={k++}>{inline(l.replace(/^>\s?/, ""))}</blockquote>); i++; continue; }
    if (/^\|.*\|$/.test(l.trim())) {
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
        if (!/^\|[\s:|-]+\|$/.test(lines[i].trim())) rows.push(lines[i].trim().slice(1, -1).split("|").map((c) => c.trim()));
        i++;
      }
      blocks.push(<div key={k++} className="overflow-x-auto"><table><thead><tr>{rows[0]?.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead><tbody>{rows.slice(1).map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s/, ""));
      const L = ordered ? "ol" : "ul";
      blocks.push(<L key={k++}>{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</L>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#|>|\s*([-*]|\d+\.)\s|\|)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={k++}>{inline(para.join(" "))}</p>);
  }
  return <div className={className}>{blocks}</div>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="eyebrow">{label}</div>
      <div className="display mt-1 text-[30px] leading-none">{value}</div>
      {sub && <div className="mt-1 text-[12px] text-muted">{sub}</div>}
    </div>
  );
}

export function Row({ href, title, sub, left, right }: { href?: string; title: ReactNode; sub?: ReactNode; left?: ReactNode; right?: ReactNode }) {
  const inner = (
    <div className="flex items-center gap-3 px-4 py-3.5">
      {left}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium">{title}</div>
        {sub && <div className="mt-0.5 line-clamp-2 text-[13px] text-muted">{sub}</div>}
      </div>
      {right ?? (href && <Icon name="chevron" size={18} className="text-faint" />)}
    </div>
  );
  return href ? <Link href={href} className="block active:bg-raised">{inner}</Link> : inner;
}

export function List({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-5 divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-line/70 lg:mx-0 ${className}`}>{children}</div>;
}

export function Meter({ value, max = 5, label }: { value: number; max?: number; label?: string }) {
  return (
    <div className="flex items-center gap-2" title={label}>
      <div className="flex gap-0.5">{Array.from({ length: max }, (_, i) => <span key={i} className={`h-3 w-1.5 rounded-full ${i < value ? "bg-accent" : "bg-line"}`} />)}</div>
      {label && <span className="text-[12px] text-muted">{label}</span>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  return <div className={`mx-5 rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed lg:mx-0 ${tone === "warn" ? "bg-rose/10 text-rose" : "bg-accent/10 text-ink/90"}`}>{children}</div>;
}

export function Tabs({ tabs, active, base }: { tabs: { key: string; label: string; count?: number }[]; active: string; base: string }) {
  return (
    <div className="no-scrollbar sticky top-0 z-30 -mt-1 flex gap-1.5 overflow-x-auto bg-bg/90 px-5 py-2.5 backdrop-blur lg:px-0">
      {tabs.map((t) => (
        <Link key={t.key} href={`${base}${base.includes("?") ? "&" : "?"}tab=${t.key}`} scroll={false} className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13.5px] font-medium transition ${active === t.key ? "bg-ink text-bg" : "bg-raised text-muted"}`}>
          {t.label}{t.count ? <span className="ml-1.5 opacity-60">{t.count}</span> : null}
        </Link>
      ))}
    </div>
  );
}
