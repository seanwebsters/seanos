import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { fmtDate, relTime } from "@/lib/time";
import { Img, PageHeader, Pill, Section, Sources, hostOf } from "@/components/ui";
import { AskButton, CopyButton, Delegate, EditField, Feedback, Patch } from "@/components/client";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function SpeakingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const s = await db.get("speaking", id);
  if (!s) notFound();
  const outreach = (await db.list("outreach", { where: { target_type: "speaking", target_id: id }, orderBy: { column: "created_at", ascending: false } }))[0];
  const ctx = { type: "speaking", id: s.id, title: s.name };
  const fact = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-4 border-b border-line py-2.5 text-[14px]"><span className="text-muted">{k}</span><span className="text-right">{v}</span></div>;
  return (
    <article>
      <Img src={s.image_url} seed={s.name} alt="" className="h-[40vh] min-h-[280px] w-full lg:mt-8 lg:rounded-[28px]"><div className="absolute inset-0 bg-gradient-to-t from-bg via-black/10 to-black/30" /></Img>
      <div className="relative -mt-24"><PageHeader back="/speaking" title={s.name} eyebrow={`${s.kind} · ${s.location}`} actions={<Pill status={s.cfp_status} label={s.cfp_status === "open" ? "Open" : s.cfp_status.replace(/_/g, " ")} />} /></div>
      <div className="mx-5 lg:mx-0">
        {fact("Dates", s.start_date ? `${fmtDate(s.start_date, { day: "numeric", month: "long", year: "numeric" })}${s.end_date && s.end_date !== s.start_date ? ` – ${fmtDate(s.end_date, { day: "numeric", month: "long" })}` : ""}` : "Not published")}
        {fact("Organiser", s.organiser)}
        {fact("Audience", s.audience)}
        {fact("Size", s.size ?? <span className="text-faint">Not verified</span>)}
        {fact("Speaker deadline", s.deadline ? <span className={s.deadline_verified ? "" : "text-accent"}>{fmtDate(s.deadline, { day: "numeric", month: "long", year: "numeric" })}{s.deadline_verified ? " · from official page" : " · unverified"}</span> : <span className="text-faint">None published</span>)}
        {fact("Apply", s.submission_url ? <a href={s.submission_url} target="_blank" rel="noreferrer noopener" className="text-accent">{hostOf(s.submission_url)} ↗</a> : <span className="text-faint">No official link found</span>)}
        <div className="prose-sean mt-6">
          <h3>Why you're a fit</h3><p>{s.fit}</p>
          <h3>Networking</h3><p>{s.networking}</p>
          <h3>Next step</h3><p>{s.next_action}</p>
        </div>
        {s.talk_titles.length > 0 && <div className="mt-4 space-y-2"><div className="eyebrow">Talk ideas</div>{s.talk_titles.map((t) => <div key={t} className="rounded-2xl bg-raised px-4 py-3 font-serif text-[16px]">{t}</div>)}</div>}
        {s.contacts.length > 0 && <div className="mt-6"><div className="eyebrow mb-2">Organiser contacts</div>{s.contacts.map((c) => <div key={c.name} className="flex items-center justify-between border-b border-line py-2.5 text-[14px]"><div><div className="font-medium">{c.name}</div><div className="text-[12.5px] text-muted">{c.role}{c.email ? ` · ${c.email}` : ""}</div></div><a href={c.source_url} target="_blank" rel="noreferrer" className="text-[12px] text-accent">source ↗</a></div>)}</div>}
      </div>
      <Section title="Your pitch">
        <div className="mx-5 lg:mx-0">
          {outreach ? (
            <>
              <EditField table="outreach" id={outreach.id} field="subject" value={outreach.subject} />
              <div className="mt-2"><EditField table="outreach" id={outreach.id} field="body" value={outreach.body} multiline className="min-h-[180px] font-serif text-[15.5px]" /></div>
              <div className="mt-2 flex flex-wrap gap-2">
                <CopyButton text={`Subject: ${outreach.subject}\n\n${outreach.body}`} />
                {outreach.status === "draft" && <Link href="/approvals" className="chip">Approve</Link>}
                {s.submission_url && <a href={s.submission_url} target="_blank" rel="noreferrer noopener" className="chip"><Icon name="external" size={13} /> Open submission page</a>}
              </div>
            </>
          ) : <Delegate label="Draft my pitch" kind="speaking_pitch" params={{ speaking_id: s.id }} context={ctx} className="btn-primary" icon="sparkle" />}
        </div>
      </Section>
      <Section title="Track">
        <div className="mx-5 flex flex-wrap gap-2 lg:mx-0">
          <Patch table="speaking" id={s.id} patch={{ status: "saved" }} className={`chip ${s.status === "saved" ? "bg-accent text-[#141413]" : ""}`}><Icon name="bookmark" size={14} /> Save</Patch>
          <Patch table="speaking" id={s.id} patch={{ status: "applied", applied_at: new Date().toISOString(), follow_up_at: new Date(Date.now() + 14 * 86400000).toISOString() }} className={`chip ${s.status === "applied" ? "bg-accent text-[#141413]" : ""}`}>I applied</Patch>
          <Patch table="speaking" id={s.id} patch={{ status: "contacted" }} className={`chip ${s.status === "contacted" ? "bg-accent text-[#141413]" : ""}`}>Contacted</Patch>
          <Patch table="speaking" id={s.id} patch={{ status: "accepted" }} className={`chip ${s.status === "accepted" ? "bg-sage text-[#141413]" : ""}`}>Accepted 🎉</Patch>
          <Patch table="speaking" id={s.id} patch={{ status: "declined" }} className="chip">Declined</Patch>
          <AskButton context={ctx} className="chip" suggestions={["Research who else is speaking and who I should meet there", "Write a talk abstract for this event", "Find the organiser's contact"]} />
        </div>
        {s.follow_up_at && <div className="mx-5 mt-2 text-[12.5px] text-muted lg:mx-0">Follow-up {relTime(s.follow_up_at)}</div>}
      </Section>
      <Sources sources={s.sources} />
      <div className="mx-5 mt-6 lg:mx-0"><Feedback target="speaking" id={s.id} title={s.name} options={[{ signal: "more", label: "More like this", icon: "heart" }, { signal: "never", label: "Not for me", icon: "close" }]} /></div>
      <div className="mx-5 mt-4 text-[12px] text-faint lg:mx-0">Discovered {relTime(s.discovered_at)} · verified {relTime(s.verified_at)}</div>
    </article>
  );
}
