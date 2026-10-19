"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { GrowthMetric, GrowthMetricKey } from "@/lib/db/types";
import { METRICS, METRIC_KEYS, addDaysIso, fmt } from "@/lib/founder/growth-core";
import { api, useToast } from "./client";
import { Icon } from "./Icon";

export function CapEditor({ ventureId, cap, committed }: { ventureId: string; cap: number; committed: number }) {
  const [v, setV] = useState(String(cap || ""));
  const router = useRouter();
  const toast = useToast();
  const pct = cap ? Math.min(100, (committed / cap) * 100) : 0;
  return (
    <div className="card mx-5 p-4 lg:mx-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-medium">Monthly growth cap</div>
          <div className="text-[12px] text-muted">{cap ? `£${committed.toLocaleString("en-GB")} of £${cap.toLocaleString("en-GB")} committed this month` : "£0: only free experiments can start until you set a cap"}</div>
        </div>
        <form className="flex items-center gap-1.5" onSubmit={async (e) => { e.preventDefault(); try { await api(`/api/founder/growth/${ventureId}`, { action: "cap", cap: Number(v || 0) }); toast({ text: "Cap saved" }); router.refresh(); } catch (x) { toast({ text: (x as Error).message }); } }}>
          <span className="text-[14px] text-muted">£</span>
          <input inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ""))} placeholder="0" className="w-20 rounded-xl bg-raised px-3 py-2 text-right text-[14px] tabular-nums outline-none" />
          <button className="chip">Save</button>
        </form>
      </div>
      {cap > 0 && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised"><div className={`h-full rounded-full ${pct >= 90 ? "bg-rose" : "bg-sage"}`} style={{ width: `${pct}%` }} /></div>}
      <p className="mt-2 text-[11.5px] text-faint">The team can't spend anything itself. The cap limits which paid experiments you can approve; you run the ads and record what you actually spent.</p>
    </div>
  );
}

export function MetricEntry({ ventureId, today }: { ventureId: string; today: string }) {
  const [date, setDate] = useState(today);
  const [metric, setMetric] = useState<GrowthMetricKey>("installs");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="card mx-5 p-4 lg:mx-0">
      <div className="text-[14px] font-medium">Record real numbers</div>
      <div className="text-[12px] text-muted">From App Store Connect, Google Play, Stripe, RevenueCat, your analytics or ad dashboards. Results are judged only on these.</div>
      <form className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-[1fr_1fr_1fr_auto] [&>*]:min-w-0" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try { await api(`/api/founder/growth/${ventureId}`, { action: "metric", date, metric, value: Number(value) }); setValue(""); toast({ text: `${METRICS[metric].label} saved for ${date}` }); router.refresh(); }
        catch (x) { toast({ text: (x as Error).message }); }
        finally { setBusy(false); }
      }}>
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="rounded-xl bg-raised px-3 py-2 text-[13.5px] outline-none" />
        <select value={metric} onChange={(e) => setMetric(e.target.value as GrowthMetricKey)} className="rounded-xl bg-raised px-3 py-2 text-[13.5px]">{METRIC_KEYS.map((k) => <option key={k} value={k}>{METRICS[k].label}</option>)}</select>
        <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={METRICS[metric].money ? "£" : "Value"} className="rounded-xl bg-raised px-3 py-2 text-right text-[13.5px] tabular-nums outline-none" />
        <button disabled={busy || value === ""} className="btn-primary py-2">Save</button>
      </form>
      <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12.5px] text-muted">
        <Icon name="upload" size={14} /> Import a CSV (date + columns like installs, signups, revenue, spend; or date, metric, value)
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try { const j = await api<{ added: number; updated: number; skipped: number }>(`/api/founder/growth/${ventureId}`, { action: "csv", csv: await f.text() }); toast({ text: `${j.added} added, ${j.updated} updated${j.skipped ? `, ${j.skipped} rows skipped` : ""}` }); router.refresh(); }
          catch (x) { toast({ text: (x as Error).message }); }
          e.target.value = "";
        }} />
      </label>
    </div>
  );
}

export function MetricChart({ rows, today }: { rows: GrowthMetric[]; today: string }) {
  const present = METRIC_KEYS.filter((k) => rows.some((r) => r.metric === k));
  const [metric, setMetric] = useState<GrowthMetricKey>(present[0] ?? "installs");
  const days = 42;
  const series = useMemo(() => Array.from({ length: days }, (_, i) => {
    const date = addDaysIso(today, i - days + 1);
    const r = rows.find((x) => x.metric === metric && x.date === date);
    return { date, value: r ? r.value : null };
  }), [rows, metric, today]);
  if (!present.length) return null;
  const max = Math.max(1, ...series.map((s) => s.value ?? 0));
  const W = 640, H = 170, L = 44, B = 22, bw = (W - L) / days;
  const ticks = [0, max / 2, max];
  return (
    <div className="card mx-5 p-4 lg:mx-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-auto text-[14px] font-medium">Last 6 weeks <span className="text-faint">(recorded)</span></span>
        {present.map((k) => <button key={k} onClick={() => setMetric(k)} className={`rounded-full px-2.5 py-1 text-[11.5px] ${metric === k ? "bg-ink text-bg" : "bg-raised text-muted"}`}>{METRICS[k].label}</button>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`${METRICS[metric].label} per day`}>
        {ticks.map((t, i) => { const y = Math.round((H - B - (t / max) * (H - B - 8)) * 10) / 10; return <g key={i}><line x1={L} x2={W} y1={y} y2={y} stroke="rgb(var(--line))" strokeDasharray={i ? "2 4" : ""} /><text x={L - 6} y={y + 4} textAnchor="end" fontSize="10" fill="rgb(var(--faint))">{fmt(t, metric)}</text></g>; })}
        {series.map((s, i) => s.value === null ? null : <rect key={s.date} x={Math.round((L + i * bw + 1) * 10) / 10} y={Math.round((H - B - (s.value / max) * (H - B - 8)) * 10) / 10} width={Math.max(1, bw - 2)} height={Math.max(0.5, Math.round(((s.value / max) * (H - B - 8)) * 10) / 10)} rx="1.5" fill="var(--fe-1)"><title>{`${s.date}: ${fmt(s.value, metric)}`}</title></rect>)}
        {[0, 14, 28, 41].map((i) => <text key={i} x={i === 41 ? W : L + i * bw} y={H - 6} fontSize="10" textAnchor={i === 41 ? "end" : "start"} fill="rgb(var(--faint))">{series[i].date.slice(5)}</text>)}
      </svg>
      <details className="mt-1 text-[12px]"><summary className="cursor-pointer text-muted">Table</summary>
        <table className="mt-1 w-full tabular-nums"><tbody>{series.filter((s) => s.value !== null).reverse().map((s) => <tr key={s.date} className="border-t border-line"><td className="py-0.5">{s.date}</td><td className="text-right">{fmt(s.value!, metric)}</td></tr>)}</tbody></table>
      </details>
    </div>
  );
}

export function SpendLog({ ventureId, id, spent }: { ventureId: string; id: string; spent: number }) {
  const [v, setV] = useState(String(spent || ""));
  const router = useRouter();
  return (
    <form className="flex items-center gap-1.5" onSubmit={async (e) => { e.preventDefault(); await api(`/api/founder/growth/${ventureId}`, { action: "spend", id, value: Number(v || 0) }); router.refresh(); }}>
      <span className="text-[12px] text-muted">Spent £</span>
      <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} className="w-16 rounded-lg bg-raised px-2 py-1 text-right text-[12.5px] tabular-nums outline-none" />
      <button className="chip !py-1">Save</button>
    </form>
  );
}
