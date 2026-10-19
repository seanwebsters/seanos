"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CapTable, CopilotMessage, FinModel, PipelineEntry, VentureDoc } from "@/lib/db/types";
import { DRIVER, DRIVER_DEFS, FORMULAS, STREAMS, money, runModel, type Scenario, type StreamKey } from "@/lib/founder/finmodel";
import { sellPercent, simulateRound } from "@/lib/founder/captable";
import { api, useToast } from "./client";
import { Icon } from "./Icon";

const BASIS_STYLE: Record<string, string> = { verified: "bg-sage/15 text-sage", estimate: "bg-raised text-muted", forecast: "bg-sky/15 text-sky", scenario: "bg-accent/15 text-accent", user: "bg-ink text-bg" };
export function BasisTag({ basis }: { basis: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${BASIS_STYLE[basis] ?? "bg-raised text-muted"}`}>{basis === "user" ? "yours" : basis}</span>;
}

/* ------------------------------- Copilot ------------------------------- */

export function CopilotChat({ thread = "founder", suggestions = [], tall = false }: { thread?: string; suggestions?: string[]; tall?: boolean }) {
  const [msgs, setMsgs] = useState<CopilotMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pending = msgs.some((m) => m.status === "pending");
  const load = async () => {
    try {
      const j = await api<{ messages: CopilotMessage[] }>(`/api/founder/copilot?thread=${encodeURIComponent(thread)}`, undefined, "GET");
      setMsgs((prev) => {
        if (prev.some((m) => m.status === "pending") && !j.messages.some((m) => m.status === "pending")) router.refresh();
        return j.messages;
      });
    } catch {}
  };
  useEffect(() => { load(); }, [thread]);
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [pending]);
  // Scroll the conversation itself, never the page.
  useEffect(() => { const b = box.current; if (b) b.scrollTop = b.scrollHeight; }, [msgs.length, pending]);
  const send = async (t: string) => {
    if (!t.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api("/api/founder/copilot", { thread, text: t });
      setText("");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={box} className={`no-scrollbar flex-1 space-y-3 overflow-y-auto px-4 py-3 ${tall ? "min-h-[50vh]" : "max-h-[380px] min-h-[180px]"}`}>
        {!msgs.length && (
          <div className="space-y-2 py-2">
            <p className="text-[13.5px] text-muted">Ask your cofounder anything. It can add tasks, adjust a model driver, start agent work or record a decision. It can't send, spend or sign anything.</p>
            {suggestions.map((s) => <button key={s} onClick={() => send(s)} className="block w-full rounded-2xl bg-raised px-3 py-2 text-left text-[13px] text-ink/90 active:scale-[0.99]">{s}</button>)}
          </div>
        )}
        {msgs.map((m) => m.role === "sean" ? (
          <div key={m.id} className="ml-8 rounded-2xl rounded-br-md bg-sky/15 px-3.5 py-2.5 text-[13.5px] leading-relaxed">{m.text}</div>
        ) : (
          <div key={m.id} className="mr-4">
            <div className={`rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13.5px] leading-relaxed ring-1 ring-line ${m.status === "failed" ? "text-rose" : ""}`}>
              {m.status === "pending" ? <span className="flex items-center gap-2 text-muted"><span className="h-1.5 w-1.5 animate-pulse2 rounded-full bg-accent" /> Thinking…</span> : <span className="whitespace-pre-wrap">{m.text}</span>}
            </div>
            {m.actions.map((a, i) => (
              <Link key={i} href={a.ref ?? "#"} className={`mt-1.5 flex items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] ${a.ok ? "bg-sage/10 text-ink" : "bg-rose/10 text-rose"}`}>
                <Icon name={a.ok ? "check" : "close"} size={14} className={a.ok ? "text-sage" : ""} /> <span className="min-w-0 flex-1 truncate">{a.label}</span>{a.ref && <Icon name="chevron" size={14} className="text-faint" />}
              </Link>
            ))}
          </div>
        ))}
      </div>
      {err && <div className="px-4 text-[12px] text-rose">{err}</div>}
      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex items-center gap-2 border-t border-line p-3">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask your cofounder…" className="min-w-0 flex-1 rounded-full bg-raised px-4 py-2.5 text-[14px] outline-none placeholder:text-faint" />
        <button disabled={busy || !text.trim()} aria-label="Send" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-bg disabled:opacity-40"><Icon name="send" size={16} /></button>
      </form>
    </div>
  );
}

/* ---------------------------- Model editor ---------------------------- */

const SC: { key: Scenario; label: string; color: string }[] = [
  { key: "downside", label: "Downside", color: "var(--fe-2)" },
  { key: "base", label: "Base", color: "var(--fe-1)" },
  { key: "upside", label: "Upside", color: "var(--fe-3)" },
];

function NumberCell({ value, onChange, className = "" }: { value: number; onChange: (n: number) => void; className?: string }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return <input inputMode="decimal" value={v} onChange={(e) => { setV(e.target.value); const n = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(n)) onChange(n); }} className={`w-full rounded-xl bg-raised px-3 py-2 text-right text-[14px] tabular-nums outline-none focus:ring-1 focus:ring-accent/50 ${className}`} />;
}

export function ModelEditor({ model, ventureId, ventureName }: { model: FinModel; ventureId: string; ventureName: string }) {
  const [m, setM] = useState<FinModel>(model);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [showFormulas, setShowFormulas] = useState(false);
  const router = useRouter();
  const toast = useToast();
  useEffect(() => setM(model), [model.version]);
  const dirty = JSON.stringify(m) !== JSON.stringify(model);
  const runs = useMemo(() => Object.fromEntries(SC.map((s) => [s.key, runModel(m, s.key)])) as Record<Scenario, ReturnType<typeof runModel>>, [m]);
  const k = runs.base.kpis;
  const ccy = m.currency;
  const f = (n: number) => money(n, ccy);
  const setDriver = (key: string, value: number) => setM({ ...m, drivers: m.drivers.map((d) => (d.key === key ? { ...d, value, basis: d.basis === "verified" && d.value === value ? d.basis : "user" } : d)) });
  const save = async () => {
    setSaving(true);
    try {
      const { model: next } = await api<{ model: FinModel }>(`/api/founder/model/${ventureId}`, { currency: m.currency, starting_cash: m.starting_cash, streams: m.streams, drivers: m.drivers, opex: m.opex, team: m.team, funding: m.funding, startup_costs: m.startup_costs, actuals: m.actuals, scenarios: m.scenarios, fx: m.fx, note });
      toast({ text: `Saved as v${next.version}` });
      setNote("");
      router.refresh();
    } catch (e) {
      toast({ text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  // Cash chart: three scenarios, one axis.
  const W = 720, H = 260, L = 60, R = 86, T = 14, B = 26;
  const n = runs.base.months.length;
  const all = SC.flatMap((s) => runs[s.key].months.map((r) => r.cash));
  const ymin = Math.min(0, ...all), ymax = Math.max(0, ...all);
  const pad = (ymax - ymin) * 0.08 || 1;
  const y = (v: number) => Math.round((T + ((ymax + pad - v) / (ymax - ymin + pad * 2)) * (H - T - B)) * 10) / 10;
  const x = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - R);
  const ticks = Array.from({ length: 5 }, (_, i) => ymin - pad + ((ymax - ymin + pad * 2) * i) / 4);
  const ends = SC.map((s) => ({ ...s, y: y(runs[s.key].months.at(-1)?.cash ?? 0) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  const years = Array.from({ length: Math.ceil(n / 12) }, (_, i) => i);

  const streams = (Object.keys(STREAMS) as StreamKey[]);
  const groups: { title: string; keys: string[] }[] = [
    { title: "Timing & acquisition", keys: ["launch_month", "marketing_budget", "cac"] },
    ...streams.filter((s) => m.streams[s]).map((s) => ({ title: STREAMS[s], keys: DRIVER_DEFS.filter((d) => d.stream === s).map((d) => d.key) })),
    { title: "Unit costs", keys: ["payment_fees_pct", "ai_cost_per_user", "infra_fixed"] },
  ];

  return (
    <div className="space-y-6">
      <div className="mx-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:mx-0">
        {[
          ["Funding need", f(k.funding_need), "incl. 6-month buffer"],
          ["Year-1 revenue", f(k.revenue_y1), "forecast"],
          ["Break-even", k.break_even_month ? `Month ${k.break_even_month}` : "Not in horizon", "forecast"],
          ["Deepest cash point", f(k.min_cash), k.min_cash_month ? `month ${k.min_cash_month}, before funding` : "never below start"],
          ["Gross margin", `${Math.round(k.gross_margin * 100)}%`, "over the model"],
          ["LTV : CAC", k.ltv_cac !== null ? `${k.ltv_cac.toFixed(1)}×` : "n/a", k.ltv !== null ? `LTV ${f(k.ltv)}` : "no subscription stream"],
          ["CAC payback", k.payback_months !== null ? `${k.payback_months.toFixed(1)} mo` : "n/a", "per subscriber"],
          ["Exit ARR", f(k.arr_end), `run-rate at month ${n}`],
        ].map(([l, v, s]) => (
          <div key={l} className="card p-3.5"><div className="text-[11.5px] text-muted">{l}</div><div className="mt-0.5 text-[20px] font-semibold tabular-nums">{v}</div><div className="text-[11px] text-faint">{s}</div></div>
        ))}
      </div>

      <div className="card mx-5 p-4 lg:mx-0">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[14px] font-medium">Closing cash by scenario <span className="text-faint">(forecast, {ccy})</span></div>
          <div className="flex gap-3 text-[12px] text-muted">{SC.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-full" style={{ background: s.color }} />{s.label}</span>)}</div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Cash by scenario">
          {ticks.map((t, i) => <g key={i}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" strokeDasharray={Math.abs(t) < 1e-6 ? "" : "2 4"} /><text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--faint))">{money(t, ccy)}</text></g>)}
          <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="rgb(var(--muted))" strokeWidth="1" />
          {years.map((yr) => <text key={yr} x={x(yr * 12)} y={H - 6} fontSize="11" fill="rgb(var(--faint))">Y{yr + 1}</text>)}
          {SC.map((s) => <polyline key={s.key} fill="none" stroke={s.color} strokeWidth={s.key === "base" ? 2.5 : 1.8} points={runs[s.key].months.map((r, i) => `${x(i).toFixed(1)},${y(r.cash).toFixed(1)}`).join(" ")} />)}
          {ends.map((e) => <text key={e.key} x={W - R + 6} y={e.y + 4} fontSize="11.5" fill={e.color} fontWeight="600">{e.label}</text>)}
        </svg>
        <details className="mt-2 text-[12.5px]">
          <summary className="cursor-pointer text-muted">Show as a table</summary>
          <div className="no-scrollbar mt-2 overflow-x-auto">
            <table className="w-full tabular-nums">
              <thead><tr className="text-left text-faint"><th className="py-1 pr-3 font-medium">Year</th>{SC.map((s) => <th key={s.key} className="py-1 pr-3 text-right font-medium">{s.label} revenue</th>)}{SC.map((s) => <th key={s.key + "c"} className="py-1 pr-3 text-right font-medium">{s.label} cash</th>)}</tr></thead>
              <tbody>{years.map((yr) => <tr key={yr} className="border-t border-line"><td className="py-1 pr-3">Y{yr + 1}</td>{SC.map((s) => <td key={s.key} className="py-1 pr-3 text-right">{f(runs[s.key].months.slice(yr * 12, yr * 12 + 12).reduce((a, r) => a + r.revenue_total, 0))}</td>)}{SC.map((s) => <td key={s.key + "c"} className="py-1 pr-3 text-right">{f(runs[s.key].months[Math.min(n - 1, yr * 12 + 11)].cash)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </details>
      </div>

      <div className="mx-5 flex flex-wrap items-center gap-2 lg:mx-0">
        <select value={m.currency} onChange={(e) => setM({ ...m, currency: e.target.value as "GBP" | "USD" })} className="rounded-full bg-raised px-3 py-1.5 text-[13px]"><option>GBP</option><option>USD</option></select>
        <span className="text-[12px] text-muted">FX £1 = ${m.fx.gbp_usd.toFixed(4)} · {m.fx.as_of} · {m.fx.source}</span>
        <button className="chip" onClick={async () => { try { await api(`/api/founder/model/${ventureId}`, { action: "refresh_fx" }); router.refresh(); } catch (e) { toast({ text: (e as Error).message }); } }}><Icon name="refresh" size={13} /> Refresh rate</button>
        <a className="chip" href={`/api/founder/model/${ventureId}?format=csv`}><Icon name="upload" size={13} /> Export CSV</a>
        <a className="chip" href={`/api/founder/model/${ventureId}?format=csv&scenario=downside`}>Downside CSV</a>
        <button className="chip" onClick={() => setShowFormulas(!showFormulas)}>{showFormulas ? "Hide" : "Show"} formulas</button>
      </div>
      {showFormulas && <div className="card mx-5 space-y-1 p-4 font-mono text-[11.5px] leading-relaxed text-muted lg:mx-0">{Object.values(FORMULAS).map((x) => <div key={x}>{x}</div>)}</div>}

      <div className="mx-5 lg:mx-0">
        <div className="eyebrow mb-2">Revenue streams</div>
        <div className="flex flex-wrap gap-2">{streams.map((s) => <button key={s} onClick={() => setM({ ...m, streams: { ...m.streams, [s]: !m.streams[s] } })} className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${m.streams[s] ? "bg-ink text-bg" : "bg-raised text-muted"}`}>{STREAMS[s]}</button>)}</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <div key={g.title} className="card mx-5 p-4 lg:mx-0">
            <div className="mb-2 text-[14px] font-medium">{g.title}</div>
            <div className="space-y-2.5">
              {g.keys.map((key) => {
                const d = m.drivers.find((x) => x.key === key);
                const def = DRIVER[key];
                if (!d || !def) return null;
                return (
                  <div key={key}>
                    <div className="grid grid-cols-[1fr_92px_70px_70px] items-center gap-1.5">
                      <div className="min-w-0"><div className="truncate text-[13px]" title={def.help}>{def.label}</div><div className="flex items-center gap-1.5"><BasisTag basis={d.basis} />{d.source_url && <a href={d.source_url} target="_blank" rel="noreferrer" className="truncate text-[11px] text-accent">source</a>}</div></div>
                      <NumberCell value={d.value} onChange={(v) => setDriver(key, v)} />
                      <NumberCell value={m.scenarios.downside[key] ?? d.value} onChange={(v) => setM({ ...m, scenarios: { ...m.scenarios, downside: { ...m.scenarios.downside, [key]: v } } })} className="text-[12px] text-muted" />
                      <NumberCell value={m.scenarios.upside[key] ?? d.value} onChange={(v) => setM({ ...m, scenarios: { ...m.scenarios, upside: { ...m.scenarios.upside, [key]: v } } })} className="text-[12px] text-muted" />
                    </div>
                    {d.note && <div className="mt-0.5 text-[11.5px] text-faint">{d.note}</div>}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 grid grid-cols-[1fr_92px_70px_70px] gap-1.5 text-right text-[10.5px] uppercase tracking-wide text-faint"><span /><span>Base</span><span>Down</span><span>Up</span></div>
          </div>
        ))}
      </div>

      <LineEditor title="Operating costs (monthly)" rows={m.opex} cols={[["name", "Cost", "text"], ["monthly", "Monthly", "num"], ["start_month", "From month", "num"], ["growth_pct", "Growth %/mo", "num"]]} blank={{ name: "", monthly: 0, start_month: 1, growth_pct: 0 }} onChange={(opex) => setM({ ...m, opex })} />
      <LineEditor title="Team" rows={m.team} cols={[["role", "Role", "text"], ["monthly_cost", "Monthly cost", "num"], ["start_month", "From month", "num"]]} blank={{ role: "", monthly_cost: 0, start_month: 1 }} onChange={(team) => setM({ ...m, team })} />
      <LineEditor title="Startup costs (month 1)" rows={m.startup_costs} cols={[["item", "Item", "text"], ["amount", "Amount", "num"]]} blank={{ item: "", amount: 0, basis: "user" as const }} onChange={(startup_costs) => setM({ ...m, startup_costs })} />
      <LineEditor title="Funding in (planned)" rows={m.funding} cols={[["month", "Month", "num"], ["amount", "Amount", "num"], ["kind", "Kind", "text"], ["note", "Note", "text"]]} blank={{ month: 6, amount: 0, kind: "equity" as const, note: "" }} onChange={(funding) => setM({ ...m, funding })} />
      <div className="mx-5 lg:mx-0">
        <div className="mb-2 flex items-center gap-2"><span className="text-[13px]">Starting cash</span><div className="w-36"><NumberCell value={m.starting_cash} onChange={(v) => setM({ ...m, starting_cash: v })} /></div></div>
      </div>
      <LineEditor title="Actuals (what really happened)" hint="Enter real monthly figures to track variance against the plan." rows={m.actuals} cols={[["month", "Month (YYYY-MM)", "text"], ["revenue", "Revenue", "num"], ["costs", "Costs", "num"], ["cash", "Cash", "num"]]} blank={{ month: new Date().toISOString().slice(0, 7), revenue: 0, costs: 0, cash: 0 }} onChange={(actuals) => setM({ ...m, actuals })} />

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+120px)] z-20 mx-5 lg:bottom-4 lg:mx-0">
        {dirty && (
          <div className="glass flex items-center gap-2 rounded-full p-1.5 pl-4 shadow-xl ring-1 ring-line">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed? (saved with the version)" className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-faint" />
            <button onClick={() => setM(model)} className="chip">Discard</button>
            <button onClick={save} disabled={saving} className="btn-primary py-2">{saving ? "Saving…" : `Save v${model.version + 1}`}</button>
          </div>
        )}
      </div>
      <p className="mx-5 text-[12px] text-faint lg:mx-0">{ventureName} model v{model.version}: every output is a forecast from the assumptions above. Revenue, company valuation and your personal wealth are different things.</p>
    </div>
  );
}

