"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Scenario } from "@/lib/db/types";
import { ASSUMPTION_META, defaultRanges, gbpShort, normalise, sensitivity, simulate, type AssumptionKey, type Assumptions } from "@/lib/future/model";
import { api, useToast } from "./client";

const COLOR: Record<string, string> = { conservative: "var(--fe-1)", base: "var(--fe-2)", optimistic: "var(--fe-3)", alternative: "var(--fe-4)" };
const NAME: Record<string, string> = { conservative: "Conservative", base: "Base case", optimistic: "Optimistic", alternative: "Alternative" };

export function FutureLab({ scenario }: { scenario: Scenario }) {
  const initial = Object.fromEntries(scenario.assumptions.map((a) => [a.key, a.value])) as Partial<Assumptions>;
  const [vals, setVals] = useState<Partial<Assumptions>>(initial);
  const [hover, setHover] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const dirty = Object.keys(vals).some((k) => vals[k as AssumptionKey] !== initial[k as AssumptionKey]);

  const runs = useMemo(() => scenario.paths.map((p) => ({ p, o: simulate({ ...vals, ...p.overrides }) })), [vals, scenario.paths]);
  const base = normalise(vals);
  const sens = useMemo(() => sensitivity(base, defaultRanges(base, scenario.assumptions.map((a) => ({ key: a.key as AssumptionKey, low: a.low, high: a.high })))).filter((s) => s.swing > 0).slice(0, 6), [vals]);

  // Chart geometry: one axis (cumulative net, £).
  const W = 720, H = 300, L = 56, R = 92, T = 16, B = 30;
  const months = Math.max(...runs.map((r) => r.o.rows.length), 1);
  const all = runs.flatMap((r) => r.o.rows.map((x) => x.cumulative));
  const ymin = Math.min(0, ...all), ymax = Math.max(0, ...all);
  const pad = (ymax - ymin) * 0.08 || 1;
  const y = (v: number) => T + ((ymax + pad - v) / (ymax - ymin + pad * 2)) * (H - T - B);
  const x = (m: number) => L + ((m - 1) / Math.max(1, months - 1)) * (W - L - R);
  const ticks = Array.from({ length: 5 }, (_, i) => ymin - pad + ((ymax - ymin + pad * 2) * i) / 4);

  // Direct labels at line ends, nudged apart.
  const ends = runs.map((r) => ({ name: r.p.name, y: y(r.o.rows.at(-1)?.cumulative ?? 0) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;

  return (
    <div className="space-y-8">
      <figure className="card p-4">
        <figcaption className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[14px] font-medium">Cumulative net cash by month</span>
          <span className="rounded-full bg-accent/12 px-2.5 py-1 text-[11px] font-semibold text-accent">Model of estimates, not a prediction</span>
        </figcaption>
        <div className="mb-2 flex flex-wrap gap-3 text-[12px] text-muted">{runs.map((r) => <span key={r.p.name} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: COLOR[r.p.name] }} />{NAME[r.p.name]}</span>)}</div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full touch-none" role="img" aria-label="Cumulative net cash for each scenario"
          onPointerMove={(e) => { const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const px = ((e.clientX - rect.left) / rect.width) * W; const m = Math.round(((px - L) / (W - L - R)) * (months - 1)) + 1; setHover(m >= 1 && m <= months ? m : null); }}
          onPointerLeave={() => setHover(null)}>
          {ticks.map((t, i) => <g key={i}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" strokeWidth={1} /><text x={L - 8} y={y(t)} dy="0.35em" textAnchor="end" fontSize={11} fill="rgb(var(--muted))">{gbpShort(t)}</text></g>)}
          <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="rgb(var(--muted))" strokeWidth={1} />
          {[1, Math.ceil(months / 2), months].map((m) => <text key={m} x={x(m)} y={H - 8} textAnchor="middle" fontSize={11} fill="rgb(var(--muted))">M{m}</text>)}
          {runs.map((r) => <polyline key={r.p.name} fill="none" stroke={COLOR[r.p.name]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={r.o.rows.map((row) => `${x(row.month)},${y(row.cumulative)}`).join(" ")} />)}
          {ends.map((e) => <text key={e.name} x={W - R + 8} y={e.y} dy="0.35em" fontSize={11.5} fill="rgb(var(--ink))">{NAME[e.name]}</text>)}
          {hover && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="rgb(var(--ink))" strokeOpacity={0.3} />
              {runs.map((r) => { const row = r.o.rows[hover - 1]; return row ? <circle key={r.p.name} cx={x(hover)} cy={y(row.cumulative)} r={4.5} fill={COLOR[r.p.name]} stroke="rgb(var(--surface))" strokeWidth={2} /> : null; })}
            </g>
          )}
        </svg>
        {hover && (
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 rounded-xl bg-raised px-3 py-2 text-[12px]">
            <span className="font-semibold">Month {hover}</span>
            {runs.map((r) => <span key={r.p.name} className="text-muted">{NAME[r.p.name]}: <span className="tabular-nums text-ink">{gbpShort(r.o.rows[hover - 1]?.cumulative ?? 0)}</span></span>)}
          </div>
        )}
        <details className="mt-2 text-[12px] text-muted"><summary className="cursor-pointer">Table view</summary>
          <div className="mt-2 overflow-x-auto"><table className="w-full text-right tabular-nums"><thead><tr><th className="text-left">Month</th>{runs.map((r) => <th key={r.p.name}>{NAME[r.p.name]}</th>)}</tr></thead><tbody>{Array.from({ length: months }, (_, i) => <tr key={i}><td className="text-left">{i + 1}</td>{runs.map((r) => <td key={r.p.name}>{gbpShort(r.o.rows[i]?.cumulative ?? 0)}</td>)}</tr>)}</tbody></table></div>
        </details>
      </figure>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {runs.map(({ p, o }) => (
          <div key={p.name} className="card p-4">
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[p.name] }} /><span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{NAME[p.name]}</span></div>
            <div className="mt-1 text-[16px] font-semibold leading-snug">{p.title}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{p.narrative}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
              <div><div className="text-faint">Net after opportunity cost</div><div className={`text-[16px] font-semibold tabular-nums ${o.net_after_opportunity < 0 ? "text-rose" : ""}`}>{gbpShort(o.net_after_opportunity)}</div></div>
              <div><div className="text-faint">Revenue at horizon</div><div className="text-[16px] font-semibold tabular-nums">{gbpShort(o.mrr_end)}/mo</div></div>
              <div><div className="text-faint">Break-even</div><div className="font-medium">{o.break_even_month ? `Month ${o.break_even_month}` : "Not within horizon"}</div></div>
              <div><div className="text-faint">Peak cash needed</div><div className="font-medium tabular-nums">{gbpShort(o.peak_cash_need)}</div></div>
              <div><div className="text-faint">Your time</div><div className="font-medium tabular-nums">{Math.round(o.total_hours)} h</div></div>
              <div><div className="text-faint">Revenue per hour</div><div className="font-medium tabular-nums">{gbpShort(o.revenue_per_hour)}</div></div>
            </div>
            {p.milestones.length > 0 && <div className="mt-3 text-[12.5px]"><span className="text-faint">Milestones: </span>{p.milestones.join(" → ")}</div>}
            {p.risks.length > 0 && <div className="mt-1 text-[12.5px]"><span className="text-faint">Risks: </span>{p.risks.join("; ")}</div>}
            {p.dependencies.length > 0 && <div className="mt-1 text-[12.5px]"><span className="text-faint">Depends on: </span>{p.dependencies.join("; ")}</div>}
          </div>
        ))}
      </div>

      {sens.length > 0 && (
        <div className="card p-4">
          <div className="text-[14px] font-medium">What moves the outcome most</div>
          <div className="mb-3 text-[12px] text-muted">Base case, net after opportunity cost, each assumption swung across its plausible range.</div>
          <div className="space-y-2">
            {sens.map((s) => {
              const max = sens[0].swing || 1;
              return (
                <div key={s.key} className="text-[12.5px]">
                  <div className="flex justify-between"><span>{s.label}</span><span className="tabular-nums text-muted">{gbpShort(Math.min(s.at_low, s.at_high))} to {gbpShort(Math.max(s.at_low, s.at_high))}</span></div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(3, (s.swing / max) * 100)}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[14px] font-medium">Assumptions (base case)</div>
          {dirty && <button disabled={saving} className="chip bg-ink text-bg" onClick={async () => { setSaving(true); await api(`/api/infinity/scenarios/${scenario.id}`, { values: vals }, "PATCH"); setSaving(false); toast({ text: "Your assumptions saved" }); router.refresh(); }}>{saving ? "Saving…" : "Save my values"}</button>}
        </div>
        <div className="mt-3 space-y-4">
          {scenario.assumptions.map((a) => {
            const meta = ASSUMPTION_META[a.key as AssumptionKey];
            if (!meta) return null;
            const v = vals[a.key as AssumptionKey] ?? a.value;
            const lo = Math.min(a.low, v), hi = Math.max(a.high, v, lo + 1e-9);
            return (
              <div key={a.key}>
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="font-medium">{meta.label}</span>
                  <span className="tabular-nums">{meta.unit === "£" || meta.unit.startsWith("£") ? gbpShort(v) + meta.unit.replace("£", "") : `${Math.round(v * 100) / 100}${meta.unit ? ` ${meta.unit}` : ""}`}</span>
                </div>
                <input type="range" min={lo} max={hi} step={(hi - lo) / 100 || 1} value={v} onChange={(e) => setVals({ ...vals, [a.key]: Number(e.target.value) })} className="mt-1 w-full accent-[rgb(var(--accent))]" aria-label={meta.label} />
                <div className="flex justify-between text-[11px] text-faint">
                  <span className={a.basis === "sourced" ? "text-sage" : a.basis === "user" ? "text-sky" : "text-accent"}>{a.basis === "sourced" ? "Sourced" : a.basis === "user" ? "Your value" : "Estimate"}{a.source_url ? <> · <a href={a.source_url} target="_blank" rel="noreferrer" className="underline">source</a></> : null}</span>
                  <span className="max-w-[70%] truncate text-right">{a.note}</span>
                </div>
              </div>
            );
          })}
        </div>
        {dirty && <button className="mt-3 text-[12px] text-muted underline" onClick={() => setVals(initial)}>Reset to the model's values</button>}
      </div>
    </div>
  );
}
