import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { relTime } from "@/lib/time";
import { List, PageHeader, Row, Section } from "@/components/ui";
import { ActionButton, AskButton, Patch } from "@/components/client";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const HREF: Record<string, string> = { trend: "/trends", idea: "/ideas", person: "/people", speaking: "/speaking", partnership: "/calmlings", node: "/infinity/node" };

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await getDb().get("opportunities", id);
  if (!o) notFound();
  const ctx = { type: "opportunity", id: o.id, title: o.title };
  return (
    <div>
      <PageHeader back="/opportunities" title={o.title} eyebrow={`Connected opportunity · ${o.score}/10`} />
      <div className="mx-5 lg:mx-0">
        <p className="font-serif text-[19px] leading-relaxed">{o.thesis}</p>
        <div className="mt-5 rounded-card bg-accent/10 p-5"><div className="eyebrow text-accent">Why now</div><p className="mt-1.5 text-[15px] leading-relaxed">{o.why_now}</p></div>
      </div>
      <Section title="How it connects">
        <List>{o.items.map((i) => <Row key={i.id} href={`${HREF[i.type] ?? "/"}/${i.id}`} title={i.title} sub={`${i.type} · ${i.role}`} />)}</List>
      </Section>
      <Section title="What we can do about it">
        <div className="mx-5 space-y-2 lg:mx-0">
          {o.actions.map((a, n) => (
            <div key={n} className="card flex items-center gap-3 p-4">
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${a.done ? "bg-sage text-[#141413]" : "bg-raised text-muted"}`}>{a.done ? <Icon name="check" size={15} /> : n + 1}</div>
              <div className="min-w-0 flex-1"><div className="text-[14.5px] font-medium">{a.label}</div><div className="line-clamp-2 text-[12.5px] text-muted">{a.instruction}</div></div>
              {!a.done && (
                <ActionButton url="/api/opportunities/act" body={{ id: o.id, index: n }} className="chip shrink-0"><Icon name="bolt" size={14} /> Delegate</ActionButton>
              )}
            </div>
          ))}
        </div>
      </Section>
      <div className="mx-5 mt-6 flex flex-wrap gap-2 lg:mx-0">
        <AskButton context={ctx} label="Ask about this" />
        <Patch table="opportunities" id={o.id} patch={{ status: "active" }} className="chip">Pursue</Patch>
        <Patch table="opportunities" id={o.id} patch={{ status: "done" }} className="chip">Done</Patch>
        <Patch table="opportunities" id={o.id} patch={{ status: "dismissed" }} className="chip">Dismiss</Patch>
      </div>
      <div className="mx-5 mt-4 text-[12px] text-faint lg:mx-0">Proposed {relTime(o.created_at)}{o.task_id ? <> · <Link href={`/tasks/${o.task_id}`} className="underline">task</Link></> : null}</div>
    </div>
  );
}
