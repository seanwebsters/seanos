import Link from "next/link";
import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { simulate, gbpShort } from "@/lib/future/model";
import { relTime } from "@/lib/time";
import { LiveRefresh } from "@/components/client";
import { Empty, PageHeader, Section } from "@/components/ui";
import { ScenarioForm } from "../client";

export const dynamic = "force-dynamic";

export default async function Future() {
  await ensureBootstrapped();
  const db = getDb();
  const list = await db.list("scenarios", { orderBy: { column: "updated_at", ascending: false } });
  const running = (await db.list("tasks", { where: { kind: "scenario", status: ["queued", "running"] } }));
  return (
    <div>
      <LiveRefresh active={running.length > 0} />
      <PageHeader back="/infinity" title="Future Engine" eyebrow="Future paths" subtitle="Explore possible futures with explicit assumptions you can change. Scenarios, never predictions." />
      <div className="mx-5 mt-2 lg:mx-0"><ScenarioForm examples={["What happens if I spend six months building VoysNote?", "What if I start my own AI creative studio?", "What if I move to New York?", "What would it take to build a £10 million business?", "What if I focus exclusively on entertainment IP?"]} /></div>
      {running.map((t) => <div key={t.id} className="mx-5 mt-3 flex items-center gap-2 text-[13px] text-muted lg:mx-0"><span className="h-2 w-2 animate-pulse2 rounded-full bg-sky" /><Link href={`/tasks/${t.id}`}>{t.title}</Link></div>)}
      <Section title="Your futures">
        {list.length ? (
          <div className="mx-5 grid gap-3 sm:grid-cols-2 lg:mx-0">
            {list.map((s) => {
              const base = Object.fromEntries(s.assumptions.map((a) => [a.key, a.value]));
              const outs = s.paths.map((p) => simulate({ ...base, ...p.overrides }).net_after_opportunity);
              return (
                <Link key={s.id} href={`/infinity/future/${s.id}`} className="card block p-5 active:scale-[0.99]">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{s.status === "ready" ? `${s.paths.length} paths` : s.status} · {relTime(s.updated_at)}</div>
                  <div className="mt-1.5 font-serif text-[18px] font-medium leading-snug">{s.question}</div>
                  {outs.length > 0 && <div className="mt-2 text-[12.5px] text-muted">Range: {gbpShort(Math.min(...outs))} to {gbpShort(Math.max(...outs))} net after opportunity cost</div>}
                </Link>
              );
            })}
          </div>
        ) : <Empty icon="clock" title="No futures modelled yet" body="Ask a what-if. You'll get conservative, base, optimistic and alternative paths, the assumptions behind them, and which ones matter most." />}
      </Section>
    </div>
  );
}
