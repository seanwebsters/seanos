/**
 * Founder OS financial engine: a driver-based monthly model. Every output
 * line has a stated formula (FORMULAS) so the model is auditable, and the
 * same pure functions run on the server and in the editor.
 */
import type { Driver, FinModel } from "@/lib/db/types";

export const STREAMS = {
  subscription: "Subscriptions",
  advertising: "Advertising",
  licensing: "Licensing",
  merch: "Merchandise",
  b2b: "B2B contracts",
  one_off: "One-off sales",
} as const;
export type StreamKey = keyof typeof STREAMS;

/** The model's drivers. Defaults are zero so nothing is invented. */
export const DRIVER_DEFS: { key: string; label: string; unit: string; stream?: StreamKey; pct?: boolean; help: string }[] = [
  { key: "launch_month", label: "Revenue starts in month", unit: "", help: "First month any revenue arrives." },
  { key: "sub_price", label: "Subscription price", unit: "/mo", stream: "subscription", help: "Average monthly price per paying subscriber." },
  { key: "sub_start", label: "Subscribers at launch", unit: "", stream: "subscription", help: "Paying subscribers in the launch month." },
  { key: "sub_organic_new", label: "Organic new subscribers", unit: "/mo", stream: "subscription", help: "New paying subscribers per month without paid marketing." },
  { key: "sub_organic_growth", label: "Organic growth", unit: "%/mo", stream: "subscription", pct: true, help: "Monthly growth in organic acquisition." },
  { key: "sub_churn", label: "Subscriber churn", unit: "%/mo", stream: "subscription", pct: true, help: "Share of subscribers lost each month." },
  { key: "marketing_budget", label: "Paid marketing", unit: "/mo", help: "Monthly paid acquisition spend (from launch)." },
  { key: "cac", label: "Customer acquisition cost", unit: "", help: "Paid marketing ÷ new paying customers from paid channels." },
  { key: "free_users_start", label: "Free users at launch", unit: "", stream: "advertising", help: "Active free users in the launch month." },
  { key: "free_users_growth", label: "Free user growth", unit: "%/mo", stream: "advertising", pct: true, help: "Monthly growth in active free users." },
  { key: "impressions_per_user", label: "Ad impressions per user", unit: "/mo", stream: "advertising", help: "Monthly ad impressions per active free user." },
  { key: "cpm", label: "CPM", unit: "per 1,000", stream: "advertising", help: "Revenue per thousand impressions." },
  { key: "licensing_deals_per_quarter", label: "Licensing deals", unit: "/quarter", stream: "licensing", help: "New licensing deals signed per quarter." },
  { key: "licensing_deal_value", label: "Licensing deal value", unit: "", stream: "licensing", help: "Average revenue per deal, recognised in the month signed." },
  { key: "merch_monthly", label: "Merchandise sales", unit: "/mo", stream: "merch", help: "Monthly merchandise revenue at launch." },
  { key: "merch_growth", label: "Merchandise growth", unit: "%/mo", stream: "merch", pct: true, help: "Monthly growth in merchandise sales." },
  { key: "merch_margin", label: "Merchandise gross margin", unit: "%", stream: "merch", pct: true, help: "Merch revenue minus production and fulfilment." },
  { key: "b2b_clients_start", label: "B2B clients at launch", unit: "", stream: "b2b", help: "Paying business clients in the launch month." },
  { key: "b2b_new_per_quarter", label: "New B2B clients", unit: "/quarter", stream: "b2b", help: "New clients per quarter." },
  { key: "b2b_contract_value", label: "B2B contract value", unit: "/mo", stream: "b2b", help: "Average monthly revenue per client." },
  { key: "b2b_churn", label: "B2B churn", unit: "%/mo", stream: "b2b", pct: true, help: "Share of clients lost each month." },
  { key: "one_off_units", label: "One-off units sold", unit: "/mo", stream: "one_off", help: "Units sold per month." },
  { key: "one_off_price", label: "One-off unit price", unit: "", stream: "one_off", help: "Price per unit." },
  { key: "one_off_unit_cost", label: "One-off unit cost", unit: "", stream: "one_off", help: "Production and fulfilment cost per unit." },
  { key: "payment_fees_pct", label: "Payment & platform fees", unit: "% of revenue", pct: true, help: "App store, Stripe and platform fees." },
  { key: "ai_cost_per_user", label: "AI generation cost per active user", unit: "/mo", help: "Model inference and media generation per active user (paying + free)." },
  { key: "infra_fixed", label: "Fixed infrastructure", unit: "/mo", help: "Hosting, storage, tools that don't scale with users." },
];
export const DRIVER = Object.fromEntries(DRIVER_DEFS.map((d) => [d.key, d]));