type Col = [string, string, "text" | "num"];
function LineEditor<T extends Record<string, unknown>>({ title, hint, rows, cols, blank, onChange }: { title: string; hint?: string; rows: T[]; cols: Col[]; blank: T; onChange: (rows: T[]) => void }) {
  return (
    <div className="card mx-5 p-4 lg:mx-0">
      <div className="flex items-center justify-between"><div className="text-[14px] font-medium">{title}</div><button className="chip" onClick={() => onChange([...rows, { ...blank }])}><Icon name="plus" size={13} /> Add</button></div>
      {hint && <div className="mt-0.5 text-[12px] text-faint">{hint}</div>}
      {rows.length > 0 && (
        <div className="no-scrollbar mt-3 overflow-x-auto">
          <div className="min-w-[440px] space-y-1.5">
            <div className="grid gap-1.5 text-[10.5px] uppercase tracking-wide text-faint" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr)) 28px` }}>{cols.map((c) => <span key={c[0]}>{c[1]}</span>)}<span /></div>
            {rows.map((r, i) => (
              <div key={i} className="grid items-center gap-1.5" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr)) 28px` }}>
                {cols.map(([key, , type]) => type === "num"
                  ? <NumberCell key={key} value={Number(r[key] ?? 0)} onChange={(v) => onChange(rows.map((x, j) => (j === i ? { ...x, [key]: v } : x)))} />
                  : <input key={key} value={String(r[key] ?? "")} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, [key]: e.target.value } : x)))} className="w-full rounded-xl bg-raised px-3 py-2 text-[13.5px] outline-none" />)}
                <button aria-label="Remove" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-faint"><Icon name="close" size={16} /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------- Round simulator --------------------------- */

