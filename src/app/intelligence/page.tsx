import Link from "next/link";
import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { fmtDate } from "@/lib/time";
import { Empty, PageHeader } from "@/components/ui";
import { AskButton, Delegate, LiveRefresh } from "@/components/client";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function Intelligence({ searchParams }: { searchParams: Promise<{ q?: string; kind?: string }> }) {
  await ensureBootstrapped();
  const { q = "", kind = "" } = await searchParams;
  const db = getDb();
  const reports = await db.list("reports", { orderBy: { column: "created_at", ascending: false } });
  const kinds = [...new Set(reports.map((r) => r.kind))];
  const needle = q.toLowerCase();
  const list = reports.filter((r) => (!kind || r.kind === kind) && (!needle || `${r.title} ${r.summary} ${r.body} ${r.tags.join(" ")}`.toLowerCase().includes(needle)));
  const running = (await db.list("tasks", { where: { kind: ["research_report", "intel_briefing"], status: ["queued", "running"] } })).length > 0;
  return (
    <div>
      <LiveRefresh active={running} />
      <PageHeader title="Intelligence" eyebrow="Research department" subtitle="Sourced reports, market maps and briefings, all searchable." actions={<AskButton label="Research" className="btn-primary" suggestions={["Research the AI animation market", "Map the companies building AI tools for character IP", "What are the newest AI video models and how do they compare?", "Research how kids' entertainment IP is licensed in Asia"]} />} />
      <div className="mx-5 mt-2 flex flex-wrap gap-2 lg:mx-0"><Delegate label="This week's intelligence briefing" kind="intel_briefing" className="btn-ghost" icon="sparkle" /></div>
      <form className="mx-5 mt-4 lg:mx-0">
        <div className="relative"><Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" /><input name="q" defaultValue={q} placeholder="Search your knowledge library" className="field pl-11" /></div>
      </form>
      {kinds.length > 1 && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-5 lg:px-0">
          <Link href="/intelligence" className={`chip shrink-0 ${!kind ? "bg-ink text-bg" : ""}`}>All</Link>
          {kinds.map((k) => <Link key={k} href={`/intelligence?kind=${k}`} className={`chip shrink-0 capitalize ${kind === k ? "bg-ink text-bg" : ""}`}>{k.replace(/_/g, " ")}</Link>)}
        </div>
      )}
      {list.length ? (
        <div className="mx-5 mt-4 grid gap-3 sm:grid-cols-2 lg:mx-0">
          {list.map((r) => (
            <Link key={r.id} href={`/reports/${r.id}`} className="card block p-4 active:scale-[0.99]">
              <div className="flex items-center justify-between"><span className="eyebrow">{r.kind.replace(/_/g, " ")}</span><span className="text-[11.5px] text-faint">{fmtDate(r.created_at)}</span></div>
              <div className="mt-2 font-serif text-[18px] font-medium leading-snug">{r.title}</div>
              <p className="mt-1.5 line-clamp-3 text-[13.5px] text-muted">{r.summary}</p>
              <div className="mt-3 flex items-center gap-2 text-[12px] text-faint">{r.sources.length} sources{r.slides.length ? ` · ${r.slides.length} slides` : ""}{r.scope === "work" ? <><Icon name="lock" size={11} /> work</> : null}</div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-4"><Empty icon="chart" title={q ? "No matches" : "Your library is empty"} body="Delegate research from anywhere: an article, a person, a company or an idea. Every report lands here with its sources." /></div>
      )}
    </div>
  );
}