export const FORMULAS: Record<string, string> = {
  subscribers: "Subscribers(t) = Subscribers(t−1) × (1 − churn) + organic new(t) + paid marketing(t) ÷ CAC",
  sub_revenue: "Subscription revenue = Subscribers × price",
  free_users: "Free users(t) = Free users(t−1) × (1 + growth)",
  ad_revenue: "Advertising revenue = Free users × impressions per user × CPM ÷ 1,000",
  licensing_revenue: "Licensing revenue = deals per quarter ÷ 3 × deal value",
  merch_revenue: "Merchandise revenue(t) = launch sales × (1 + growth)^(t − launch)",
  b2b_revenue: "B2B revenue = clients × monthly contract value; clients(t) = clients(t−1) × (1 − churn) + new per quarter ÷ 3",
  one_off_revenue: "One-off revenue = units × price",
  cogs: "Cost of revenue = fees % × revenue + AI cost × active users + merch × (1 − margin) + one-off units × unit cost",
  gross_profit: "Gross profit = revenue − cost of revenue",
  opex: "Operating costs = opex lines (with growth) + team + paid marketing + fixed infrastructure",
  ebitda: "Operating profit = gross profit − operating costs",
  cash: "Cash(t) = Cash(t−1) + operating profit(t) + funding(t)",
  burn: "Net burn = average monthly operating loss over the last 3 months",
  runway: "Runway = cash ÷ net burn (months)",
  funding_need: "Funding need = deepest cash shortfall before funding + 6 months of peak burn as buffer",
  ltv: "LTV = price × (1 − fees %) − AI cost per user, ÷ churn",
  ltv_cac: "LTV : CAC = LTV ÷ CAC",
  payback: "CAC payback = CAC ÷ monthly contribution per subscriber",
};

export interface MonthOut {
  month: number;
  label: string;
  subscribers: number;
  free_users: number;
  b2b_clients: number;
  revenue: Record<StreamKey, number>;
  revenue_total: number;
  cogs: number;
  gross_profit: number;
  opex: number;
  team: number;
  marketing: number;
  ebitda: number;
  funding: number;
  cash: number;
}

export interface ModelOut {
  months: MonthOut[];
  kpis: {
    revenue_y1: number;
    revenue_last12: number;
    arr_end: number;
    gross_margin: number;
    burn: number;
    runway_months: number | null;
    break_even_month: number | null;
    min_cash: number;
    min_cash_month: number;
    funding_need: number;
    peak_burn: number;
    ltv: number | null;
    ltv_cac: number | null;
    payback_months: number | null;
  };
}

export type Scenario = "base" | "upside" | "downside";

export function driverValues(m: Pick<FinModel, "drivers" | "scenarios">, scenario: Scenario = "base"): Record<string, number> {
  const base = Object.fromEntries(m.drivers.map((d) => [d.key, d.value]));
  return scenario === "base" ? base : { ...base, ...(m.scenarios[scenario] ?? {}) };
}

const monthLabel = (start: string, i: number) => {
  const [y, mo] = start.split("-").map(Number);
  const d = new Date(Date.UTC(y || 2026, (mo || 1) - 1 + i, 1));
  return d.toISOString().slice(0, 7);
};

