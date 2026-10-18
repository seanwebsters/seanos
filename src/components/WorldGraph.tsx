"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";

export interface GNode { id: string; name: string; type: string; confidence: number; degree: number; scope: string }
export interface GEdge { id: string; from: string; to: string; label: string; confidence: number }

export const GROUP: Record<string, "people" | "orgs" | "yours" | "other"> = {
  person: "people", company: "orgs", organisation: "orgs", self: "yours", project: "yours", goal: "yours", idea: "yours", skill: "yours", decision: "yours",
};
export const GLYPH: Record<string, string> = { self: "★", person: "P", company: "C", organisation: "O", project: "Pr", goal: "G", idea: "I", skill: "S", trend: "T", technology: "Te", product: "Pd", market: "M", event: "E", document: "D", place: "L", topic: "#", decision: "Dc" };
const FILL = { people: "var(--wg-people)", orgs: "var(--wg-orgs)", yours: "var(--wg-yours)", other: "var(--wg-other)" };
export const GROUP_LABEL = { people: "People", orgs: "Organisations", yours: "Yours (goals, projects, ideas)", other: "Signals (trends, tech, events, docs)" };

interface P { x: number; y: number; vx: number; vy: number }

/** Small force-directed layout: repulsion, springs and gentle centring. */
function layout(nodes: GNode[], edges: GEdge[], focus: string | null, w: number, h: number) {
  const pos = new Map<string, P>();
  nodes.forEach((n, i) => {
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
    const r = n.id === focus ? 0 : 80 + (i % 7) * 18;
    pos.set(n.id, { x: w / 2 + Math.cos(a) * r, y: h / 2 + Math.sin(a) * r, vx: 0, vy: 0 });
  });
  const ids = nodes.map((n) => n.id);
  for (let it = 0; it < 320; it++) {
    const cool = 1 - it / 320;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = pos.get(ids[i])!, b = pos.get(ids[j])!;
      let dx = a.x - b.x, dy = a.y - b.y;
      const d2 = Math.max(80, dx * dx + dy * dy);
      const f = 5200 / d2;
      dx *= f / Math.sqrt(d2); dy *= f / Math.sqrt(d2);
      a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
    }
    for (const e of edges) {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 70) * 0.03;
      a.vx += (dx / d) * f; a.vy += (dy / d) * f; b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
    for (const [id, p] of pos) {
      p.vx += (w / 2 - p.x) * 0.004; p.vy += (h / 2 - p.y) * 0.004;
      if (id === focus) { p.x = w / 2; p.y = h / 2; p.vx = p.vy = 0; continue; }
      p.x += Math.max(-12, Math.min(12, p.vx)) * cool; p.y += Math.max(-12, Math.min(12, p.vy)) * cool;
      p.vx *= 0.6; p.vy *= 0.6;
    }
  }
  // Fit to the viewport so nothing is cramped or off-screen.
  const xs = [...pos.values()].map((p) => p.x), ys = [...pos.values()].map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const pad = 56;
  const k = Math.min((w - pad * 2) / Math.max(1, x1 - x0), (h - pad * 2) / Math.max(1, y1 - y0), 2.2);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (const p of pos.values()) { p.x = w / 2 + (p.x - cx) * k; p.y = h / 2 + (p.y - cy) * k; }
  return pos;
}

