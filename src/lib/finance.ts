import { addDays } from "@/lib/time";
import type { Account, Budget, FinanceGoal, Recurring, Transaction } from "@/lib/db/types";

export const CATEGORIES = [
  "Rent & bills", "Groceries", "Eating out", "Drinks & going out", "Transport", "Clothes", "Health & fitness", "Subscriptions",
  "Shopping", "Travel", "Entertainment", "Gifts", "Personal care", "Education", "Savings & investing", "Income", "Transfers", "Other",
] as const;

const RULES: [RegExp, string][] = [
  [/salary|payroll|wages|calm studios/i, "Income"],
  [/rent|council tax|thames water|octopus|british gas|edf|e\.on|bulb|ovo|bt |virgin media|hyperoptic|ee |vodafone|o2 |three|giffgaff|tv licen/i, "Rent & bills"],
  [/tesco|sainsbury|waitrose|m&s food|marks & spencer simply|lidl|aldi|co-?op|ocado|morrisons|asda|whole foods|planet organic/i, "Groceries"],
  [/deliveroo|uber ?eats|just eat|pret|itsu|wasabi|leon|dishoom|nando|restaurant|cafe|coffee|starbucks|caffe nero|costa|gail|kitchen|bao|pizza/i, "Eating out"],
  [/pub|bar |cocktail|club|brewdog|wine/i, "Drinks & going out"],
  [/tfl|uber(?! ?eats)|bolt|lime|addison lee|trainline|lner|gwr|national rail|shell|bp |esso|parking/i, "Transport"],
  [/cos |arket|uniqlo|zara|h&m|end\. clothing|mr porter|ssense|farfetch|selfridges|nike|adidas|asos|our legacy|toast/i, "Clothes"],
  [/gym|puregym|third space|f45|barry|classpass|psycle|boots pharmacy|pharmacy|dentist|physio/i, "Health & fitness"],
  [/netflix|spotify|apple\.com\/bill|apple music|icloud|disney|prime video|amazon prime|youtube premium|chatgpt|openai|anthropic|claude|adobe|figma|notion|github|dropbox|patreon|substack|nyt|economist|ft\.com/i, "Subscriptions"],
  [/amazon|argos|john lewis|ikea|currys|apple store/i, "Shopping"],
  [/airbnb|booking\.com|hotel|easyjet|ryanair|british airways|eurostar|expedia|skyscanner/i, "Travel"],
  [/cinema|odeon|curzon|everyman|picturehouse|ticketmaster|dice|eventbrite|theatre|museum|barbican|tate|steam|playstation|xbox/i, "Entertainment"],
  [/barber|salon|aesop|lush|boots(?! pharmacy)/i, "Personal care"],
  [/vanguard|trading 212|freetrade|nutmeg|moneybox|isa|pension|savings pot|chip /i, "Savings & investing"],
  [/transfer|to pot|from pot|monzo pot|revolut top|paypal transfer/i, "Transfers"],
];

export function categorise(description: string, amount: number): string {
  for (const [re, cat] of RULES) if (re.test(description)) return cat;
  return amount > 0 ? "Income" : "Other";
}