export function runModel(m: Omit<FinModel, "id" | "venture_id" | "version" | "created_at" | "updated_at" | "change_note" | "updated_by">, scenario: Scenario = "base"): ModelOut {
  const v = driverValues(m, scenario);
  const g = (k: string) => (Number.isFinite(v[k]) ? v[k] : 0);
  const on = (s: StreamKey) => Boolean(m.streams[s]);
  const launch = Math.max(1, Math.round(g("launch_month") || 1));
  const months: MonthOut[] = [];
  let subs = 0, free = 0, clients = 0, cash = m.starting_cash;
  for (let t = 1; t <= m.months; t++) {
    const live = t >= launch;
    const marketing = live ? g("marketing_budget") : 0;
    if (on("subscription")) {
      if (t === launch) subs = g("sub_start");
      else if (live) subs = subs * (1 - g("sub_churn") / 100) + g("sub_organic_new") * Math.pow(1 + g("sub_organic_growth") / 100, t - launch - 1) + (g("cac") > 0 ? marketing / g("cac") : 0);
    }
    if (on("advertising")) free = t === launch ? g("free_users_start") : live ? free * (1 + g("free_users_growth") / 100) : 0;
    if (on("b2b")) clients = t === launch ? g("b2b_clients_start") : live ? clients * (1 - g("b2b_churn") / 100) + g("b2b_new_per_quarter") / 3 : 0;
    const revenue: Record<StreamKey, number> = {
      subscription: on("subscription") && live ? subs * g("sub_price") : 0,
      advertising: on("advertising") && live ? (free * g("impressions_per_user") * g("cpm")) / 1000 : 0,
      licensing: on("licensing") && live ? (g("licensing_deals_per_quarter") / 3) * g("licensing_deal_value") : 0,
      merch: on("merch") && live ? g("merch_monthly") * Math.pow(1 + g("merch_growth") / 100, t - launch) : 0,
      b2b: on("b2b") && live ? clients * g("b2b_contract_value") : 0,
      one_off: on("one_off") && live ? g("one_off_units") * g("one_off_price") : 0,
    };
    const revenue_total = Object.values(revenue).reduce((s, x) => s + x, 0);
    const active = (on("subscription") ? subs : 0) + (on("advertising") ? free : 0);
    const cogs = (g("payment_fees_pct") / 100) * revenue_total + (live ? g("ai_cost_per_user") * active : 0) + revenue.merch * (1 - g("merch_margin") / 100) + (on("one_off") && live ? g("one_off_units") * g("one_off_unit_cost") : 0);
    const opex = m.opex.reduce((s, o) => s + (t >= o.start_month ? o.monthly * Math.pow(1 + o.growth_pct / 100, t - o.start_month) : 0), 0) + g("infra_fixed");
    const team = m.team.reduce((s, x) => s + (t >= x.start_month ? x.monthly_cost : 0), 0);
    const gross_profit = revenue_total - cogs;
    const ebitda = gross_profit - opex - team - marketing - (t === 1 ? m.startup_costs.reduce((s, c) => s + c.amount, 0) : 0);
    const funding = m.funding.filter((f) => f.month === t).reduce((s, f) => s + f.amount, 0);
    cash += ebitda + funding;
    months.push({ month: t, label: monthLabel(m.start, t - 1), subscribers: subs, free_users: free, b2b_clients: clients, revenue, revenue_total, cogs, gross_profit, opex, team, marketing, ebitda, funding, cash });
  }
  // Cash without any planned funding shows the true requirement.
  let unfunded = m.starting_cash, minCash = m.starting_cash, minMonth = 0, peakBurn = 0;
  for (const r of months) {
    unfunded += r.ebitda;
    if (unfunded < minCash) { minCash = unfunded; minMonth = r.month; }
    peakBurn = Math.max(peakBurn, -r.ebitda);
  }
  const last3 = months.slice(-3);
  const burn = Math.max(0, -last3.reduce((s, r) => s + r.ebitda, 0) / Math.max(1, last3.length));
  const endCash = months.at(-1)?.cash ?? m.starting_cash;
  const be = months.findIndex((r, i) => r.month >= launch && months.slice(i).every((x) => x.ebitda >= 0));
  const y1 = months.slice(0, 12).reduce((s, r) => s + r.revenue_total, 0);
  const last12 = months.slice(-12).reduce((s, r) => s + r.revenue_total, 0);
  const totalRev = months.reduce((s, r) => s + r.revenue_total, 0);
  const totalCogs = months.reduce((s, r) => s + r.cogs, 0);
  const contribution = g("sub_price") * (1 - g("payment_fees_pct") / 100) - g("ai_cost_per_user");
  const churn = g("sub_churn") / 100;
  const ltv = on("subscription") && churn > 0 ? contribution / churn : null;
  return {
    months,
    kpis: {
      revenue_y1: y1,
      revenue_last12: last12,
      arr_end: (months.at(-1)?.revenue_total ?? 0) * 12,
      gross_margin: totalRev ? (totalRev - totalCogs) / totalRev : 0,
      burn,
      runway_months: burn > 0 ? Math.max(0, endCash) / burn : null,
      break_even_month: be >= 0 ? months[be].month : null,
      min_cash: minCash,
      min_cash_month: minMonth,
      funding_need: minCash < 0 ? -minCash + 6 * peakBurn : 0,
      peak_burn: peakBurn,
      ltv,
      ltv_cac: ltv !== null && g("cac") > 0 ? ltv / g("cac") : null,
      payback_months: contribution > 0 && g("cac") > 0 ? g("cac") / contribution : null,
    },
  };
}

