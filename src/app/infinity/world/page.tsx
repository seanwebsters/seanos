import Link from "next/link";
import { getDb } from "@/lib/db";
import { syncGraph } from "@/lib/graph/workflows";
import { loadWorld } from "@/lib/graph/query";
import { searchNodes } from "@/lib/graph/search";
import { ActionButton } from "@/components/client";
import { PageHeader, Tabs } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { WorldGraph, GLYPH, GROUP } from "@/components/WorldGraph";

export const dynamic = "force-dynamic";

const FILTERS: [string, string, string[]][] = [
  ["all", "Everything", []], ["people", "People", ["person"]], ["orgs", "Companies", ["company", "organisation"]],
  ["yours", "Yours", ["project", "goal", "idea", "skill"]], ["signals", "Trends & tech", ["trend", "technology", "product", "market"]], ["events", "Events", ["event"]],
];

export default async function World({ searchParams }: { searchParams: Promise<{ focus?: string; f?: string; q?: string; view?: string }> }) {
  const { focus, f = "all", q = "", view = "graph" } = await searchParams;
  await syncGraph();
  const w = await loadWorld();
  const types = FILTERS.find((x) => x[0] === f)?.[2] ?? [];
  const results = q ? await searchNodes([...w.nodes.values()], q, 20) : [];
  const conflicts = view === "conflicts" ? await getDb().list("graph_conflicts", { where: { status: "open" }, orderBy: { column: "created_at", ascending: false } }) : [];
  const focusNode = focus ? w.nodes.get(focus) : null;
  const list = [...w.nodes.values()].filter((n) => !types.length || types.includes(n.type)).sort((a, b) => a.name.localeCompare(b.name));
  const base = `/infinity/world?${focus ? `focus=${focus}&` : ""}${f !== "all" ? `f=${f}&` : ""}`;
  return (
    <div>
      <PageHeader back="/infinity" title="Your world" eyebrow="Knowledge graph" subtitle={focusNode ? <>Centred on <Link className="text-accent" href={`/infinity/node/${focusNode.id}`}>{focusNode.name}</Link> · <Link href="/infinity/world" className="underline">show everything</Link></> : `${w.nodes.size} entities, ${w.edges.length} relationships`} />
      <form className="mx-5 mt-1 lg:mx-0">
        {focus && <input type="hidden" name="focus" value={focus} />}
        <div className="relative"><Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" /><input name="q" defaultValue={q} placeholder="Find a person, company, idea, trend…" className="field pl-11" /></div>
      </form>
      {q && (
        <div className="mx-5 mt-3 space-y-1.5 lg:mx-0">
          {results.length ? results.map((n) => <Link key={n.id} href={`/infinity/node/${n.id}`} className="card flex items-center gap-3 p-3"><span className="w-8 text-center text-[12px] font-bold text-muted">{GLYPH[n.type]}</span><span className="min-w-0 flex-1"><span className="block truncate text-[14.5px] font-medium">{n.name}</span><span className="block truncate text-[12px] text-muted">{n.type} · {n.summary}</span></span></Link>) : <div className="text-[13.5px] text-muted">No matches.</div>}
        </div>
      )}
      <div className="mt-3"><Tabs base={`${base}`.replace(/&$/, "")} active={view} tabs={[{ key: "graph", label: "Graph" }, { key: "list", label: "List" }, { key: "conflicts", label: "Contradictions" }]} /></div>
      {view !== "conflicts" && (
        <div className="no-scrollbar mx-5 mt-1 flex gap-1.5 overflow-x-auto lg:mx-0">
          {FILTERS.map(([k, label]) => <Link key={k} href={`/infinity/world?${focus ? `focus=${focus}&` : ""}f=${k}&view=${view}`} className={`chip shrink-0 ${f === k ? "bg-ink text-bg" : ""}`}>{label}</Link>)}
        </div>
      )}
      {view === "graph" && <div className="mx-5 mt-3 lg:mx-0"><WorldGraph focus={focus ?? null} types={types} height={560} /></div>}
      {view === "list" && (
        <div className="mx-5 mt-3 divide-y divide-line overflow-hidden rounded-card bg-surface ring-1 ring-line/70 lg:mx-0">
          {list.map((n) => (
            <Link key={n.id} href={`/infinity/node/${n.id}`} className="flex items-center gap-3 px-4 py-3">
              <span className="w-8 text-center text-[12px] font-bold text-muted">{GLYPH[n.type]}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-[14.5px] font-medium">{n.name}</span><span className="block truncate text-[12px] text-muted">{n.type}{GROUP[n.type] ? "" : ""} · {(w.adj.get(n.id) ?? []).length} connections · {Math.round(n.confidence * 100)}%{n.verified ? " · verified" : ""}{n.scope === "work" ? " · work" : ""}</span></span>
              <Icon name="chevron" size={16} className="text-faint" />
            </Link>
          ))}
        </div>
      )}
      {view === "conflicts" && (
        <div className="mx-5 mt-3 space-y-2.5 lg:mx-0">
          {conflicts.length ? conflicts.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="text-[14.5px] leading-snug">{c.description}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {c.options.map((o) => <ActionButton key={o} url={`/api/graph/conflict/${c.id}`} body={{ choice: o, mode: "past" }} className="chip" toastText="Resolved">“{o}” is current</ActionButton>)}
                {c.kind === "functional" && <ActionButton url={`/api/graph/conflict/${c.id}`} body={{ mode: "both" }} className="chip">Both true</ActionButton>}
                <ActionButton url={`/api/graph/conflict/${c.id}`} body={{ mode: "dismiss" }} className="chip">Dismiss</ActionButton>
                <Link href={`/infinity/node/${c.node_id}`} className="chip">Open</Link>
              </div>
            </div>
          )) : <div className="rounded-card border border-dashed border-line p-8 text-center text-[14px] text-muted">No contradictions. When sources disagree (two current employers, conflicting roles), they appear here for you to settle.</div>}
        </div>
      )}
    </div>
  );
}
