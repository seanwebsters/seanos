import Link from "next/link";
import { getDb } from "@/lib/db";
import { Empty, PageHeader } from "@/components/ui";
import { PipelineControls } from "@/components/founder";

export const dynamic = "force-dynamic";

const ORDER = ["researching", "shortlisted", "contacted", "meeting", "diligence", "term_sheet", "committed", "passed"];

export default async function InvestorsPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const stage = (await searchParams).stage;
  const db = getDb();
  const pipeline = await db.list("investor_pipeline");
  const investors = new Map((await db.list("investors")).map((i) => [i.id, i]));
  const ventures = new Map((await db.list("ventures")).map((v) => [v.id, v]));
  const rows = pipeline.filter((p) => !stage || p.stage === stage).sort((a, b) => ORDER.indexOf(a.stage) - ORDER.indexOf(b.stage) || b.fit_score - a.fit_score);
  const counts = Object.fromEntries(ORDER.map((s) => [s, pipeline.filter((p) => p.stage === s).length]));
  return (
    <div className="wide pb-10">
      <PageHeader back="/founder" eyebrow="Founder OS" title="Investor CRM" subtitle="Every investor here was found with a live source. Stages are your record of what happened; the system never marks anyone as contacted." />
      <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto px-5 lg:px-0">
        <Link href="/founder/investors" className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] ${!stage ? "bg-ink text-bg" : "bg-raised text-muted"}`}>All ({pipeline.length})</Link>
        {ORDER.map((s) => <Link key={s} href={`/founder/investors?stage=${s}`} className={`shrink-0 rounded-full px-3 py-1.5 text-[12.5px] ${stage === s ? "bg-ink text-bg" : "bg-raised text-muted"}`}>{s.replace("_", " ")} ({counts[s]})</Link>)}
      </div>
      <div className="mt-4 space-y-3">
        {rows.length ? rows.map((p) => {
          const inv = investors.get(p.investor_id);
          const v = ventures.get(p.venture_id);
          if (!inv) return null;
          return (
            <div key={p.id} className="card mx-5 p-4 lg:mx-0">
              <div className="flex flex-wrap items-center gap-2"><span className="text-[15px] font-semibold">{inv.name}</span>{inv.firm && inv.firm !== inv.name && <span className="text-[13px] text-muted">{inv.firm}</span>}<span className="rounded-full bg-raised px-2 py-0.5 text-[11px]">{inv.kind}</span>{v && <Link href={`/founder/v/${v.id}?tab=investors`} className="ml-auto text-[12px] text-accent">{v.name}</Link>}</div>
              <div className="mt-1 text-[13px] text-muted">{inv.thesis}</div>
              <div className="mt-1 text-[11.5px] text-faint">fit {p.fit_score}/10 · {inv.sources.length} source{inv.sources.length === 1 ? "" : "s"} · verified {inv.last_verified}{p.follow_up_at ? ` · follow up ${p.follow_up_at.slice(0, 10)}` : ""}</div>
              <div className="mt-2"><PipelineControls entry={p} /></div>
            </div>
          );
        }) : <Empty icon="coin" title="No investors yet" body="Open a venture and run Find investors, or Build the business." />}
      </div>
    </div>
  );
}
