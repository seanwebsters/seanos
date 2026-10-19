/** Growth maths shared by the server and the Growth tab. Pure functions over real metric rows. */
import type { Experiment, GrowthMetric, GrowthMetricKey } from "@/lib/db/types";

export const METRICS: Record<GrowthMetricKey, { label: string; money?: boolean; flow: boolean }> = {
  installs: { label: "Installs", flow: true },
  signups: { label: "Sign-ups", flow: true },
  waitlist: { label: "Waitlist joins", flow: true },
  active_users: { label: "Active users", flow: false },
  paid_users: { label: "Paying users", flow: false },
  revenue: { label: "Revenue", money: true, flow: true },
  spend: { label: "Marketing spend", money: true, flow: true },
  impressions: { label: "Impressions", flow: true },
  clicks: { label: "Clicks", flow: true },
};
export const METRIC_KEYS = Object.keys(METRICS) as GrowthMetricKey[];

/**
 * Flow metrics (installs, revenue…) are summed over a window; stock metrics
 * (active or paying users) take the latest value in it.
 */
export function windowValue(rows: GrowthMetric[], metric: GrowthMetricKey, from: string, to: string): number | null {
  const r = rows.filter((x) => x.metric === metric && x.date >= from && x.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  if (!r.length) return null;
  return METRICS[metric].flow ? r.reduce((s, x) => s + x.value, 0) : r.at(-1)!.value;
}

/** Deterministic verdict: the model never decides whether an experiment worked. */
export function scoreExperiment(e: Pick<Experiment, "metric" | "target" | "started_at" | "ends_at">, rows: GrowthMetric[], today: string): NonNullable<Experiment["result"]> {
  const from = (e.started_at ?? today).slice(0, 10);
  const to = ((e.ends_at ?? today).slice(0, 10) < today ? e.ends_at! : today).slice(0, 10);
  const value = windowValue(rows, e.metric, from, to);
  if (value === null) return { value: null, verdict: "no_data", note: `No ${METRICS[e.metric].label.toLowerCase()} recorded between ${from} and ${to}.` };
  const ratio = e.target > 0 ? value / e.target : 0;
  const verdict = ratio >= 1 ? "win" : ratio >= 0.6 ? "inconclusive" : "loss";
  return { value, verdict, note: `${fmt(value, e.metric)} against a target of ${fmt(e.target, e.metric)} (${Math.round(ratio * 100)}%).` };
}

export function fmt(n: number, metric: GrowthMetricKey) {
  return METRICS[metric].money ? `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}` : n.toLocaleString("en-GB", { maximumFractionDigits: 0 });
}

/** Money committed this calendar month: budgets of experiments started this month, or actual spend if higher. */
export function committedThisMonth(exps: Experiment[], month: string) {
  return exps.filter((e) => ["running", "done", "killed"].includes(e.status) && (e.started_at ?? "").slice(0, 7) === month).reduce((s, e) => s + Math.max(e.budget, e.spent), 0);
}

export function addDaysIso(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Parses "date,metric,value" rows or a wide sheet ("date,installs,revenue,…"). */
export function parseMetricsCsv(csv: string): { rows: { date: string; metric: GrowthMetricKey; value: number }[]; skipped: number } {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], skipped: 0 };
  // Comma-separated with "quoted, fields" (e.g. "£1,234").
  const split = (l: string) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === "," && !q) { out.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const head = split(lines[0]).map((h) => h.toLowerCase().replace(/[\s-]+/g, "_"));
  const norm = (d: string) => {
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
  };
  const num = (v: string) => Number(v.replace(/[£$,\s]/g, ""));
  const rows: { date: string; metric: GrowthMetricKey; value: number }[] = [];
  let skipped = 0;
  const di = head.indexOf("date");
  if (di < 0) return { rows, skipped: lines.length };
  const long = head.includes("metric") && head.includes("value");
  for (const l of lines.slice(1)) {
    const c = split(l);
    const date = norm(c[di] ?? "");
    if (!date) { skipped++; continue; }
    if (long) {
      const metric = (c[head.indexOf("metric")] ?? "").toLowerCase().replace(/[\s-]+/g, "_") as GrowthMetricKey;
      const value = num(c[head.indexOf("value")] ?? "");
      if (!METRICS[metric] || !Number.isFinite(value)) { skipped++; continue; }
      rows.push({ date, metric, value });
    } else {
      let any = false;
      head.forEach((h, i) => {
        if (i === di || !METRICS[h as GrowthMetricKey] || c[i] === undefined || c[i] === "") return;
        const value = num(c[i]);
        if (Number.isFinite(value)) { rows.push({ date, metric: h as GrowthMetricKey, value }); any = true; }
      });
      if (!any) skipped++;
    }
  }
  return { rows, skipped };
}
