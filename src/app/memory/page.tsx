import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { relTime } from "@/lib/time";
import { Empty, PageHeader, Tabs } from "@/components/ui";
import { ActionButton, CreateForm, EditField, Patch } from "@/components/client";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const KINDS = ["fact", "preference", "goal", "project", "relationship", "decision", "inference", "feedback"];

export default async function Memory({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  await ensureBootstrapped();
  const { tab = "all", q = "" } = await searchParams;
  const db = getDb();
  const all = await db.list("memories", { orderBy: { column: "updated_at", ascending: false } });
  const needle = q.toLowerCase();
  const list = all.filter((m) => (tab === "all" || (tab === "work" ? m.scope === "work" : tab === "learned" ? m.kind === "inference" || m.kind === "feedback" : m.kind === tab)) && (!needle || `${m.category} ${m.content}`.toLowerCase().includes(needle)));
  return (
    <div>
      <PageHeader title="Memory" eyebrow="What your team knows about you" subtitle="Facts are things you told us. Inferences are things we learned, with confidence and provenance. Edit or delete anything." actions={<a href="/api/memory/export" className="btn-ghost"><Icon name="upload" size={16} /> Export</a>} />
      <form className="mx-5 mt-2 lg:mx-0"><input name="q" defaultValue={q} placeholder="Search memory" className="field" /></form>
      <div className="mt-3"><Tabs base={`/memory${q ? `?q=${encodeURIComponent(q)}` : ""}`} active={tab} tabs={[{ key: "all", label: "All", count: all.length }, { key: "fact", label: "Facts" }, { key: "preference", label: "Preferences" }, { key: "goal", label: "Goals" }, { key: "learned", label: "Learned" }, { key: "work", label: "Work (private)" }]} /></div>
      <details className="mx-5 mt-3 card p-4 lg:mx-0">
        <summary className="cursor-pointer text-[15px] font-medium">Tell SEAN OS something</summary>
        <div className="mt-3"><CreateForm table="memories" submit="Remember this" fields={[{ name: "content", label: "e.g. I'm training for a half marathon in March", type: "textarea" }, { name: "category", label: "Category (e.g. Fitness)" }, { name: "kind", label: "Kind", options: KINDS.filter((k) => k !== "inference" && k !== "feedback") }, { name: "scope", label: "Scope", options: ["personal", "work", "public"] }]} /></div>
      </details>
      {list.length ? (
        <div className="mx-5 mt-4 space-y-2.5 lg:mx-0">
          {list.map((m) => (
            <div key={m.id} className="card p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11.5px]">
                <span className="font-semibold uppercase tracking-wider text-muted">{m.category}</span>
                <span className={`rounded-full px-2 py-0.5 font-semibold ${m.kind === "inference" ? "bg-sky/15 text-sky" : m.kind === "feedback" ? "bg-accent/15 text-accent" : "bg-raised text-muted"}`}>{m.kind === "inference" ? `inferred · ${Math.round(m.confidence * 100)}%` : m.kind}</span>
                <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${m.scope === "work" ? "bg-rose/10 text-rose" : "bg-raised text-muted"}`}>{m.scope === "work" && <Icon name="lock" size={10} />}{m.scope}</span>
                {m.pinned && <span className="text-faint">pinned</span>}
              </div>
              <EditField table="memories" id={m.id} field="content" value={m.content} multiline className="min-h-[64px] bg-transparent px-0 py-0 text-[15px] ring-0 focus:ring-0" />
              <div className="mt-2 flex items-center justify-between gap-2 text-[11.5px] text-faint">
                <span className="truncate">{m.source === "user" ? "From you" : m.source} · {m.provenance ?? ""} · {relTime(m.updated_at)}</span>
                <div className="flex shrink-0 gap-1.5">
                  {m.scope !== "work" && <Patch table="memories" id={m.id} patch={{ scope: "work" }} className="chip px-2 py-1 text-[11px]">Mark work</Patch>}
                  {m.kind === "inference" && <Patch table="memories" id={m.id} patch={{ kind: "fact", confidence: 1 }} className="chip px-2 py-1 text-[11px]">Confirm</Patch>}
                  <ActionButton url={`/api/entity/memories/${m.id}`} method="DELETE" confirm="Delete this memory?" className="chip px-2 py-1 text-[11px] text-rose"><Icon name="trash" size={12} /></ActionButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : <div className="mt-4"><Empty icon="brain" title="Nothing here" /></div>}
      <p className="mx-5 mt-6 text-[12px] text-faint lg:mx-0">Work memories (Calm Studios) are only shown to agents that handle work: Partnerships, Business Development, Research, Creative, Strategy and your Chief of Staff. Personal-brand and content agents never see them.</p>
    </div>
  );
}
