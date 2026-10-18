import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { ActionButton, LiveRefresh } from "@/components/client";
import { PageHeader, Section, Sources } from "@/components/ui";
import { FutureLab } from "@/components/FutureLab";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const NAME: Record<string, string> = { conservative: "Conservative", base: "Base", optimistic: "Optimistic", alternative: "Alternative" };

export default async function ScenarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const s = await db.get("scenarios", id);
  if (!s) notFound();
  const task = s.task_id ? await db.get("tasks", s.task_id) : null;
  return (
    <div>
      <LiveRefresh active={s.status === "modelling"} />
      <PageHeader back="/infinity/future" title={s.question} eyebrow="Future Engine" />
      <div className="mx-5 lg:mx-0">
        {s.status === "modelling" && <div className="flex items-center gap-2 rounded-2xl bg-sky/10 p-4 text-[14px] text-sky"><span className="h-2 w-2 animate-pulse2 rounded-full bg-sky" /> Researching and building the model… {task && <Link href={`/tasks/${task.id}`} className="ml-auto underline">Watch</Link>}</div>}
        {task?.status === "blocked" && <div className="mt-2 rounded-2xl bg-rose/10 p-4 text-[14px] text-rose">{task.error}</div>}
        {s.summary && <p className="font-serif text-[18px] leading-relaxed">{s.summary}</p>}
        {s.model_fit && <div className="mt-3 rounded-2xl bg-raised p-4 text-[13px] leading-relaxed text-muted"><span className="font-medium text-ink">How the model fits: </span>{s.model_fit}</div>}
        <div className="mt-3 flex flex-wrap gap-2">
          {s.decision_id ? <Link href={`/infinity/council/${s.decision_id}`} className="btn-ghost"><Icon name="people" size={16} /> Council review</Link>
            : s.status === "ready" && <ActionButton url="/api/infinity/decisions" body={{ question: s.question, scenario_id: s.id }} className="btn-ghost" after="/infinity/council"><Icon name="people" size={16} /> Put this to the council</ActionButton>}
        </div>
      </div>
      {s.status === "ready" && <div className="mx-5 mt-6 lg:mx-0"><FutureLab scenario={s} /></div>}
      {s.qualitative.length > 0 && (
        <Section title="Beyond the money">
          <div className="mx-5 overflow-x-auto lg:mx-0">
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-muted"><th className="py-2 font-medium">Dimension · judgement, 1–10</th>{["conservative", "base", "optimistic", "alternative"].map((k) => <th key={k} className="py-2 text-right font-medium">{NAME[k]}</th>)}</tr></thead>
              <tbody>{s.qualitative.map((q) => <tr key={q.dimension} className="border-t border-line"><td className="py-2.5 pr-3"><div className="font-medium">{q.dimension}</div><div className="text-[11.5px] text-muted">{q.note}</div></td>{[q.conservative, q.base, q.optimistic, q.alternative].map((v, i) => <td key={i} className="py-2.5 text-right tabular-nums">{v}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </Section>
      )}
      {(s.capabilities.length > 0 || s.market) && (
        <Section title="What it takes">
          <div className="mx-5 grid gap-3 lg:mx-0 lg:grid-cols-2">
            {s.capabilities.length > 0 && <div className="card p-4"><div className="eyebrow mb-2">Capabilities needed</div><ul className="space-y-1 text-[13.5px]">{s.capabilities.map((c) => <li key={c}>— {c}</li>)}</ul></div>}
            {s.market && <div className="card p-4"><div className="eyebrow mb-2">Market conditions</div><p className="text-[13.5px] leading-relaxed">{s.market}</p></div>}
          </div>
        </Section>
      )}
      <Sources sources={s.sources} />
    </div>
  );
}
