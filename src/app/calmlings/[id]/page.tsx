import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { relTime } from "@/lib/time";
import { Img, PageHeader, Section, Sources, hostOf } from "@/components/ui";
import { AskButton, CopyButton, Delegate, EditField, Feedback, Patch } from "@/components/client";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function PartnershipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const p = await db.get("partnerships", id);
  if (!p) notFound();
  const outreach = (await db.list("outreach", { where: { target_type: "partnership", target_id: id }, orderBy: { column: "created_at", ascending: false } }))[0];
  const ctx = { type: "partnership", id: p.id, title: p.brand };
  const block = (title: string, body: React.ReactNode) => (
    <div className="card p-5"><div className="eyebrow mb-2 text-accent">{title}</div>{body}</div>
  );
  return (
    <div>
      <PageHeader back="/calmlings" title={p.brand} eyebrow={`${p.category} · Calmlings`} subtitle={<span className="flex items-center gap-1 text-[12.5px]"><Icon name="lock" size={12} /> Confidential work · verified {p.verified_at ? relTime(p.verified_at) : "—"}</span>} />
      {p.images.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 lg:px-0">
          {p.images.map((src) => <Img key={src} src={src} seed={src} alt="Concept visual" className="aspect-[4/5] w-[70%] shrink-0 rounded-card sm:w-[260px]" />)}
        </div>
      )}
      <div className="mx-5 mt-4 flex flex-wrap gap-2 lg:mx-0">
        {p.slides.length > 0 && <Link href={`/calmlings/${p.id}/deck`} className="btn-primary"><Icon name="grid" size={16} /> Open deck</Link>}
        {["shortlisted", "in_development", "contacted", "in_talks", "passed"].map((s) => (
          <Patch key={s} table="partnerships" id={p.id} patch={{ status: s }} className={`chip ${p.status === s ? "bg-accent text-[#141413]" : ""}`}>{s.replace(/_/g, " ")}</Patch>
        ))}
      </div>
      <div className="mx-5 mt-6 space-y-3 lg:mx-0">
        {block("1 · Why " + p.brand, <div className="space-y-2 text-[14.5px] leading-relaxed"><p>{p.what_they_do}</p><p><span className="text-muted">Audience: </span>{p.audience}</p><p><span className="text-muted">Positioning: </span>{p.positioning}</p><p className="font-serif text-[16px]">{p.relevance}</p></div>)}
        {block("2 · The opportunity", <p className="font-serif text-[16.5px] leading-relaxed">{p.opportunity}</p>)}
        {block("3 · The creative concept", <div><div className="display text-[26px] leading-tight">{p.concept.title}</div><p className="mt-2 font-serif text-[16px] leading-relaxed">{p.concept.summary}</p>
          {p.concept.products.length > 0 && <><div className="eyebrow mb-1 mt-4">Products</div><ul className="space-y-1 text-[14px]">{p.concept.products.map((x) => <li key={x}>— {x}</li>)}</ul></>}
          {p.concept.experiences.length > 0 && <><div className="eyebrow mb-1 mt-4">Experiences</div><ul className="space-y-1 text-[14px]">{p.concept.experiences.map((x) => <li key={x}>— {x}</li>)}</ul></>}
          {p.concept.campaign && <><div className="eyebrow mb-1 mt-4">Campaign</div><p className="text-[14px]">{p.concept.campaign}</p></>}</div>)}
        {block("4 · Commercial potential", <div className="text-[14px]">
          {p.commercial.models.length > 0 && <ul className="space-y-1">{p.commercial.models.map((m) => <li key={m}>— {m}</li>)}</ul>}
          {p.commercial.estimates.length > 0 && <div className="mt-3 divide-y divide-line rounded-2xl bg-raised">{p.commercial.estimates.map((e) => (
            <div key={e.label} className="flex items-start justify-between gap-3 px-3 py-2.5"><div><div>{e.label}</div><div className={`text-[11px] font-semibold uppercase tracking-wider ${e.basis === "verified" ? "text-sage" : "text-accent"}`}>{e.basis === "verified" ? <a href={e.source_url ?? "#"} target="_blank" rel="noreferrer">Verified · {hostOf(e.source_url ?? "")}</a> : "Illustrative estimate"}</div></div><div className="text-right font-medium">{e.value}</div></div>
          ))}</div>}
          {p.commercial.strategic_benefits.length > 0 && <><div className="eyebrow mb-1 mt-4">Strategic benefits</div><ul className="space-y-1">{p.commercial.strategic_benefits.map((m) => <li key={m}>— {m}</li>)}</ul></>}
        </div>)}
        {block("5 · The right people", p.contacts.length ? <div className="space-y-2">{p.contacts.map((c) => (
          <div key={c.name + c.url} className="flex items-center gap-3 rounded-2xl bg-raised px-3 py-2.5"><div className="min-w-0 flex-1"><div className="text-[14.5px] font-medium">{c.name}</div><div className="text-[12.5px] text-muted">{c.role}{c.email ? ` · ${c.email}` : ""}</div><a href={c.source_url} target="_blank" rel="noreferrer noopener" className="text-[11.5px] text-accent">Verified: {hostOf(c.source_url)}</a></div><a href={c.url} target="_blank" rel="noreferrer noopener" className="text-faint"><Icon name="external" size={16} /></a></div>
        ))}</div> : <p className="text-[14px] text-muted">No publicly verifiable contact found. The team never guesses names or emails.</p>)}
        {block("6 · Outreach", outreach ? <div>
          <EditField table="outreach" id={outreach.id} field="subject" value={outreach.subject} />
          <div className="mt-2"><EditField table="outreach" id={outreach.id} field="body" value={outreach.body} multiline className="min-h-[180px] font-serif text-[15.5px]" /></div>
          <div className="mt-2 flex flex-wrap items-center gap-2"><CopyButton text={`Subject: ${outreach.subject}\n\n${outreach.body}`} /><span className="text-[12px] text-muted">Status: {outreach.status}</span>{outreach.status === "draft" && <Link href="/approvals" className="chip">Review in Approvals</Link>}</div>
        </div> : <Delegate label="Draft outreach" kind="outreach_draft" instruction="Draft a short, warm introductory email proposing the concept." context={ctx} />)}
      </div>
      <Section title="Develop further">
        <div className="mx-5 flex flex-wrap gap-2 lg:mx-0">
          <Delegate label="Full pack: deck, mockups, contacts" kind="partnership_pack" params={{ partnership_id: p.id }} context={ctx} />
          <Delegate label="Expand the concept" instruction={`Expand the Calmlings × ${p.brand} concept into a fuller creative treatment.`} context={ctx} />
          <Delegate label="Research commercial viability" kind="research_report" instruction={`Research the commercial viability of a Calmlings × ${p.brand} collaboration: comparable deals, licensing norms, risks.`} context={ctx} />
          <Delegate label="Partnership strategy" instruction={`Develop a partnership strategy and follow-up plan for ${p.brand}.`} context={ctx} />
          <AskButton context={ctx} className="chip" />
        </div>
      </Section>
      <Sources sources={p.sources} />
      <div className="mx-5 mt-8 lg:mx-0"><Feedback target="partnership" id={p.id} title={p.brand} options={[{ signal: "more", label: "More like this", icon: "heart" }, { signal: "never", label: "Pass", icon: "thumbsdown" }]} /></div>
    </div>
  );
}
