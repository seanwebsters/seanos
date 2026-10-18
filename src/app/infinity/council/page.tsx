import Link from "next/link";
import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { relTime } from "@/lib/time";
import { LiveRefresh } from "@/components/client";
import { Empty, PageHeader, Pill, Section } from "@/components/ui";
import { DecisionForm } from "../client";

export const dynamic = "force-dynamic";

export default async function Council() {
  await ensureBootstrapped();
  const db = getDb();
  const list = (await db.list("decisions", { orderBy: { column: "updated_at", ascending: false } })).filter((d) => d.status !== "archived");
  return (
    <div>
      <LiveRefresh active={list.some((d) => d.status === "deliberating")} />
      <PageHeader back="/infinity" title="Intelligence Council" eyebrow="Important decisions" subtitle="Seven independent lenses (Visionary, Investor, Operator, Creative Director, Researcher, Sceptic, Personal Strategist), then one synthesis and what would change its mind." />
      <div className="mx-5 mt-2 card p-5 lg:mx-0"><DecisionForm /></div>
      <Section title="Decisions">
        {list.length ? (
          <div className="mx-5 space-y-2.5 lg:mx-0">
            {list.map((d) => (
              <Link key={d.id} href={`/infinity/council/${d.id}`} className="card block p-4">
                <div className="flex items-center justify-between gap-2"><span className="text-[11.5px] text-muted">{relTime(d.updated_at)}</span><Pill status={d.status === "deliberating" ? "running" : d.status === "ready" ? "pending" : "completed"} label={d.status === "ready" ? "Ready for you" : d.status} /></div>
                <div className="mt-1 font-serif text-[17px] font-medium leading-snug">{d.question}</div>
                {d.recommendation && <div className="mt-1.5 text-[13px] text-muted">Recommends: <span className="text-ink">{d.recommendation.option}</span> · {Math.round(d.recommendation.confidence * 100)}%{d.decided_option ? ` · you chose ${d.decided_option}` : ""}</div>}
              </Link>
            ))}
          </div>
        ) : <Empty icon="people" title="No decisions yet" body="Bring the council the decisions that matter. It researches the unknowns first, then each lens critiques independently." />}
      </Section>
    </div>
  );
}
