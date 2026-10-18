/**
 * The Future Engine's quantitative model: a transparent monthly cash-flow
 * and time model. Pure functions, so the server and the interactive
 * sliders compute exactly the same numbers.
 */

export const ASSUMPTION_KEYS = [
  "months", "launch_month", "upfront_cost", "monthly_cost", "hours_per_week", "price", "start_customers",
  "new_customers_per_month", "acquisition_growth", "churn_rate", "other_monthly_income", "opportunity_cost_per_month",
] as const;
export type AssumptionKey = (typeof ASSUMPTION_KEYS)[number];

export const ASSUMPTION_META: Record<AssumptionKey, { label: string; unit: string; help: string; pct?: boolean }> = {
  months: { label: "Time horizon", unit: "months", help: "How far ahead the model runs." },
  launch_month: { label: "Revenue starts in month", unit: "", help: "When the first paying customers arrive." },
  upfront_cost: { label: "Upfront cost", unit: "£", help: "One-off spend before or at launch." },
  monthly_cost: { label: "Running costs", unit: "£/mo", help: "Tools, contractors, hosting, marketing." },
  hours_per_week: { label: "Your time", unit: "h/week", help: "Hours of your own time each week." },
  price: { label: "Revenue per customer", unit: "£/mo", help: "Average monthly revenue per paying customer (or per deal)." },
  start_customers: { label: "Customers at launch", unit: "", help: "Paying customers in the launch month." },
  new_customers_per_month: { label: "New customers per month", unit: "", help: "Monthly acquisition after launch." },
  acquisition_growth: { label: "Acquisition growth", unit: "%/mo", help: "How fast monthly acquisition grows.", pct: true },
  churn_rate: { label: "Churn", unit: "%/mo", help: "Share of customers lost each month.", pct: true },
  other_monthly_income: { label: "Other income change", unit: "£/mo", help: "Change to your other income (negative if you give up salary).", },
  opportunity_cost_per_month: { label: "Opportunity cost", unit: "£/mo", help: "Value of what you'd otherwise do with this time." },
};

export type Assumptions = Record<AssumptionKey, number>;

export interface MonthRow { month: number; customers: number; revenue: number; costs: number; net: number; cumulative: number }
export interface Outcome {
  rows: MonthRow[];
  mrr_end: number;
  total_revenue: number;
  cumulative_net: number;
  net_after_opportunity: number;
  break_even_month: number | null;
  peak_cash_need: number;
  total_hours: number;
  revenue_per_hour: number;
}

const clampN = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);

export function normalise(a: Partial<Assumptions>): Assumptions {
  return {
    months: Math.round(clampN(a.months ?? 24, 1, 120)),
    launch_month: Math.round(clampN(a.launch_month ?? 3, 1, 120)),
    upfront_cost: clampN(a.upfront_cost ?? 0, 0, 1e9),
    monthly_cost: clampN(a.monthly_cost ?? 0, 0, 1e8),
    hours_per_week: clampN(a.hours_per_week ?? 0, 0, 100),
    price: clampN(a.price ?? 0, 0, 1e7),
    start_customers: clampN(a.start_customers ?? 0, 0, 1e8),
    new_customers_per_month: clampN(a.new_customers_per_month ?? 0, 0, 1e8),
    acquisition_growth: clampN(a.acquisition_growth ?? 0, -50, 100),
    churn_rate: clampN(a.churn_rate ?? 0, 0, 100),
    other_monthly_income: clampN(a.other_monthly_income ?? 0, -1e7, 1e7),
    opportunity_cost_per_month: clampN(a.opportunity_cost_per_month ?? 0, 0, 1e7),
  };
}

export function simulate(input: Partial<Assumptions>): Outcome {
  const a = normalise(input);
  const rows: MonthRow[] = [];
  let customers = 0, cumulative = 0, acquisition = a.new_customers_per_month;
  for (let m = 1; m <= a.months; m++) {
    if (m === a.launch_month) customers += a.start_customers;
    else if (m > a.launch_month) {
      customers = customers * (1 - a.churn_rate / 100) + acquisition;
      acquisition *= 1 + a.acquisition_growth / 100;
    }
    const revenue = m >= a.launch_month ? customers * a.price : 0;
    const costs = a.monthly_cost + (m === 1 ? a.upfront_cost : 0);
    const net = revenue - costs + a.other_monthly_income;
    cumulative += net;
    rows.push({ month: m, customers, revenue, costs, net, cumulative });
  }
  const be = rows.find((r, i) => r.cumulative >= 0 && rows.slice(0, i).some((x) => x.cumulative < 0));
  const total_hours = (a.hours_per_week * 52 * a.months) / 12;
  const total_revenue = rows.reduce((s, r) => s + r.revenue, 0);
  return {
    rows,
    mrr_end: rows.at(-1)?.revenue ?? 0,
    total_revenue,
    cumulative_net: rows.at(-1)?.cumulative ?? 0,
    net_after_opportunity: (rows.at(-1)?.cumulative ?? 0) - a.opportunity_cost_per_month * a.months,
    break_even_month: rows.every((r) => r.cumulative >= 0) ? 1 : be ? be.month : null,
    peak_cash_need: Math.min(0, ...rows.map((r) => r.cumulative)),
    total_hours,
    revenue_per_hour: total_hours ? total_revenue / total_hours : 0,
  };
}

export interface Range { key: AssumptionKey; low: number; high: number }

/** One-at-a-time sensitivity on the base case: which assumptions move the outcome most. */
export function sensitivity(base: Partial<Assumptions>, ranges: Range[], metric: keyof Pick<Outcome, "net_after_opportunity" | "cumulative_net" | "mrr_end"> = "net_after_opportunity") {
  const b = normalise(base);
  const ref = simulate(b)[metric];
  return ranges
    .filter((r) => r.key !== "months")
    .map((r) => {
      const lo = simulate({ ...b, [r.key]: r.low })[metric];
      const hi = simulate({ ...b, [r.key]: r.high })[metric];
      return { key: r.key, label: ASSUMPTION_META[r.key].label, low: r.low, high: r.high, at_low: lo, at_high: hi, swing: Math.abs(hi - lo), ref };
    })
    .sort((x, y) => y.swing - x.swing);
}

/** Default ±40% ranges where the model didn't supply its own. */
export function defaultRanges(a: Assumptions, given: Range[] = []): Range[] {
  return ASSUMPTION_KEYS.filter((k) => k !== "months").map((key) => {
    const g = given.find((x) => x.key === key);
    if (g && g.high >= g.low) return g;
    const v = a[key];
    if (key === "launch_month") return { key, low: Math.max(1, v - 3), high: v + 6 };
    if (v === 0) return { key, low: 0, high: key.includes("rate") || key === "acquisition_growth" ? 10 : 0 };
    return { key, low: v * 0.6, high: v * 1.4 };
  });
}

export const gbpShort = (n: number) => {
  const s = n < 0 ? "−" : "";
  const v = Math.abs(n);
  return `${s}£${v >= 1e6 ? `${(v / 1e6).toFixed(1)}m` : v >= 1e4 ? `${Math.round(v / 1000)}k` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)}`;
};