export function WorldGraph({ focus = null, types, height = 420, compact = false, onSelect }: { focus?: string | null; types?: string[]; height?: number; compact?: boolean; onSelect?: (n: GNode) => void }) {
  const [data, setData] = useState<{ nodes: GNode[]; edges: GEdge[]; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const W = 800, H = Math.round((800 * height) / 520);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);

  useEffect(() => {
    const q = new URLSearchParams();
    if (focus) q.set("focus", focus);
    if (types?.length) q.set("types", types.join(","));
    setData(null);
    fetch(`/api/graph/view?${q}`).then((r) => r.json()).then((j) => (j.error ? setErr(j.error) : setData(j))).catch((e) => setErr(String(e)));
    setView({ x: 0, y: 0, k: 1 });
  }, [focus, types?.join(",")]);

  const pos = useMemo(() => (data ? layout(data.nodes, data.edges, focus ?? "n_self", W, H) : null), [data, focus, H]);
  const neighbours = useMemo(() => {
    if (!sel || !data) return null;
    const s = new Set([sel]);
    for (const e of data.edges) { if (e.from === sel) s.add(e.to); if (e.to === sel) s.add(e.from); }
    return s;
  }, [sel, data]);

  if (err) return <div className="flex items-center justify-center rounded-card bg-raised text-[13px] text-muted" style={{ height }}>{err}</div>;
  if (!data || !pos) return <div className="skeleton w-full rounded-card" style={{ height }} />;
  if (data.nodes.length <= 1) return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line px-6 text-center" style={{ height }}>
      <div className="display text-[22px]">Your world is still empty</div>
      <p className="mt-1 max-w-sm text-[13.5px] text-muted">It fills in from your people, ideas, trends, events and partnerships, and from what the Curator reads in your edition and reports.</p>
    </div>
  );

  const top = new Set([...data.nodes].sort((a, b) => b.degree - a.degree).slice(0, compact ? 8 : 18).map((n) => n.id));
  const selected = sel ? data.nodes.find((n) => n.id === sel) ?? null : null;
  const r = (n: GNode) => (n.type === "self" ? 16 : 6 + Math.min(10, Math.sqrt(n.degree) * 2.4));

  return (
    <div>
    <div className="relative overflow-hidden rounded-card bg-surface ring-1 ring-line" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`} className="h-full w-full touch-none select-none" role="img" aria-label={`Knowledge graph: ${data.nodes.length} entities`}
        onWheel={(e) => { const k = Math.max(0.4, Math.min(3, view.k * (e.deltaY < 0 ? 1.12 : 0.89))); setView({ ...view, k }); }}
        onPointerDown={(e) => {
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pointers.current.size === 1) drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const pts = [...pointers.current.values()];
          if (pts.length === 2) {
            const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            if (pinch.current) setView((v) => ({ ...v, k: Math.max(0.4, Math.min(3, v.k * (d / pinch.current!))) }));
            pinch.current = d;
          } else if (drag.current) {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const s = W / rect.width / view.k;
            setView((v) => ({ ...v, x: drag.current!.vx + (e.clientX - drag.current!.x) * s, y: drag.current!.vy + (e.clientY - drag.current!.y) * s }));
          }
        }}
        onPointerUp={(e) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; if (!pointers.current.size) drag.current = null; }}
        onPointerCancel={(e) => { pointers.current.delete(e.pointerId); drag.current = null; pinch.current = null; }}
      >
        <g transform={`translate(${W / 2 + view.x} ${H / 2 + view.y}) scale(${view.k}) translate(${-W / 2} ${-H / 2})`}>
          {data.edges.map((e) => {
            const a = pos.get(e.from), b = pos.get(e.to);
            if (!a || !b) return null;
            const on = !neighbours || (neighbours.has(e.from) && neighbours.has(e.to) && (e.from === sel || e.to === sel));
            return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgb(var(--muted))" strokeOpacity={on ? 0.25 + e.confidence * 0.45 : 0.06} strokeWidth={on && sel ? 2 : 1.2} strokeDasharray={e.confidence < 0.6 ? "4 4" : undefined}><title>{e.label} ({Math.round(e.confidence * 100)}%)</title></line>;
          })}
          {data.nodes.map((n) => {
            const p = pos.get(n.id)!;
            const g = GROUP[n.type] ?? "other";
            const dim = neighbours && !neighbours.has(n.id);
            const rad = r(n);
            const showLabel = n.id === sel || top.has(n.id) || n.type === "self" || (neighbours?.has(n.id) ?? false);
            return (
              <g key={n.id} transform={`translate(${p.x} ${p.y})`} opacity={dim ? 0.18 : 1} className="cursor-pointer" onClick={(ev) => { ev.stopPropagation(); setSel(n.id === sel ? null : n.id); onSelect?.(n); }}>
                <circle r={rad + 10} fill="transparent" />
                <circle r={rad} fill={FILL[g]} stroke={n.id === sel ? "rgb(var(--ink))" : n.type === "self" ? "rgb(var(--accent))" : "rgb(var(--surface))"} strokeWidth={n.id === sel || n.type === "self" ? 3 : 2} fillOpacity={0.35 + n.confidence * 0.65} />
                {rad >= 9 && <text textAnchor="middle" dy="0.35em" fontSize={rad * 0.85} fontWeight={700} fill="rgb(var(--surface))" style={{ pointerEvents: "none" }}>{GLYPH[n.type] ?? "·"}</text>}
                {showLabel && !compact && <text y={rad + 13} textAnchor="middle" fontSize={11.5} fill="rgb(var(--ink))" stroke="rgb(var(--surface))" strokeWidth={3} paintOrder="stroke" style={{ pointerEvents: "none" }}>{n.name.length > 28 ? `${n.name.slice(0, 26)}…` : n.name}</text>}
                {showLabel && compact && top.has(n.id) && <text y={rad + 12} textAnchor="middle" fontSize={11} fill="rgb(var(--muted))" stroke="rgb(var(--surface))" strokeWidth={3} paintOrder="stroke" style={{ pointerEvents: "none" }}>{n.name.length > 18 ? `${n.name.slice(0, 16)}…` : n.name}</text>}
                <title>{`${n.name} · ${n.type} · ${Math.round(n.confidence * 100)}% confidence`}</title>
              </g>
            );
          })}
        </g>
      </svg>
      {!compact && (
        <div className="absolute right-3 top-3 flex flex-col gap-1.5">
          <button onClick={() => setView((v) => ({ ...v, k: Math.min(3, v.k * 1.25) }))} className="flex h-8 w-8 items-center justify-center rounded-full bg-raised text-[16px]" aria-label="Zoom in">+</button>
          <button onClick={() => setView((v) => ({ ...v, k: Math.max(0.4, v.k / 1.25) }))} className="flex h-8 w-8 items-center justify-center rounded-full bg-raised text-[16px]" aria-label="Zoom out">−</button>
          <button onClick={() => setView({ x: 0, y: 0, k: 1 })} className="flex h-8 w-8 items-center justify-center rounded-full bg-raised" aria-label="Reset"><Icon name="refresh" size={14} /></button>
        </div>
      )}
      {selected && !compact && (
        <div className="absolute inset-x-3 bottom-3 flex animate-rise items-center gap-3 rounded-2xl bg-surface/95 p-3 shadow-xl ring-1 ring-line backdrop-blur">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white" style={{ background: FILL[GROUP[selected.type] ?? "other"] }}>{GLYPH[selected.type] ?? "·"}</span>
          <div className="min-w-0 flex-1"><div className="truncate text-[14.5px] font-semibold">{selected.name}</div><div className="text-[12px] capitalize text-muted">{selected.type} · {selected.degree} connections · {Math.round(selected.confidence * 100)}%</div></div>
          <Link href={`/infinity/world?focus=${selected.id}`} className="chip shrink-0">Focus</Link>
          <Link href={`/infinity/node/${selected.id}`} className="chip shrink-0 bg-ink text-bg">Open</Link>
        </div>
      )}
      {compact && <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-surface/85 px-2.5 py-1 text-[11px] text-muted backdrop-blur">{data.total} entities</div>}
    </div>
    {!compact && (
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11.5px] text-muted">
        {(Object.keys(GROUP_LABEL) as (keyof typeof GROUP_LABEL)[]).map((g) => <span key={g} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: FILL[g] }} />{GROUP_LABEL[g]}</span>)}
        <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-muted" /> lower confidence · letters show type · tap a node</span>
      </div>
    )}
    </div>
  );
}
