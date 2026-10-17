import Link from "next/link";
import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { fmtDate, londonDate } from "@/lib/time";
import { CATEGORIES, gbp, monthlyEquivalent, summarise } from "@/lib/finance";
import { rollRecurring } from "@/lib/engine/workflows/finance";
import { Empty, List, PageHeader, Pill, Row, Section, Stat, Tabs } from "@/components/ui";
import { ActionButton, AskButton, CreateForm, Delegate, EditField, LiveRefresh, Patch } from "@/components/client";
import { Icon } from "@/components/Icon";
import { CategorySelect, CsvImport, TxnFilter } from "./client";

export const dynamic = "force-dynamic";

const CAT_OPTIONS = [...CATEGORIES];

export default async function Finance({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; cat?: string; month?: string }> }) {
  await ensureBootstrapped();
  await rollRecurring();
  const { tab = "overview", q = "", cat = "", month = "" } = await searchParams;
  const db = getDb();
  const today = londonDate();
  const [txns, budgets, recurring, accounts, goals] = await Promise.all([db.list("transactions", { orderBy: { column: "date", ascending: false } }), db.list("budgets"), db.list("recurring"), db.list("accounts"), db.list("finance_goals")]);
  const s = summarise({ today, txns, budgets, recurring, accounts, goals });
  const reports = await db.list("reports", { where: { kind: "finance" }, orderBy: { column: "created_at", ascending: false }, limit: 5 });
  const running = (await db.list("tasks", { where: { kind: ["finance_review", "finance_plan", "finance_categorise"], status: ["queued", "running"] } })).length > 0;
  const empty = !txns.length && !accounts.length && !recurring.length && !goals.length;
  return (
    <div>
      <LiveRefresh active={running} />
      <PageHeader title="Finance" eyebrow="Financial planner" subtitle="Where the money goes, what's coming up, and how to hit your goals." actions={<span className="flex items-center gap-1 rounded-full bg-raised px-2.5 py-1 text-[11.5px] text-muted"><Icon name="lock" size={12} /> Private</span>} />
      <Tabs base="/finance" active={tab} tabs={[{ key: "overview", label: "Overview" }, { key: "transactions", label: "Transactions", count: txns.length }, { key: "budgets", label: "Budgets", count: budgets.length }, { key: "bills", label: "Bills & subs", count: recurring.filter((r) => r.active).length }, { key: "goals", label: "Goals", count: goals.length }, { key: "accounts", label: "Net worth" }]} />
      {tab === "overview" && (empty ? (
        <div className="mt-4">
          <Empty icon="wallet" title="Let's get the numbers in" body="Import a CSV export from your bank (Monzo, Starling, Revolut, HSBC, Barclays, Amex…), or add transactions, bills and goals by hand. Nothing leaves your SEAN OS.">
            <Link href="/finance?tab=transactions" className="btn-primary">Import a statement</Link>
            <Link href="/finance?tab=bills" className="btn-ghost">Add bills</Link>
          </Empty>
        </div>
      ) : <Overview s={s} reports={reports} />)}
      {tab === "transactions" && (
        <>
          <div className="mx-5 mt-3 grid gap-3 lg:mx-0 lg:grid-cols-2">
            <div className="card p-4"><div className="mb-2 text-[14px] font-medium">Import a bank CSV</div><CsvImport accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} /></div>
            <details className="card p-4"><summary className="cursor-pointer text-[14px] font-medium">Add a transaction</summary><div className="mt-3"><CreateForm table="transactions" submit="Add" fields={[{ name: "description", label: "What" }, { name: "amount", label: "Amount £", type: "number" }, { name: "direction", label: "Direction", options: ["out", "in"] }, { name: "category", label: "Category", options: ["", ...CAT_OPTIONS] }, { name: "date", label: "Date", type: "date" }]} /></div></details>
          </div>
          <div className="mx-5 mt-4 lg:mx-0"><TxnFilter q={q} cat={cat} month={month} categories={CAT_OPTIONS} months={[...new Set(txns.map((t) => t.date.slice(0, 7)))]} /></div>
          <Transactions txns={txns.filter((t) => (!q || t.description.toLowerCase().includes(q.toLowerCase())) && (!cat || t.category === cat) && (!month || t.date.startsWith(month))).slice(0, 300)} />
        </>
      )}
      {tab === "budgets" && (
        <>
          <div className="mx-5 mt-3 text-[13.5px] text-muted lg:mx-0">{fmtDate(today, { month: "long" })}: {gbp(s.budgetedSpend)} spent of {gbp(s.totalBudget)} budgeted · day {s.day} of {s.daysInMonth}</div>
          {s.budgetRows.length ? (
            <div className="mx-5 mt-3 space-y-2.5 lg:mx-0">
              {s.budgetRows.map((b) => (
                <div key={b.category} className="card p-4">
                  <div className="flex items-center justify-between gap-2"><span className="text-[15px] font-medium">{b.category}</span><span className="text-[13px] tabular-nums text-muted">{gbp(b.spent)} / {gbp(b.limit)}</span></div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-raised"><div className={`h-full rounded-full ${b.over ? "bg-rose" : b.ahead ? "bg-accent" : "bg-sage"}`} style={{ width: `${Math.min(100, (b.spent / Math.max(1, b.limit)) * 100)}%` }} /></div>
                  <div className="mt-1.5 flex items-center justify-between text-[12px]">
                    <span className={b.over ? "font-medium text-rose" : "text-muted"}>{b.over ? `⚠ Over by ${gbp(-b.remaining)}` : b.ahead ? `Ahead of pace · ${gbp(b.remaining)} left` : `${gbp(b.remaining)} left`}</span>
                    <div className="flex items-center gap-1.5"><span className="text-faint">Limit £</span><div className="w-20"><EditField table="budgets" id={b.category} field="monthly_limit" value={String(b.limit)} type="number" className="px-2 py-1 text-[12px]" /></div><ActionButton url={`/api/entity/budgets/${encodeURIComponent(b.category)}`} method="DELETE" className="text-faint" confirm="Remove this budget?"><Icon name="trash" size={14} /></ActionButton></div>
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="mt-4"><Empty icon="wallet" title="No budgets yet" body="Set monthly limits for the categories that matter. Or ask your Financial Planner to suggest some from your real spending."><Delegate label="Suggest budgets" kind="finance_review" /></Empty></div>}
          <Section title="Add a budget"><div className="mx-5 lg:mx-0"><CreateForm table="budgets" submit="Set budget" fields={[{ name: "category", label: "Category", options: CAT_OPTIONS.filter((c) => !["Income", "Transfers"].includes(c) && !budgets.some((b) => b.id === c)) }, { name: "monthly_limit", label: "Monthly limit £", type: "number" }]} /></div></Section>
        </>
      )}
      {tab === "bills" && (
        <>
          <div className="mx-5 mt-3 grid grid-cols-2 gap-2.5 lg:mx-0"><Stat label="Bills & subs" value={gbp(s.billsMonthly)} sub="per month" /><Stat label="Subscriptions" value={gbp(s.subsMonthly)} sub={`${gbp(s.subsMonthly * 12)} a year`} /></div>
          <div className="mx-5 mt-3 lg:mx-0"><Delegate label="Audit my subscriptions" kind="finance_plan" instruction="Audit Sean's subscriptions and recurring bills. Flag duplicates, forgotten or poor-value ones and estimate the saving. Also look in recent transactions for recurring charges not yet listed." /></div>
          {recurring.length > 0 && (
            <List className="mt-3">
              {[...recurring].sort((a, b) => a.next_date.localeCompare(b.next_date)).map((r) => (
                <Row key={r.id} title={<span className={r.active ? "" : "text-faint line-through"}>{r.name}</span>} sub={`${gbp(r.amount, 2)} ${r.cadence} · ${r.kind} · next ${fmtDate(r.next_date)}${r.cadence !== "monthly" ? ` · ~${gbp(monthlyEquivalent(r), 2)}/mo` : ""}`}
                  right={<div className="flex items-center gap-1.5"><Patch table="recurring" id={r.id} patch={{ active: !r.active }} className="chip px-2.5 py-1 text-[11.5px]">{r.active ? "Pause" : "Resume"}</Patch><ActionButton url={`/api/entity/recurring/${r.id}`} method="DELETE" confirm="Delete?" className="text-faint"><Icon name="trash" size={14} /></ActionButton></div>} />
              ))}
            </List>
          )}
          <Section title="Add a bill, subscription or income"><div className="mx-5 lg:mx-0"><CreateForm table="recurring" submit="Add" fields={[{ name: "name", label: "Name (e.g. Rent, Spotify, Salary)" }, { name: "amount", label: "Amount £", type: "number" }, { name: "kind", label: "Kind", options: ["bill", "subscription", "income"] }, { name: "cadence", label: "How often", options: ["monthly", "weekly", "yearly"] }, { name: "next_date", label: "Next due", type: "date" }]} /></div></Section>
        </>
      )}
      {tab === "goals" && (
        <>
          {s.goalRows.length ? (
            <div className="mx-5 mt-3 space-y-2.5 lg:mx-0">
              {s.goalRows.map((g) => (
                <div key={g.id} className="card p-4">
                  <div className="flex items-center justify-between"><span className="text-[15.5px] font-semibold">{g.name}</span><span className="text-[13px] tabular-nums text-muted">{gbp(g.saved)} / {gbp(g.target)}</span></div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-sage" style={{ width: `${g.pct * 100}%` }} /></div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
                    <span>{Math.round(g.pct * 100)}%{g.deadline ? ` · by ${fmtDate(g.deadline, { month: "short", year: "numeric" })} · ${gbp(g.perMonth ?? 0)}/month needed` : ""}</span>
                    <div className="flex items-center gap-1.5"><span className="text-faint">Saved £</span><div className="w-24"><EditField table="finance_goals" id={g.id} field="saved" value={String(g.saved)} type="number" className="px-2 py-1 text-[12px]" /></div></div>
                  </div>
                  <div className="mt-2 flex gap-2"><Delegate label="Plan to hit this" kind="finance_plan" instruction={`Make a realistic plan for Sean to reach "${g.name}" (${gbp(g.saved)} of ${gbp(g.target)}${g.deadline ? ` by ${g.deadline}` : ""}), using his actual spending.`} /><ActionButton url={`/api/entity/finance_goals/${g.id}`} method="DELETE" confirm="Delete goal?" className="chip text-rose">Delete</ActionButton></div>
                </div>
              ))}
            </div>
          ) : <div className="mt-4"><Empty icon="target" title="No savings goals" body="A deposit, an emergency fund, a trip, a business: name it and your planner works out the monthly number." /></div>}
          <Section title="New goal"><div className="mx-5 lg:mx-0"><CreateForm table="finance_goals" submit="Add goal" fields={[{ name: "name", label: "What for?" }, { name: "target", label: "Target £", type: "number" }, { name: "saved", label: "Saved so far £", type: "number" }, { name: "deadline", label: "By when", type: "date" }]} /></div></Section>
        </>
      )}
      {tab === "accounts" && (
        <>
          <div className="mx-5 mt-3 grid grid-cols-3 gap-2.5 lg:mx-0"><Stat label="Net worth" value={gbp(s.netWorth)} /><Stat label="Assets" value={gbp(s.assets)} /><Stat label="Debts" value={gbp(s.debts)} /></div>
          {accounts.length > 0 && (
            <div className="mx-5 mt-3 space-y-2 lg:mx-0">
              {accounts.map((a) => (
                <div key={a.id} className="card flex items-center gap-3 p-3.5">
                  <div className="min-w-0 flex-1"><div className="text-[14.5px] font-medium">{a.name}</div><div className="text-[12px] capitalize text-muted">{a.kind} · updated {fmtDate(a.updated_at)}</div></div>
                  <div className="w-32"><EditField table="accounts" id={a.id} field="balance" value={String(a.balance)} type="number" className="py-2 text-right tabular-nums" /></div>
                  <ActionButton url={`/api/entity/accounts/${a.id}`} method="DELETE" confirm="Remove account?" className="text-faint"><Icon name="trash" size={14} /></ActionButton>
                </div>
              ))}
            </div>
          )}
          <p className="mx-5 mt-3 text-[12px] text-faint lg:mx-0">Balances are what you enter (use negative numbers for credit cards and loans). There's no bank connection.</p>
          <Section title="Add an account"><div className="mx-5 lg:mx-0"><CreateForm table="accounts" submit="Add" fields={[{ name: "name", label: "Name (e.g. Monzo, ISA, Amex)" }, { name: "kind", label: "Type", options: ["current", "savings", "investment", "pension", "credit", "loan", "cash", "other"] }, { name: "balance", label: "Balance £", type: "number" }]} /></div></Section>
        </>
      )}
      <p className="mx-5 mt-10 text-[11.5px] text-faint lg:mx-0">General budgeting guidance, not regulated financial, tax or investment advice.</p>
    </div>
  );
}

type S = ReturnType<typeof summarise>;

function Overview({ s, reports }: { s: S; reports: { id: string; title: string; summary: string }[] }) {
  const max = Math.max(1, ...s.months.map((m) => Math.max(m.spend, m.income)));
  const topCat = s.byCategory[0]?.[1] ?? 1;
  return (
    <>
      <div className="mx-5 mt-3 grid grid-cols-2 gap-2.5 lg:mx-0 lg:grid-cols-4">
        <Stat label="Spent this month" value={gbp(s.spendThisMonth)} sub={`On track for ${gbp(s.projected)}`} />
        <Stat label="Income" value={gbp(s.incomeThisMonth)} sub={`Net ${gbp(s.net)}`} />
        <Stat label="Budget left" value={s.totalBudget ? gbp(s.budgetLeft) : "—"} sub={s.totalBudget ? `of ${gbp(s.totalBudget)} across ${s.budgetRows.length} budget${s.budgetRows.length > 1 ? "s" : ""}` : "No budgets set"} />
        <Stat label="Net worth" value={gbp(s.netWorth)} sub={`${gbp(s.subsMonthly)}/mo subscriptions`} />
      </div>
      <div className="mx-5 mt-3 flex flex-wrap gap-2 lg:mx-0">
        <Delegate label="Money check-in" kind="finance_review" className="btn-primary" icon="sparkle" />
        <AskButton label="Ask your planner" suggestions={["How much can I safely spend this weekend?", "Build me a savings plan for a £10k emergency fund", "Where could I save £200 a month?", "Should I prioritise paying off my card or saving?", "Plan a budget for a trip to Tokyo"]} />
      </div>
      <Section title="Last six months">
        <figure className="mx-5 card p-4 lg:mx-0">
          <figcaption className="mb-3 flex items-center gap-4 text-[12px] text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-ink" /> Spending</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-sage" /> Income</span>
          </figcaption>
          <div className="flex h-40 items-end gap-3" role="img" aria-label="Monthly spending and income">
            {s.months.map((m) => (
              <div key={m.month} className="group relative flex h-full flex-1 flex-col justify-end">
                <div className="flex h-full items-end justify-center gap-[2px]">
                  <div title={`${m.month} spending ${gbp(m.spend)}`} className="w-1/2 max-w-5 rounded-t-[4px] bg-ink/85" style={{ height: `${(m.spend / max) * 100}%`, minHeight: m.spend ? 2 : 0 }} />
                  <div title={`${m.month} income ${gbp(m.income)}`} className="w-1/2 max-w-5 rounded-t-[4px] bg-sage" style={{ height: `${(m.income / max) * 100}%`, minHeight: m.income ? 2 : 0 }} />
                </div>
                <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] text-bg group-hover:block">{gbp(m.spend)} out · {gbp(m.income)} in</div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-3 border-t border-line pt-2">{s.months.map((m) => <div key={m.month} className="flex-1 text-center text-[11px] text-muted">{fmtDate(`${m.month}-15`, { month: "short" })}</div>)}</div>
          <table className="sr-only"><thead><tr><th>Month</th><th>Spending</th><th>Income</th></tr></thead><tbody>{s.months.map((m) => <tr key={m.month}><td>{m.month}</td><td>{m.spend.toFixed(2)}</td><td>{m.income.toFixed(2)}</td></tr>)}</tbody></table>
        </figure>
      </Section>
      {s.byCategory.length > 0 && (
        <Section title="Where it went" href="/finance?tab=transactions">
          <div className="mx-5 card space-y-2.5 p-4 lg:mx-0">
            {s.byCategory.slice(0, 8).map(([c, v]) => (
              <Link key={c} href={`/finance?tab=transactions&cat=${encodeURIComponent(c)}&month=${s.month}`} className="flex items-center gap-3 text-[13.5px]">
                <span className="w-32 truncate">{c}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-accent" style={{ width: `${(v / topCat) * 100}%` }} /></div>
                <span className="w-16 text-right tabular-nums text-muted">{gbp(v)}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}
      {s.budgetRows.some((b) => b.over || b.ahead) && (
        <Section title="Watch" href="/finance?tab=budgets">
          <List>{s.budgetRows.filter((b) => b.over || b.ahead).map((b) => <Row key={b.category} title={b.category} sub={`${gbp(b.spent)} of ${gbp(b.limit)}`} right={<Pill status={b.over ? "failed" : "pending"} label={b.over ? "Over budget" : "Ahead of pace"} />} />)}</List>
        </Section>
      )}
      <Section title="Coming up" href="/finance?tab=bills">
        {s.upcoming.length ? <List>{s.upcoming.map((r) => <Row key={r.id} title={r.name} sub={`${fmtDate(r.next_date, { weekday: "short", day: "numeric", month: "short" })} · ${r.kind}`} right={<span className={`tabular-nums ${r.kind === "income" ? "text-sage" : ""}`}>{r.kind === "income" ? "+" : ""}{gbp(r.amount, 2)}</span>} />)}</List> : <div className="mx-5 text-[13.5px] text-muted lg:mx-0">Nothing due in the next two weeks.</div>}
      </Section>
      {s.goalRows.length > 0 && (
        <Section title="Goals" href="/finance?tab=goals">
          <div className="mx-5 space-y-2 lg:mx-0">{s.goalRows.map((g) => <div key={g.id} className="card p-3.5"><div className="flex justify-between text-[14px]"><span className="font-medium">{g.name}</span><span className="tabular-nums text-muted">{Math.round(g.pct * 100)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-sage" style={{ width: `${g.pct * 100}%` }} /></div></div>)}</div>
        </Section>
      )}
      {reports.length > 0 && <Section title="From your planner"><List>{reports.map((r) => <Row key={r.id} href={`/reports/${r.id}`} title={r.title} sub={r.summary} left={<Icon name="wallet" size={18} className="text-accent" />} />)}</List></Section>}
    </>
  );
}

function Transactions({ txns }: { txns: { id: string; date: string; description: string; amount: number; category: string; source: string }[] }) {
  if (!txns.length) return <div className="mt-4"><Empty icon="wallet" title="No transactions" /></div>;
  const groups = txns.reduce((m, t) => m.set(t.date, [...(m.get(t.date) ?? []), t]), new Map<string, typeof txns>());
  return (
    <div className="mx-5 mt-3 space-y-4 lg:mx-0">
      {[...groups].map(([d, list]) => (
        <div key={d}>
          <div className="eyebrow mb-1.5">{fmtDate(d, { weekday: "short", day: "numeric", month: "short" })}</div>
          <div className="divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-line/70">
            {list.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px]">{t.description}</div>
                  <form className="mt-0.5"><CategorySelect id={t.id} value={t.category} /></form>
                </div>
                <div className={`shrink-0 text-[14.5px] tabular-nums ${t.amount > 0 ? "text-sage" : ""}`}>{t.amount > 0 ? "+" : ""}{gbp(t.amount, 2)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

