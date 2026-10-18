import Link from "next/link";
import { changesSince } from "@/lib/graph/query";
import { syncGraph } from "@/lib/graph/workflows";
import { getDb } from "@/lib/db";
import { relTime } from "@/lib/time";
import { PageHeader, Section, Tabs } from "@/components/ui";
import { GLYPH } from "@/components/WorldGraph";

export const dynamic = "force-dynamic";

export default async function Changes({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "month" } = await searchParams;
  await syncGraph();
  const days = tab === "week" ? 7 : tab === "quarter" ? 90 : 30;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const c = await changesSince(since);
  const db = getDb();
  const names = new Map((await db.list("graph_nodes")).map((n) => [n.id, n.name]));
  return (
    <div>
      <PageHeader back="/infinity" title="What changed" eyebrow="Your world over time" subtitle={`${c.added.length} new entities, ${c.edges.length} new relationships, ${c.conflicts.length} contradictions`} />
      <Tabs base="/infinity/changes" active={tab} tabs={[{ key: "week", label: "This week" }, { key: "month", label: "Last month" }, { key: "quarter", label: "Last quarter" }]} />
      <Section title="New in your world">
        <div className="mx-5 grid gap-1.5 sm:grid-cols-2 lg:mx-0">{c.added.slice(0, 60).map((n) => <Link key={n.id} href={`/infinity/node/${n.id}`} className="card flex items-center gap-3 p-3"><span className="w-7 text-center text-[12px] font-bold text-muted">{GLYPH[n.type]}</span><span className="min-w-0 flex-1 truncate text-[14px]">{n.name}</span><span className="text-[11px] text-faint">{relTime(n.first_seen)}</span></Link>)}</div>
        {!c.added.length && <div className="mx-5 text-[13.5px] text-muted lg:mx-0">Nothing new in this period.</div>}
      </Section>
      {c.edges.length > 0 && (
        <Section title="New relationships">
          <div className="mx-5 space-y-1 text-[13.5px] lg:mx-0">{c.edges.slice(0, 60).map((e) => <div key={e.id} className="rounded-xl bg-raised px-3 py-2"><Link href={`/infinity/node/${e.from}`} className="font-medium">{names.get(e.from)}</Link> <span className="text-muted">{e.label}</span> <Link href={`/infinity/node/${e.to}`} className="font-medium">{names.get(e.to)}</Link><span className="float-right text-[11px] text-faint">{Math.round(e.confidence * 100)}%</span></div>)}</div>
        </Section>
      )}
      {c.updated.length > 0 && <Section title="Updated"><div className="mx-5 flex flex-wrap gap-1.5 lg:mx-0">{c.updated.slice(0, 40).map((n) => <Link key={n.id} href={`/infinity/node/${n.id}`} className="chip">{n.name}</Link>)}</div></Section>}
    </div>
  );
}
