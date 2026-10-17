import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { relTime } from "@/lib/time";
import { Img, List, PageHeader, Pill, Row, Section, Sources } from "@/components/ui";
import { AskButton, CopyButton, CreateForm, Delegate, EditField, Feedback, Patch } from "@/components/client";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const p = await db.get("people", id);
  if (!p) notFound();
  const interactions = await db.list("interactions", { where: { person_id: id }, orderBy: { column: "at", ascending: false } });
  const reports = (await db.list("reports")).filter((r) => r.subject_ref?.type === "person" && r.subject_ref.id === id);
  const outreach = await db.list("outreach", { where: { target_type: "person", target_id: id } });
  const ctx = { type: "person", id: p.id, title: p.name };
  return (
    <div>
      <PageHeader back="/people" title={p.name} eyebrow={p.category} actions={<Pill status={p.status === "suggested" ? "draft" : p.status === "dismissed" ? "cancelled" : "completed"} label={p.status} />} />
      <div className="mx-5 flex items-center gap-4 lg:mx-0">
        <Img src={p.photo_url} seed={p.name} alt={p.name} className="h-20 w-20 shrink-0 rounded-full" />
        <div className="min-w-0 text-[14px]">
          <div className="font-medium">{p.role}</div>
          <div className="text-muted">{p.company}</div>
          <div className="text-faint">{p.location}</div>
        </div>
      </div>
      {p.profiles.length > 0 && (
        <div className="mx-5 mt-4 flex flex-wrap gap-2 lg:mx-0">
          {p.profiles.map((x) => <a key={x.url} href={x.url} target="_blank" rel="noreferrer noopener" className="chip"><Icon name="external" size={13} /> {x.label}</a>)}
        </div>
      )}
      <div className="mx-5 mt-6 space-y-5 lg:mx-0">
        {p.achievements.length > 0 && <div><div className="eyebrow mb-2">Recent work</div><ul className="space-y-1.5 text-[14.5px] leading-snug">{p.achievements.map((a) => <li key={a}>— {a}</li>)}</ul></div>}
        {p.why_get_along && <div><div className="eyebrow mb-1">Why you'd get along</div><p className="font-serif text-[16.5px] leading-relaxed">{p.why_get_along}</p></div>}
        {p.why_valuable && <div><div className="eyebrow mb-1">Why it's worth connecting</div><p className="font-serif text-[16.5px] leading-relaxed">{p.why_valuable}</p></div>}
        {p.conversation_starter && <div><div className="eyebrow mb-1">Conversation starter</div><p className="font-serif text-[16.5px] italic leading-relaxed">{p.conversation_starter}</p></div>}
      </div>
      <Section title="Your message">
        <div className="mx-5 lg:mx-0">
          <EditField table="people" id={p.id} field="message" value={p.message} multiline placeholder="Write a message…" className="font-serif text-[16px]" />
          <div className="mt-2 flex flex-wrap gap-2">
            <CopyButton text={p.message} />
            <Patch table="people" id={p.id} patch={{ status: "contacted", last_contact_at: new Date().toISOString() }} toastText="Marked as contacted"><Icon name="check" size={14} /> Mark contacted</Patch>
            {p.status === "suggested" && <Patch table="people" id={p.id} patch={{ status: "saved" }}><Icon name="bookmark" size={14} /> Save</Patch>}
            <Patch table="people" id={p.id} patch={{ status: "met" }}>Met in person</Patch>
          </div>
        </div>
      </Section>
      <Section title="Delegate">
        <div className="mx-5 flex flex-wrap gap-2 lg:mx-0">
          <Delegate label="Research them further" kind="person_research" params={{ person_id: p.id }} context={ctx} />
          <Delegate label="Draft an introduction" kind="outreach_draft" instruction="Draft a natural introduction message." context={ctx} />
          <Delegate label="Find more people like this" kind="people_weekly" params={{ count: 5, brief: `People similar to ${p.name} (${p.role}, ${p.company}).` }} />
          <AskButton context={ctx} className="chip" />
        </div>
      </Section>
      <Section title="Notes & reminders">
        <div className="mx-5 space-y-2 lg:mx-0">
          <EditField table="people" id={p.id} field="notes" value={p.notes} multiline placeholder="Private notes (only you see these)" />
          <label className="block text-[13px] text-muted">Remind me to follow up
            <EditField table="people" id={p.id} field="remind_at" value={p.remind_at?.slice(0, 16) ?? ""} type="datetime-local" className="mt-1" />
          </label>
        </div>
      </Section>
      <Section title="History">
        <div className="mx-5 lg:mx-0">
          <CreateForm table="interactions" extra={{ person_id: p.id }} submit="Log it" fields={[{ name: "kind", label: "Kind", options: ["note", "message", "meeting", "call", "email"] }, { name: "summary", label: "What happened?", type: "textarea" }]} />
        </div>
        {(interactions.length > 0 || outreach.length > 0) && (
          <List className="mt-3">
            {outreach.map((o) => <Row key={o.id} title={o.subject} sub={`Outreach · ${o.status}`} right={<Pill status={o.status === "sent" ? "completed" : o.status} label={o.status} />} />)}
            {interactions.map((i) => <Row key={i.id} title={i.summary} sub={`${i.kind} · ${relTime(i.at)}`} />)}
          </List>
        )}
        {reports.length > 0 && <List className="mt-3">{reports.map((r) => <Row key={r.id} href={`/reports/${r.id}`} title={r.title} sub={r.summary} />)}</List>}
      </Section>
      <Sources sources={p.sources} title="Verified from" />
      <div className="mx-5 mt-8 lg:mx-0">
        <Feedback target="person" id={p.id} title={p.name} options={[{ signal: "similar_people", label: "More people like this", icon: "heart" }, { signal: "never", label: "Not for me", icon: "thumbsdown" }]} />
      </div>
    </div>
  );
}