/** Converts between GBP and USD using the model's dated rate. */
export function convert(amount: number, from: "GBP" | "USD", to: "GBP" | "USD", gbpUsd: number) {
  if (from === to) return amount;
  return from === "GBP" ? amount * gbpUsd : amount / gbpUsd;
}

export function money(n: number, ccy: "GBP" | "USD" = "GBP", dp = 0) {
  const sym = ccy === "GBP" ? "£" : "$";
  const v = Math.abs(n);
  const s = v >= 1e6 ? `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}m` : v >= 1e4 ? `${Math.round(v / 1000)}k` : v.toLocaleString("en-GB", { maximumFractionDigits: dp });
  return `${n < 0 ? "−" : ""}${sym}${s}`;
}

export function emptyDrivers(): Driver[] {
  return DRIVER_DEFS.map((d) => ({ key: d.key, label: d.label, value: d.key === "launch_month" ? 1 : 0, unit: d.unit, basis: "estimate", note: "", source_url: null }));
}

/** Rows for the CSV export (opens in Excel, Numbers or Google Sheets). */
export function toCsv(m: FinModel, venture: string, scenario: Scenario = "base") {
  const out = runModel(m, scenario);
  const sym = m.currency;
  const rows: (string | number)[][] = [
    [`${venture}: financial model v${m.version} (${scenario})`, `Currency ${sym}`, `FX GBP/USD ${m.fx.gbp_usd} as of ${m.fx.as_of} (${m.fx.source})`, "All projections are forecasts built on the labelled assumptions below"],
    [],
    ["Month", ...out.months.map((r) => r.label)],
    ...(Object.keys(STREAMS) as StreamKey[]).filter((k) => m.streams[k]).map((k) => [`${STREAMS[k]} revenue`, ...out.months.map((r) => r.revenue[k].toFixed(2))]),
    ["Total revenue", ...out.months.map((r) => r.revenue_total.toFixed(2))],
    ["Cost of revenue", ...out.months.map((r) => r.cogs.toFixed(2))],
    ["Gross profit", ...out.months.map((r) => r.gross_profit.toFixed(2))],
    ["Operating costs", ...out.months.map((r) => r.opex.toFixed(2))],
    ["Team", ...out.months.map((r) => r.team.toFixed(2))],
    ["Paid marketing", ...out.months.map((r) => r.marketing.toFixed(2))],
    ["Operating profit", ...out.months.map((r) => r.ebitda.toFixed(2))],
    ["Funding in", ...out.months.map((r) => r.funding.toFixed(2))],
    ["Closing cash", ...out.months.map((r) => r.cash.toFixed(2))],
    ["Subscribers", ...out.months.map((r) => r.subscribers.toFixed(0))],
    ["Free users", ...out.months.map((r) => r.free_users.toFixed(0))],
    [],
    ["Assumption", "Value", "Unit", "Basis", "Note", "Source"],
    ...m.drivers.map((d) => [d.label, d.value, d.unit, d.basis, d.note, d.source_url ?? ""]),
    [],
    ["Formulas"],
    ...Object.values(FORMULAS).map((f) => [f]),
  ];
  return rows.map((r) => r.map((c) => (typeof c === "string" && /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : String(c))).join(",")).join("\n");
}
