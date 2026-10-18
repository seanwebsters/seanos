import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { loadWorld, helpers, describePath } from "@/lib/graph/query";
import { SELF_ID } from "@/lib/graph/project";
import { fmtDate, relTime } from "@/lib/time";
import { ActionButton, Delegate } from "@/components/client";
import { PageHeader, Section, hostOf } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { WorldGraph, GLYPH } from "@/components/WorldGraph";
import { AskWorld, NodeEditor } from "../../client";

export const dynamic = "force-dynamic";

const RECORD_HREF: Record<string, (id: string) => string> = { person: (id) => `/people/${id}`, partnership: (id) => `/calmlings/${id}`, idea: (id) => `/ideas/${id}`, trend: (id) => `/trends/${id}`, speaking: (id) => `/speaking/${id}`, ambition: (id) => `/infinity/strategy/${id}` };
const TYPES = ["person", "company", "organisation", "project", "idea", "trend", "technology", "market", "event", "goal", "document", "decision", "skill", "product", "place", "topic"];

export default async function NodePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  let n = await db.get("graph_nodes", id);
  if (n?.status === "merged" && n.merged_into) n = await db.get("graph_nodes", n.merged_into);
  if (!n) notFound();
  const w = await loadWorld();
  const rels = (w.adj.get(n.id) ?? []).sort((a, b) => b.edge.confidence - a.edge.confidence);
  const conflicts = await db.list("graph_conflicts", { where: { node_id: n.id, status: "open" } });
  const help = n.type !== "person" && n.id !== SELF_ID ? helpers(w, n.id, 5) : [];
  const ctx = { type: "node", id: n.id, title: n.name };
  const recordHref = n.record_ref ? RECORD_HREF[n.record_ref.type]?.(n.record_ref.id) : null;
  return (
    <div>
      <PageHeader back="/infinity/world" title={n.name} eyebrow={`${GLYPH[n.type] ?? ""} ${n.type}${n.scope === "work" ? " · work (private)" : n.scope === "personal" ? " · personal" : ""}`} actions={<span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${n.verified ? "bg-sage/15 text-sage" : "bg-raised text-muted"}`}>{n.verified ? "Verified by you" : `${Math.round(n.confidence * 100)}% confidence`}</span>} />
      <div className="mx-5 lg:mx-0">
        {n.summary && <p className="font-serif text-[18px] leading-relaxed">{n.summary}</p>}
        {Object.keys(n.attributes).length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{Object.entries(n.attributes).filter(([, v]) => v).map(([k, v]) => <span key={k} className="rounded-full bg-raised px-2.5 py-1 text-[12px]"><span className="text-muted">{k.replace(/_/g, " ")}:</span> {v}</span>)}</div>}
        {n.aliases.length > 0 && <div className="mt-2 text-[12.5px] text-muted">Also known as {n.aliases.join(", ")}</div>}
        <div className="mt-2 text-[12px] text-faint">First seen {fmtDate(n.first_seen, { day: "numeric", month: "short", year: "numeric" })} · updated {relTime(n.updated_at)}{recordHref ? <> · <Link href={recordHref} className="text-accent">open in SEAN OS</Link></> : null}</div>
        {conflicts.map((c) => <Link key={c.id} href="/infinity/world?view=conflicts" className="mt-3 block rounded-2xl bg-rose/10 p-3 text-[13.5px] text-rose">⚠ {c.description}</Link>)}
      </div>
      <Section title="Connections">
        <div className="mx-5 lg:mx-0"><WorldGraph focus={n.id} height={360} /></div>
        <div className="mx-5 mt-3 space-y-1.5 lg:mx-0">
          {rels.map(({ edge, other, dir }) => {
            const o = w.nodes.get(other);
            if (!o) return null;
            const s = edge.sources.find((x) => x.quote) ?? edge.sources[0];
            return (
              <div key={edge.id} className="card p-3.5">
                <div className="flex items-center gap-2 text-[14px]">
                  <span className="text-muted">{dir === "out" ? edge.label : `${edge.label} (by)`}</span>
                  <Link href={`/infinity/node/${o.id}`} className="font-semibold">{o.name}</Link>
                  <span className="ml-auto shrink-0 text-[11.5px] text-faint">{Math.round(edge.confidence * 100)}%{edge.valid_to ? ` · ended ${edge.valid_to}` : ""}</span>
                </div>
                {s && <div className="mt-1 text-[12px] text-muted">{s.quote ? <>“{s.quote}” </> : null}{s.url ? <a href={s.url} target="_blank" rel="noreferrer noopener" className="text-accent">{hostOf(s.url)}</a> : <span>{s.kind === "user" ? "You" : s.kind === "record" ? `From ${s.ref?.split(":")[0]}` : s.ref}</span>}{edge.sources.length > 1 ? ` · +${edge.sources.length - 1} sources` : ""}</div>}
                <div className="mt-2 flex gap-1.5">
                  {edge.confidence < 1 && <ActionButton url={`/api/graph/edge/${edge.id}`} body={{ action: "confirm" }} className="chip px-2.5 py-1 text-[11.5px]">Confirm</ActionButton>}
                  {!edge.valid_to && <ActionButton url={`/api/graph/edge/${edge.id}`} body={{ action: "end" }} className="chip px-2.5 py-1 text-[11.5px]">No longer true</ActionButton>}
                  <ActionButton url={`/api/graph/edge/${edge.id}`} body={{ action: "retract" }} className="chip px-2.5 py-1 text-[11.5px] text-rose">Wrong</ActionButton>
                </div>
              </div>
            );
          })}
          {!rels.length && <div className="text-[13.5px] text-muted">No connections yet.</div>}
        </div>
      </Section>
      {help.length > 0 && (
        <Section title="Who could help">
          <div className="mx-5 space-y-1.5 lg:mx-0">{help.map((h) => <Link key={h.person.id} href={`/infinity/node/${h.person.id}`} className="card block p-3.5 text-[13.5px]"><span className="font-semibold">{h.person.name}</span>{h.inNetwork && <span className="ml-2 rounded-full bg-sage/15 px-2 py-0.5 text-[11px] text-sage">in your network</span>}<div className="mt-0.5 text-[12px] text-muted">{describePath(w, h.path!, h.person.id)}</div></Link>)}</div>
        </Section>
      )}
      <Section title="Ask about this">
        <div className="mx-5 lg:mx-0"><AskWorld context={ctx} examples={[`Show me everything related to ${n.name}`, `Who in my network could help with ${n.name}?`, `How could ${n.name} matter for Calmlings?`]} /></div>
        <div className="mx-5 mt-3 flex flex-wrap gap-2 lg:mx-0">
          <Delegate label="Research this" kind="research_report" instruction={`Research ${n.name} (${n.type}) for Sean: what it is, recent developments, key people, and why it might matter to his work.`} context={ctx} />
          {n.type === "idea" && <Delegate label="Launch a research team" instruction={`Assemble the right specialists to evaluate the idea "${n.name}": market, competitors, model, and a recommendation.`} context={ctx} />}
          {["company", "organisation"].includes(n.type) && <Delegate label="Find the right people there" kind="people_weekly" params={{ count: 4, brief: `People at ${n.name} relevant to Sean (founders, partnerships, creative leads).` }} />}
        </div>
      </Section>
      <Section title="Correct this">
        <div className="mx-5 lg:mx-0">
          <NodeEditor id={n.id} name={n.name} summary={n.summary} type={n.type} scope={n.scope} aliases={n.aliases} types={TYPES} />
          <div className="mt-3 flex flex-wrap gap-2">
            {!n.verified && <ActionButton url={`/api/graph/node/${n.id}`} method="PATCH" body={{ verified: true }} className="chip" toastText="Verified"><Icon name="check" size={14} /> This is right</ActionButton>}
            {n.id !== SELF_ID && <ActionButton url={`/api/graph/node/${n.id}`} method="DELETE" confirm="Forget this entity? It's removed from every view and agent." after="/infinity/world" className="chip text-rose"><Icon name="trash" size={14} /> Forget</ActionButton>}
          </div>
          <details className="mt-4 text-[12.5px] text-muted"><summary className="cursor-pointer">Provenance ({n.sources.length})</summary><ul className="mt-2 space-y-1">{n.sources.map((s, i) => <li key={i}>{s.kind} · {s.ref ?? ""} {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="text-accent">{hostOf(s.url)}</a> : null} · {relTime(s.at)}</li>)}</ul></details>
        </div>
      </Section>
    </div>
  );
}
