import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { IDEA_ACTIONS } from "@/lib/engine/workflows";
import { Img, List, PageHeader, Pill, Row, Section, Sources } from "@/components/ui";
import { AskButton, Delegate, EditField, Feedback, Patch } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const i = await db.get("ideas", id);
  if (!i) notFound();
  const reports = (await db.list("reports", { orderBy: { column: "created_at", ascending: false } })).filter((r) => r.subject_ref?.type === "idea" && r.subject_ref.id === id);
  const linked = (await Promise.all(i.links.map((l) => db.get("ideas", l)))).filter(Boolean);
  const trends = (await Promise.all(i.trend_ids.map((t) => db.get("trends", t)))).filter(Boolean);
  const ctx = { type: "idea", id: i.id, title: i.title };
  const part = (label: string, text: string) => text ? <div className="border-t border-line py-4"><div className="eyebrow mb-1.5">{label}</div><p className="font-serif text-[16.5px] leading-relaxed">{text}</p></div> : null;
  return (
    <div>
      <PageHeader back="/ideas" title={i.title} eyebrow={i.origin === "user" ? "Your idea" : "From the Venture Studio"} actions={i.verdict ? <Pill status={i.verdict} label={`Verdict: ${i.verdict}`} /> : null} />
      {i.images.length > 0 && <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto px-5 lg:px-0">{i.images.map((s) => <Img key={s} src={s} seed={s} alt="Mockup" className="aspect-[4/5] w-[70%] shrink-0 rounded-card sm:w-[260px]" />)}</div>}
      <div className="mx-5 lg:mx-0">
        <p className="font-serif text-[21px] leading-snug">{i.one_liner}</p>
        {i.scores && (
          <div className="mt-5 grid grid-cols-4 gap-2">
            {(["market", "fit", "novelty", "effort"] as const).map((k) => <div key={k} className="rounded-2xl bg-raised p-3 text-center"><div className="display text-[28px] leading-none">{i.scores![k]}</div><div className="mt-1 text-[11px] uppercase tracking-wider text-muted">{k === "effort" ? "ease" : k}</div></div>)}
          </div>
        )}
        <div className="mt-5">
          {part("The insight", i.insight)}
          {part("The product", i.product)}
          {part("The audience", i.audience)}
          {part("The business model", i.business_model)}
          {i.competition.length > 0 && <div className="border-t border-line py-4"><div className="eyebrow mb-2">The competition</div><ul className="space-y-2 text-[14.5px]">{i.competition.map((c) => <li key={c.name}><span className="font-medium">{c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2">{c.name}</a> : c.name}</span> <span className="text-muted">— {c.note}</span></li>)}</ul></div>}
          {part("The advantage", i.advantage)}
          {part("The opportunity", i.evidence)}
          {part("The launch", i.launch)}
          {(i.costs || i.monetisation.length || i.challenges.length || i.scale) ? (
            <div className="border-t border-line py-4">
              <div className="eyebrow mb-2">Numbers & risks <span className="normal-case tracking-normal text-accent">· estimates, not facts</span></div>
              {i.costs && <p className="text-[14.5px]"><span className="text-muted">Startup costs: </span>{i.costs}</p>}
              {i.scale && <p className="mt-1 text-[14.5px]"><span className="text-muted">Potential scale: </span>{i.scale}</p>}
              {i.monetisation.length > 0 && <p className="mt-1 text-[14.5px]"><span className="text-muted">Monetisation: </span>{i.monetisation.join("; ")}</p>}
              {i.challenges.length > 0 && <p className="mt-1 text-[14.5px]"><span className="text-muted">Challenges: </span>{i.challenges.join("; ")}</p>}
              {i.assumptions.length > 0 && <ul className="mt-2 list-disc pl-5 text-[13px] text-muted">{i.assumptions.map((a) => <li key={a}>Assumption: {a}</li>)}</ul>}
            </div>
          ) : null}
        </div>
      </div>
      <Section title="Develop">
        <div className="mx-5 flex flex-wrap gap-2 lg:mx-0">
          {Object.entries(IDEA_ACTIONS).map(([k, a]) => <Delegate key={k} label={a.label} kind="idea_develop" params={{ action: k }} context={ctx} />)}
          <Delegate label="Shape & evaluate this idea" kind="idea_capture" instruction={`${i.title}: ${i.one_liner} ${i.notes}`} context={ctx} />
          <AskButton context={ctx} label="Turn into a task" className="chip" suggestions={["Build me a business plan", "Expand this into a full project", "Find people who've built something similar"]} />
        </div>
      </Section>
      {reports.length > 0 && <Section title="Work on this idea"><List>{reports.map((r) => <Row key={r.id} href={`/reports/${r.id}`} title={r.title} sub={`${r.kind.replace(/_/g, " ")} · ${r.summary}`} />)}</List></Section>}
      {(linked.length > 0 || trends.length > 0) && (
        <Section title="Connected">
          <List>
            {trends.map((t) => <Row key={t!.id} href={`/trends/${t!.id}`} title={t!.title} sub="Trend" />)}
            {linked.map((l) => <Row key={l!.id} href={`/ideas/${l!.id}`} title={l!.title} sub="Idea" />)}
          </List>
        </Section>
      )}
      <Section title="Notes">
        <div className="mx-5 lg:mx-0"><EditField table="ideas" id={i.id} field="notes" value={i.notes} multiline placeholder="Your thinking…" /></div>
        <div className="mx-5 mt-3 flex flex-wrap gap-2 lg:mx-0">
          {(["captured", "developing", "validated", "parked", "archived"] as const).map((s) => <Patch key={s} table="ideas" id={i.id} patch={{ status: s }} className={`chip ${i.status === s ? "bg-accent text-[#141413]" : ""}`}>{s}</Patch>)}
        </div>
      </Section>
      <Sources sources={i.sources} />
      <div className="mx-5 mt-8 lg:mx-0"><Feedback target="idea" id={i.id} title={i.title} options={[{ signal: "develop", label: "Develop this", icon: "bolt" }, { signal: "more", label: "More like this", icon: "heart" }, { signal: "never", label: "Not for me", icon: "thumbsdown" }]} /></div>
      <Link href="/ideas" className="sr-only">Back</Link>
    </div>
  );
}