/** Splits a CSV line, respecting quotes. */
function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (c === sep && !q) { out.push(cur); cur = ""; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseDate(v: string): string | null {
  const s = v.trim().replace(/T.*$/, "");
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; // UK day-first
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const num = (v: string | undefined) => {
  if (!v) return NaN;
  const neg = /^\(.*\)$/.test(v.trim()) || /^-/.test(v.trim());
  const n = Number(v.replace(/[£$€,\s()]/g, "").replace(/^-/, ""));
  return neg ? -n : n;
};

export interface ParsedTxn { date: string; description: string; amount: number; category: string | null }

/**
 * Parses bank CSV exports (Monzo, Starling, Revolut, HSBC, Barclays, Lloyds,
 * Nationwide, Amex and similar): finds date, description and either a signed
 * amount column or separate paid-in / paid-out columns.
 */
export function parseBankCsv(text: string): { rows: ParsedTxn[]; skipped: number; columns: string[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], skipped: 0, columns: [] };
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const head = splitLine(lines[0], sep).map((h) => h.toLowerCase());
  const find = (...names: RegExp[]) => head.findIndex((h) => names.some((n) => n.test(h)));
  const iDate = find(/^date$/, /transaction date/, /^completed date/, /^started date/, /date/);
  const iDesc = find(/^name$/, /description/, /counter ?party/, /merchant/, /payee/, /details/, /narrative/, /reference/);
  const iAmt = find(/^amount$/, /amount \(gbp\)/, /^value$/, /amount/);
  const iOut = find(/paid out/, /money out/, /debit/, /withdrawal/);
  const iIn = find(/paid in/, /money in/, /credit/, /deposit/);
  const iCat = find(/^category$/, /spending category/);
  if (iDate < 0 || iDesc < 0 || (iAmt < 0 && iOut < 0 && iIn < 0)) return { rows: [], skipped: lines.length - 1, columns: head };
  // Amex-style exports list purchases as positive numbers.
  const positiveIsSpend = head.some((h) => /amex|american express/.test(h)) || /amex/i.test(lines[0]);
  const rows: ParsedTxn[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const c = splitLine(line, sep);
    const date = parseDate(c[iDate] ?? "");
    let amount = iAmt >= 0 && c[iAmt] ? num(c[iAmt]) : (Number.isFinite(num(c[iIn])) ? num(c[iIn]) : 0) - (Number.isFinite(num(c[iOut])) ? Math.abs(num(c[iOut])) : 0);
    if (positiveIsSpend) amount = -amount;
    const description = (c[iDesc] ?? "").replace(/\s+/g, " ").trim();
    if (!date || !Number.isFinite(amount) || amount === 0 || !description) { skipped++; continue; }
    const bankCat = iCat >= 0 ? c[iCat] : "";
    rows.push({ date, description, amount: Math.round(amount * 100) / 100, category: bankCat ? mapBankCategory(bankCat) : null });
  }
  return { rows, skipped, columns: head };
}

function mapBankCategory(c: string): string | null {
  const m: Record<string, string> = { groceries: "Groceries", eating_out: "Eating out", "eating out": "Eating out", transport: "Transport", bills: "Rent & bills", shopping: "Shopping", entertainment: "Entertainment", holidays: "Travel", travel: "Travel", personal_care: "Personal care", "personal care": "Personal care", income: "Income", savings: "Savings & investing", transfers: "Transfers", gifts: "Gifts", general: "Other", charity: "Gifts", family: "Other", finances: "Savings & investing", expenses: "Other" };
  return m[c.toLowerCase().trim()] ?? null;
}

export function txnHash(t: { date: string; description: string; amount: number }) {
  let h = 2166136261;
  const s = `${t.date}|${t.description.toLowerCase()}|${t.amount.toFixed(2)}`;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

const NOT_SPEND = new Set(["Income", "Transfers", "Savings & investing"]);
export const isSpend = (t: Transaction) => t.amount < 0 && !NOT_SPEND.has(t.category);

export function monthlyEquivalent(r: Recurring) {
  return r.cadence === "weekly" ? (r.amount * 52) / 12 : r.cadence === "yearly" ? r.amount / 12 : r.amount;
}

export function advance(date: string, cadence: Recurring["cadence"]): string {
  if (cadence === "weekly") return addDays(date, 7);
  const d = new Date(`${date}T12:00:00Z`);
  if (cadence === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function monthKey(date: string) {
  return date.slice(0, 7);
}

export function lastMonths(today: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(`${today.slice(0, 7)}-15T12:00:00Z`);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setUTCMonth(d.getUTCMonth() - i);
    out.push(x.toISOString().slice(0, 7));
  }
  return out;
}

export function summarise(input: { today: string; txns: Transaction[]; budgets: Budget[]; recurring: Recurring[]; accounts: Account[]; goals: FinanceGoal[] }) {
  const { today, txns, budgets, recurring, accounts, goals } = input;
  const month = monthKey(today);
  const thisMonth = txns.filter((t) => monthKey(t.date) === month);
  const spendThisMonth = thisMonth.filter(isSpend).reduce((s, t) => s - t.amount, 0);
  const incomeThisMonth = thisMonth.filter((t) => t.amount > 0 && t.category === "Income").reduce((s, t) => s + t.amount, 0);
  const byCategory = new Map<string, number>();
  for (const t of thisMonth.filter(isSpend)) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) - t.amount);
  const months = lastMonths(today, 6).map((m) => {
    const list = txns.filter((t) => monthKey(t.date) === m);
    return { month: m, spend: list.filter(isSpend).reduce((s, t) => s - t.amount, 0), income: list.filter((t) => t.amount > 0 && t.category === "Income").reduce((s, t) => s + t.amount, 0) };
  });
  const day = Number(today.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const budgetRows = budgets.map((b) => {
    const spent = byCategory.get(b.id) ?? 0;
    const pace = (b.monthly_limit * day) / daysInMonth;
    return { category: b.id, limit: b.monthly_limit, spent, remaining: b.monthly_limit - spent, over: spent > b.monthly_limit, ahead: spent > pace && spent <= b.monthly_limit };
  }).sort((a, b) => b.spent / Math.max(1, b.limit) - a.spent / Math.max(1, a.limit));
  const totalBudget = budgets.reduce((s, b) => s + b.monthly_limit, 0);
  const budgetedSpend = budgetRows.reduce((s, b) => s + b.spent, 0);
  const active = recurring.filter((r) => r.active);
  const upcoming = active.filter((r) => r.next_date >= today && r.next_date <= addDays(today, 14)).sort((a, b) => a.next_date.localeCompare(b.next_date));
  const subsMonthly = active.filter((r) => r.kind === "subscription").reduce((s, r) => s + monthlyEquivalent(r), 0);
  const billsMonthly = active.filter((r) => r.kind !== "income").reduce((s, r) => s + monthlyEquivalent(r), 0);
  const assets = accounts.filter((a) => !["credit", "loan"].includes(a.kind)).reduce((s, a) => s + a.balance, 0);
  const debts = accounts.filter((a) => ["credit", "loan"].includes(a.kind)).reduce((s, a) => s + Math.abs(a.balance), 0);
  const goalRows = goals.map((g) => {
    const monthsLeft = g.deadline ? Math.max(1, Math.round((new Date(`${g.deadline}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / (30.4 * 86400000))) : null;
    return { ...g, pct: g.target ? Math.min(1, g.saved / g.target) : 0, perMonth: monthsLeft ? Math.max(0, (g.target - g.saved) / monthsLeft) : null };
  });
  return {
    month, spendThisMonth, incomeThisMonth, net: incomeThisMonth - spendThisMonth, byCategory: [...byCategory].sort((a, b) => b[1] - a[1]),
    months, budgetRows, totalBudget, budgetLeft: totalBudget - budgetedSpend, budgetedSpend, upcoming, subsMonthly, billsMonthly, assets, debts, netWorth: assets - debts, goalRows,
    projected: day > 0 ? (spendThisMonth / day) * daysInMonth : 0, day, daysInMonth,
  };
}

export const gbp = (n: number, dp = 0) => `${n < 0 ? "−" : ""}£${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
