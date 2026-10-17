import "server-only";
import * as z from "zod/v4";
import { getDb } from "@/lib/db";
import { callAgent } from "@/lib/ai/llm";
import { newId, nowIso } from "@/lib/util";
import { londonDate } from "@/lib/time";
import { CATEGORIES, advance, gbp, monthlyEquivalent, summarise } from "@/lib/finance";
import { registerWorkflow, type RunContext } from "../jobs";

/** Rolls past-due recurring bills forward to their next date. */
export async function rollRecurring(today = londonDate()) {
  const db = getDb();
  for (const r of await db.list("recurring", { where: { active: true } })) {
    let next = r.next_date;
    for (let i = 0; next < today && i < 60; i++) next = advance(next, r.cadence);
    if (next !== r.next_date) await db.update("recurring", r.id, { next_date: next });
  }
}

/** A plain-text picture of Sean's finances for the Financial Planner (personal scope only). */
export async function financeContext() {
  const db = getDb();
  const today = londonDate();
  const [txns, budgets, recurring, accounts, goals] = await Promise.all([db.list("transactions"), db.list("budgets"), db.list("recurring"), db.list("accounts"), db.list("finance_goals")]);
  const s = summarise({ today, txns, budgets, recurring, accounts, goals });
  const recent = txns.filter((t) => t.date >= `${s.months[3].month}-01`).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 150);
  const lines = [
    `Today ${today}. Day ${s.day} of ${s.daysInMonth}.`,
    `This month: spent ${gbp(s.spendThisMonth, 2)} (projected ${gbp(s.projected)}), income ${gbp(s.incomeThisMonth, 2)}, net ${gbp(s.net, 2)}. Budgets total ${gbp(s.totalBudget)}/month (${gbp(s.budgetedSpend)} spent in budgeted categories).`,
    `Last 6 months (spend / income): ${s.months.map((m) => `${m.month}: ${gbp(m.spend)} / ${gbp(m.income)}`).join("; ")}`,
    `Spending by category this month: ${s.byCategory.map(([c, v]) => `${c} ${gbp(v)}`).join("; ") || "none"}`,
    `Budgets: ${s.budgetRows.map((b) => `${b.category} ${gbp(b.spent)} of ${gbp(b.limit)}${b.over ? " OVER" : b.ahead ? " ahead of pace" : ""}`).join("; ") || "none set"}`,
    `Recurring: ${recurring.filter((r) => r.active).map((r) => `${r.name} ${gbp(r.amount, 2)} ${r.cadence} (${r.kind}, next ${r.next_date}, ~${gbp(monthlyEquivalent(r), 2)}/mo)`).join("; ") || "none"}`,
    `Subscriptions total ~${gbp(s.subsMonthly, 2)}/month. All bills ~${gbp(s.billsMonthly)}/month.`,
    `Accounts: ${accounts.map((a) => `${a.name} (${a.kind}) ${gbp(a.balance)}`).join("; ") || "none"}. Net worth ${gbp(s.netWorth)}.`,
    `Goals: ${s.goalRows.map((g) => `${g.name}: ${gbp(g.saved)} of ${gbp(g.target)}${g.deadline ? ` by ${g.deadline} (needs ${gbp(g.perMonth ?? 0)}/mo)` : ""}`).join("; ") || "none"}`,
    `Recent transactions:\n${recent.map((t) => `${t.date} ${t.description} ${t.amount.toFixed(2)} [${t.category}]`).join("\n") || "none recorded"}`,
  ];
  return { text: lines.join("\n"), hasData: txns.length + accounts.length + recurring.length + goals.length > 0 };
}

const ReviewZ = z.object({
  title: z.string(),
  summary: z.string().describe("Two sentences: how this month is going"),
  body: z.string().describe("Markdown: Where the money went, Budgets, Bills & subscriptions (flag duplicates or forgotten ones), Goals, Three things to do this week"),
  budget_suggestions: z.array(z.object({ category: z.enum(CATEGORIES), monthly_limit: z.number(), why: z.string() })).describe("Only for categories with real spending data; empty if none"),
});

async function review(ctx: RunContext, instruction: string) {
  const db = getDb();
  const fin = await financeContext();
  if (!fin.hasData) return { summary: "No financial data yet. Import a bank CSV or add transactions, bills and goals in Finance first." };
  const r = await ctx.step("finance", "Reviewing your money", async () =>
    (await callAgent({ agent: "finance", taskId: ctx.task.id, effort: "medium", schema: ReviewZ, prompt: `${instruction}\nUse only these figures:\n${fin.text}` })).data,
  );
  const suggestions = r.budget_suggestions.length ? `\n\n## Suggested budgets\n${r.budget_suggestions.map((b) => `- **${b.category}**: ${gbp(b.monthly_limit)}/month (${b.why})`).join("\n")}\n\nApply them in Finance → Budgets.` : "";
  const id = newId("rep");
  await db.insert("reports", { id, kind: "finance", title: r.title, summary: r.summary, body: r.body + suggestions, slides: [], sources: [], subject_ref: null, scope: "personal", tags: ["finance"], images: [], task_id: ctx.task.id, created_at: nowIso() });
  ctx.deliver({ type: "report", id, title: r.title });
  return { summary: r.summary };
}

registerWorkflow({ kind: "finance_review", title: "Money check-in", agent: "finance", run: (ctx) => review(ctx, "Write Sean's money check-in for this week. Calm, specific and practical.") });

registerWorkflow({
  kind: "finance_plan",
  title: "Financial plan",
  agent: "finance",
  async run(ctx) {
    const db = getDb();
    const fin = await financeContext();
    const r = await ctx.step("finance", "Building the plan", async () =>
      (await callAgent({ agent: "finance", taskId: ctx.task.id, schema: z.object({ title: z.string(), summary: z.string(), body: z.string().describe("Markdown plan with numbers, tables where useful, and clear assumptions") }), prompt: `Sean asked: "${ctx.task.instruction}"\n\nHis finances:\n${fin.text}\n\nIf the data is thin, say what's missing and give a plan with clearly labelled assumptions. General guidance only, not regulated advice.` })).data,
    );
    const id = newId("rep");
    await db.insert("reports", { id, kind: "finance", title: r.title, summary: r.summary, body: r.body, slides: [], sources: [], subject_ref: null, scope: "personal", tags: ["finance"], images: [], task_id: ctx.task.id, created_at: nowIso() });
    ctx.deliver({ type: "report", id, title: r.title });
    return { summary: r.summary };
  },
});

registerWorkflow({
  kind: "finance_categorise",
  title: "Categorise transactions",
  agent: "finance",
  async run(ctx) {
    const db = getDb();
    const todo = (await db.list("transactions", { where: { category: "Other" } })).slice(0, 150);
    if (!todo.length) return { summary: "Everything is already categorised." };
    const r = await ctx.step("finance", `Categorising ${todo.length} transactions`, async () =>
      (await callAgent({ agent: "finance", taskId: ctx.task.id, effort: "low", schema: z.object({ items: z.array(z.object({ index: z.number(), category: z.enum(CATEGORIES) })) }), prompt: `Categorise each UK bank transaction. Use "Other" if genuinely unclear.\n${todo.map((t, i) => `[${i}] ${t.description} ${t.amount.toFixed(2)}`).join("\n")}` })).data.items,
    );
    let n = 0;
    for (const it of r) {
      const t = todo[it.index];
      if (t && it.category !== "Other") { await db.update("transactions", t.id, { category: it.category }); n++; }
    }
    return { summary: `Categorised ${n} of ${todo.length} transactions.` };
  },
});
