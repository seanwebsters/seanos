import "server-only";
import type { Basis, FinModel } from "@/lib/db/types";
import { HttpError } from "@/lib/api";
import { DRIVER, STREAMS } from "./finmodel";

const num = (v: unknown, label: string, min = -1e12, max = 1e12) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `${label} must be a number`);
  return n;
};
const text = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");
const BASES: Basis[] = ["verified", "estimate", "forecast", "scenario", "user"];

/** Validates a client edit to a model. Unknown fields are dropped. */
export function cleanModelPatch(b: Record<string, unknown>, cur: FinModel): Partial<FinModel> {
  const out: Partial<FinModel> = {};
  if (b.currency !== undefined) {
    if (b.currency !== "GBP" && b.currency !== "USD") throw new HttpError(400, "Currency must be GBP or USD");
    out.currency = b.currency;
  }
  if (b.starting_cash !== undefined) out.starting_cash = num(b.starting_cash, "Starting cash");
  if (b.months !== undefined) out.months = Math.round(num(b.months, "Months", 12, 60));
  if (b.start !== undefined) {
    if (typeof b.start !== "string" || !/^\d{4}-\d{2}$/.test(b.start)) throw new HttpError(400, "Start must be YYYY-MM");
    out.start = b.start;
  }
  if (b.fx !== undefined) {
    const f = b.fx as Record<string, unknown>;
    out.fx = { gbp_usd: num(f.gbp_usd, "FX rate", 0.2, 5), as_of: text(f.as_of, 10) || cur.fx.as_of, source: text(f.source) || "Entered by Sean" };
  }
  if (b.streams !== undefined) out.streams = Object.fromEntries(Object.keys(STREAMS).map((k) => [k, Boolean((b.streams as Record<string, unknown>)[k])]));
  if (b.drivers !== undefined) {
    const incoming = new Map((b.drivers as Record<string, unknown>[]).map((d) => [String(d.key), d]));
    out.drivers = cur.drivers.map((d) => {
      const x = incoming.get(d.key);
      if (!x || !DRIVER[d.key]) return d;
      const value = num(x.value, DRIVER[d.key].label);
      const changed = value !== d.value;
      const basis = BASES.includes(x.basis as Basis) ? (x.basis as Basis) : changed ? "user" : d.basis;
      return { ...d, value, basis: changed && basis !== "verified" ? "user" : basis, note: x.note !== undefined ? text(x.note) : d.note, source_url: x.source_url !== undefined ? text(x.source_url, 500) || null : d.source_url };
    });
  }
  if (b.scenarios !== undefined) {
    const s = b.scenarios as Record<string, Record<string, unknown>>;
    const pick = (o: Record<string, unknown> | undefined) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => DRIVER[k]).map(([k, v]) => [k, num(v, DRIVER[k].label)]));
    out.scenarios = { upside: pick(s.upside), downside: pick(s.downside) };
  }
  if (b.opex !== undefined) out.opex = (b.opex as Record<string, unknown>[]).slice(0, 40).map((o) => ({ name: text(o.name, 80) || "Cost", monthly: num(o.monthly, "Monthly cost", 0), start_month: Math.round(num(o.start_month ?? 1, "Start month", 1, 60)), growth_pct: num(o.growth_pct ?? 0, "Growth", -50, 50) }));
  if (b.team !== undefined) out.team = (b.team as Record<string, unknown>[]).slice(0, 40).map((o) => ({ role: text(o.role, 80) || "Role", monthly_cost: num(o.monthly_cost, "Monthly cost", 0), start_month: Math.round(num(o.start_month ?? 1, "Start month", 1, 60)) }));
  if (b.funding !== undefined) out.funding = (b.funding as Record<string, unknown>[]).slice(0, 20).map((o) => ({ month: Math.round(num(o.month, "Funding month", 1, 60)), amount: num(o.amount, "Funding amount", 0), kind: (["equity", "grant", "loan", "revenue_based", "founder"].includes(String(o.kind)) ? o.kind : "equity") as FinModel["funding"][number]["kind"], note: text(o.note) }));
  if (b.startup_costs !== undefined) out.startup_costs = (b.startup_costs as Record<string, unknown>[]).slice(0, 40).map((o) => ({ item: text(o.item, 120) || "Item", amount: num(o.amount, "Amount", 0), basis: BASES.includes(o.basis as Basis) ? (o.basis as Basis) : "user" }));
  if (b.actuals !== undefined) out.actuals = (b.actuals as Record<string, unknown>[]).slice(0, 120).map((o) => {
    if (typeof o.month !== "string" || !/^\d{4}-\d{2}$/.test(o.month)) throw new HttpError(400, "Actuals month must be YYYY-MM");
    return { month: o.month, revenue: num(o.revenue, "Actual revenue", 0), costs: num(o.costs, "Actual costs", 0), cash: num(o.cash, "Actual cash") };
  }).sort((a, z) => a.month.localeCompare(z.month));
  return out;
}
