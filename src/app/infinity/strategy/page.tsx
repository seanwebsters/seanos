import Link from "next/link";
import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { progressOf } from "@/lib/strategy/core";
import { LiveRefresh } from "@/components/client";
import { PageHeader, Section } from "@/components/ui";
import { AmbitionForm } from "../client";

export const dynamic = "force-dynamic";

export default async function Strategy() {
  await ensureBootstrapped();
  const db = getDb();
  const ambitions = (await db.list("ambitions", { orderBy: { column: "updated_at", ascending: false } })).filter((a) => a.status !== "dropped");
  const items = await db.list("strategy_items");
  const rows = await Promise.all(ambitions.map(async (a) => {
    const mine = items.filter((i) => i.ambition_id === a.id && i.status !== "dropped");
    const roots = mine.filter((i) => !i.parent_id);
    const memo = new Map<string, number>();
    const p = roots.length ? (await Promise.all(roots.map((r) => progressOf(r, mine, memo)))).reduce((s, v) => s + v, 0) / roots.length : 0;
    return { a, p, n: mine.length };
  }));
  const planning = (await db.list("tasks", { where: { kind: "ambition_plan", status: ["queued", "running"] } })).length > 0;
  return (
    <div>
      <LiveRefresh active={planning} />
      <PageHeader back="/infinity" title="Strategy" eyebrow="Ambitions → actions" subtitle="Give SEAN ∞ an ambition, not a task. It becomes a measurable strategy your team can work on." />
      <div className="mx-5 mt-3 card p-5 lg:mx-0">
        <div className="display mb-3 text-[24px] leading-tight">Here's where I want to be…</div>
        <AmbitionForm />
      </div>
      {rows.length > 0 && (
        <Section title="Your ambitions">
          <div className="mx-5 space-y-2.5 lg:mx-0">
            {rows.map(({ a, p, n }) => (
              <Link key={a.id} href={`/infinity/strategy/${a.id}`} className="card block p-5">
                <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wider text-muted"><span>{a.horizon} · {a.status === "drafting" ? "planning…" : a.status}</span><span>{Math.round(p * 100)}%</span></div>
                <div className="mt-1.5 font-serif text-[19px] font-medium leading-snug">{a.statement}</div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, p * 100)}%` }} /></div>
                <div className="mt-2 text-[12px] text-faint">{n} items in the plan</div>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