export function RoundSim({ cap, ventureId }: { cap: CapTable; ventureId: string }) {
  const r0 = cap.rounds.find((r) => r.status === "modelled");
  const [pre, setPre] = useState(r0?.pre_money ?? 750000);
  const [amt, setAmt] = useState(r0?.amount ?? 150000);
  const [pool, setPool] = useState(r0?.pool_top_up_pct ?? 10);
  const [pct, setPct] = useState(15);
  const [holders, setHolders] = useState(cap.holders);
  const router = useRouter();
  const toast = useToast();
  const sim = simulateRound(holders, pre, amt, pool);
  const sell = sellPercent(pct, amt);
  const ccy = cap.currency;
  const f = (n: number) => money(n, ccy);
  return (
    <div className="space-y-4">
      <div className="card mx-5 p-4 lg:mx-0">
        <div className="text-[14px] font-medium">Round simulator <span className="text-faint">(scenario)</span></div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <label className="text-[12px] text-muted">Pre-money<NumberCell value={pre} onChange={setPre} /></label>
          <label className="text-[12px] text-muted">Raise<NumberCell value={amt} onChange={setAmt} /></label>
          <label className="text-[12px] text-muted">Pool post-round %<NumberCell value={pool} onChange={setPool} /></label>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-raised p-2.5"><div className="text-[11px] text-muted">Post-money</div><div className="font-semibold tabular-nums">{f(sim.post_money)}</div></div>
          <div className="rounded-2xl bg-raised p-2.5"><div className="text-[11px] text-muted">Investors get</div><div className="font-semibold tabular-nums">{(sim.investor_pct * 100).toFixed(1)}%</div></div>
          <div className="rounded-2xl bg-raised p-2.5"><div className="text-[11px] text-muted">Price / share</div><div className="font-semibold tabular-nums">{money(sim.price_per_share, ccy, 3)}</div></div>
        </div>
        <table className="mt-3 w-full text-[13px] tabular-nums">
          <thead><tr className="text-left text-[11px] text-faint"><th className="py-1 font-medium">Holder</th><th className="py-1 text-right font-medium">Before</th><th className="py-1 text-right font-medium">After</th><th className="py-1 text-right font-medium">Paper value*</th></tr></thead>
          <tbody>{sim.holders.map((h) => <tr key={h.name} className="border-t border-line"><td className="py-1.5 pr-2">{h.name}</td><td className="text-right">{(h.before_pct * 100).toFixed(1)}%</td><td className="text-right">{(h.after_pct * 100).toFixed(1)}%</td><td className="text-right">{f(h.paper_value)}</td></tr>)}<tr className="border-t border-line"><td className="py-1.5">New investors</td><td className="text-right">–</td><td className="text-right">{(sim.investor_pct * 100).toFixed(1)}%</td><td className="text-right">{f(amt)}</td></tr></tbody>
        </table>
        <p className="mt-2 text-[11.5px] text-faint">*Paper value is shares × round price. It isn&apos;t cash or personal wealth, and an unpriced instrument (ASA, SAFE) converts later on different terms.</p>
      </div>
      <div className="card mx-5 p-4 lg:mx-0">
        <div className="text-[14px] font-medium">What would selling X% mean?</div>
        <div className="mt-2 flex items-center gap-2 text-[13px]">Sell <div className="w-20"><NumberCell value={pct} onChange={setPct} /></div>% for {f(amt)}</div>
        <div className="mt-2 text-[13.5px]">Implies a <b>{f(sell.pre_money)}</b> pre-money and <b>{f(sell.post_money)}</b> post-money valuation (before any pool top-up).</div>
      </div>
      <div className="card mx-5 p-4 lg:mx-0">
        <div className="flex items-center justify-between"><div className="text-[14px] font-medium">Cap table <span className="text-faint">({cap.basis === "user" ? "entered by you" : "placeholder"})</span></div><button className="chip" onClick={() => setHolders([...holders, { name: "", kind: "other", shares: 0 }])}><Icon name="plus" size={13} /> Holder</button></div>
        <div className="mt-2 space-y-1.5">
          {holders.map((h, i) => (
            <div key={i} className="grid grid-cols-[1fr_96px_110px_24px] items-center gap-1.5">
              <input value={h.name} onChange={(e) => setHolders(holders.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="w-full rounded-xl bg-raised px-3 py-2 text-[13px] outline-none" />
              <select value={h.kind} onChange={(e) => setHolders(holders.map((x, j) => (j === i ? { ...x, kind: e.target.value as typeof h.kind } : x)))} className="rounded-xl bg-raised px-2 py-2 text-[13px]">{["founder", "investor", "pool", "other"].map((k) => <option key={k}>{k}</option>)}</select>
              <NumberCell value={h.shares} onChange={(v) => setHolders(holders.map((x, j) => (j === i ? { ...x, shares: v } : x)))} />
              <button aria-label="Remove" onClick={() => setHolders(holders.filter((_, j) => j !== i))} className="text-faint"><Icon name="close" size={15} /></button>
            </div>
          ))}
        </div>
        <button className="btn-primary mt-3 py-2" onClick={async () => { await api(`/api/founder/captable/${ventureId}`, { holders, rounds: [...cap.rounds.filter((r) => r.status === "closed"), { name: r0?.name ?? "Next round (modelled)", pre_money: pre, amount: amt, pool_top_up_pct: pool, status: "modelled", date: null }] }); toast({ text: "Cap table saved" }); router.refresh(); }}>Save cap table & round</button>
      </div>
    </div>
  );
}

/* ------------------------------ Checklists ------------------------------ */

const NEXT: Record<string, VentureDoc["checklist"][number]["status"]> = { todo: "doing", doing: "done", done: "na", na: "todo" };
export function Checklist({ doc }: { doc: Pick<VentureDoc, "id" | "checklist"> }) {
  const [items, setItems] = useState(doc.checklist);
  const router = useRouter();
  const done = items.filter((c) => c.status === "done").length, total = items.filter((c) => c.status !== "na").length || 1;
  const save = async (next: typeof items) => {
    setItems(next);
    await api(`/api/entity/venture_docs/${doc.id}`, { checklist: next }, "PATCH");
    router.refresh();
  };
  return (
    <div>
      <div className="mb-2 flex items-center gap-3 px-5 lg:px-0"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-sage" style={{ width: `${(done / total) * 100}%` }} /></div><span className="text-[12px] tabular-nums text-muted">{done}/{total}</span></div>
      <div className="mx-5 divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-line/70 lg:mx-0">
        {items.map((c, i) => (
          <button key={i} onClick={() => save(items.map((x, j) => (j === i ? { ...x, status: NEXT[x.status] } : x)))} className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-raised">
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ${c.status === "done" ? "bg-sage text-white ring-sage" : c.status === "doing" ? "bg-accent/20 ring-accent" : c.status === "na" ? "bg-raised ring-line" : "ring-line"}`}>{c.status === "done" && <Icon name="check" size={13} />}{c.status === "doing" && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}</span>
            <span className="min-w-0 flex-1"><span className={`block text-[14px] ${c.status === "na" ? "text-faint line-through" : ""}`}>{c.item}</span>{(c.note || c.due) && <span className="block text-[12px] text-muted">{[c.note, c.due && `due ${c.due}`].filter(Boolean).join(" · ")}</span>}</span>
            <span className="text-[11px] uppercase text-faint">{c.status}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function TaskCheck({ id, done }: { id: string; done: boolean }) {
  const [d, setD] = useState(done);
  const router = useRouter();
  return (
    <button aria-label={d ? "Mark not done" : "Mark done"} onClick={async (e) => { e.preventDefault(); setD(!d); await api(`/api/entity/venture_tasks/${id}`, { status: d ? "todo" : "done" }, "PATCH"); router.refresh(); }} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ${d ? "bg-sage text-white ring-sage" : "ring-line"}`}>
      {d && <Icon name="check" size={13} />}
    </button>
  );
}

/* ------------------------------- Pipeline ------------------------------- */

const STAGES: PipelineEntry["stage"][] = ["researching", "shortlisted", "contacted", "meeting", "diligence", "term_sheet", "committed", "passed"];
export function PipelineControls({ entry }: { entry: Pick<PipelineEntry, "id" | "stage" | "warm_intro"> }) {
  const [intro, setIntro] = useState(false);
  const [via, setVia] = useState(entry.warm_intro?.via ?? "");
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={entry.stage} onChange={async (e) => { await api(`/api/founder/pipeline/${entry.id}`, { action: "stage", stage: e.target.value }); router.refresh(); }} className="rounded-full bg-raised px-3 py-1.5 text-[12.5px] font-medium">
        {STAGES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
      </select>
      <button className="chip" onClick={() => setIntro(!intro)}>{entry.warm_intro ? `Intro: ${entry.warm_intro.via}` : "Document an intro"}</button>
      <button className="chip" onClick={async () => { const j = await api<{ task: { id: string } }>(`/api/founder/pipeline/${entry.id}`, { action: "draft" }); toast({ text: "Drafting for your review", href: `/tasks/${j.task.id}` }); }}><Icon name="edit" size={13} /> Draft outreach</button>
      {intro && (
        <form className="flex w-full items-center gap-2" onSubmit={async (e) => { e.preventDefault(); await api(`/api/founder/pipeline/${entry.id}`, { action: "intro", via }); setIntro(false); router.refresh(); }}>
          <input value={via} onChange={(e) => setVia(e.target.value)} placeholder="Who is introducing you? (leave blank to clear)" className="field py-2 text-[13px]" />
          <button className="btn-primary py-2">Save</button>
        </form>
      )}
    </div>
  );
}

/* ------------------------------ New venture ------------------------------ */

export function NewVentureForm() {
  const [name, setName] = useState("");
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  return (
    <form className="space-y-3 px-5 lg:px-0" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      setErr(null);
      try {
        const j = await api<{ venture: { id: string } }>("/api/founder/ventures", { name, idea });
        router.push(`/founder/v/${j.venture.id}`);
      } catch (x) {
        setErr((x as Error).message);
        setBusy(false);
      }
    }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className="field" />
      <textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={6} placeholder="Describe the idea, however rough. Who it's for, what it does, why you." className="field" />
      {err && <div className="text-[13px] text-rose">{err}</div>}
      <button disabled={busy || (!name.trim() && !idea.trim())} className="btn-primary w-full">{busy ? "Starting…" : "Build the business"}</button>
      <p className="text-[12px] text-faint">Strategist, CFO, Fundraising, Investor Research, Operations and Legal agents work through it in order (roughly 10–15 agent calls, typically £0.50–£1.50 in API cost). Nothing is sent or published.</p>
    </form>
  );
}

/* --------------------------- Companies House --------------------------- */

export function CompaniesSearch({ initial, connected }: { initial: string; connected: boolean }) {
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<{ name: string; number: string; status: string; created: string | null; url: string }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [isConnected, setConnected] = useState(connected);
  const search = async () => {
    setErr(null);
    try {
      setItems((await api<{ items: NonNullable<typeof items> }>(`/api/founder/companies?q=${encodeURIComponent(q)}`, undefined, "GET")).items);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <div className="card mx-5 p-4 lg:mx-0">
      <div className="text-[14px] font-medium">Name check: Companies House <span className="text-faint">(live, UK)</span></div>
      {!isConnected ? (
        <form className="mt-2 space-y-2" onSubmit={async (e) => { e.preventDefault(); try { await api("/api/founder/credentials", { provider: "companies_house", secret: key }); setConnected(true); setKey(""); } catch (x) { setErr((x as Error).message); } }}>
          <p className="text-[12.5px] text-muted">Add a free API key from developer.company-information.service.gov.uk. It&apos;s stored encrypted and never sent to the browser.</p>
          <input value={key} onChange={(e) => setKey(e.target.value)} type="password" placeholder="Companies House API key" className="field py-2 text-[13px]" />
          <button className="btn-primary py-2">Connect</button>
        </form>
      ) : (
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} className="field py-2 text-[13px]" />
          <button className="btn-primary py-2">Search</button>
        </form>
      )}
      {err && <div className="mt-2 text-[12.5px] text-rose">{err}</div>}
      {items && (items.length ? (
        <div className="mt-3 divide-y divide-line">{items.map((c) => <a key={c.number} href={c.url} target="_blank" rel="noreferrer" className="flex items-center justify-between py-2 text-[13px]"><span>{c.name}</span><span className="text-[11.5px] text-muted">{c.status} · {c.created ?? ""}</span></a>)}</div>
      ) : <div className="mt-3 text-[13px] text-sage">No registered companies match.</div>)}
      <p className="mt-2 text-[11.5px] text-faint">A clear register isn&apos;t a trademark clearance. Check the UKIPO register and get professional advice before committing to a name.</p>
    </div>
  );
}

/* ------------------------------- Manage ------------------------------- */

export function VentureManage({ id, others, archived }: { id: string; others: { id: string; name: string }[]; archived: boolean }) {
  const [into, setInto] = useState("");
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={into} onChange={(e) => setInto(e.target.value)} className="rounded-full bg-raised px-3 py-1.5 text-[12.5px]"><option value="">Merge into…</option>{others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      {into && <button className="chip" onClick={async () => { if (!window.confirm("Move this venture's tasks, documents and investors into the other one? The original stays in history.")) return; const j = await api<{ into: string }>(`/api/founder/ventures/${id}`, { action: "merge", into }); router.push(`/founder/v/${j.into}`); }}>Merge</button>}
      <button className="chip" onClick={async () => { await api(`/api/founder/ventures/${id}`, { action: archived ? "restore" : "archive" }); router.refresh(); }}>{archived ? "Restore" : "Archive"}</button>
    </div>
  );
}
