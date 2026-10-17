import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { fmtDate, relTime } from "@/lib/time";
import { Img, List, Meter, PageHeader, Row, Section, Sources, hostOf } from "@/components/ui";
import { AskButton, Delegate, Feedback, Patch } from "@/components/client";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const MATURITY: Record<string, string> = { weak_signal: "Weak signal", emerging: "Emerging", accelerating: "Accelerating", mainstream: "Mainstream" };
const STAGES = ["weak_signal", "emerging", "accelerating", "mainstream"];

export default async function TrendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const t = await db.get("trends", id);
  if (!t) notFound();
  const ideas = (await db.list("ideas")).filter((i) => i.trend_ids.includes(id));
  const ctx = { type: "trend", id: t.id, title: t.title };
  return (
    <article>
      <Img src={t.image_url} seed={t.title} alt="" className="h-[46vh] min-h-[320px] w-full lg:mt-8 lg:rounded-[28px]">
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-black/20 to-black/30" />
      </Img>
      <div className="-mt-28 relative"><PageHeader back="/trends" title={t.title} eyebrow={`${t.category} · ${t.region}`} /></div>
      <div className="mx-5 lg:mx-0">
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-raised p-3"><div className="eyebrow text-[10px]">Momentum</div><div className="mt-2"><Meter value={t.momentum} /></div><div className="mt-1 text-[11px] text-muted">From evidence</div></div>
          <div className="rounded-2xl bg-raised p-3"><div className="eyebrow text-[10px]">Opportunity</div><div className="display mt-1 text-[28px] leading-none">{t.opportunity_score}<span className="text-[15px] text-muted">/10</span></div></div>
          <div className="rounded-2xl bg-raised p-3"><div className="eyebrow text-[10px]">Stage</div><div className="mt-1 text-[14px] font-medium">{MATURITY[t.maturity]}</div><div className="mt-2 flex gap-1">{STAGES.map((s) => <span key={s} className={`h-1 flex-1 rounded-full ${STAGES.indexOf(s) <= STAGES.indexOf(t.maturity) ? "bg-accent" : "bg-line"}`} />)}</div></div>
        </div>
        <div className="prose-sean mt-6">
          <h3>What's happening</h3><p>{t.what}</p>
          <h3>Why it's happening</h3><p>{t.why}</p>
          {t.drivers.length > 0 && <><h3>Who's driving it</h3><p>{t.drivers.join(" · ")}</p></>}
          <h3>Why it matters to you</h3><p>{t.relevance}</p>
        </div>
        <div className="mt-6">
          <div className="eyebrow mb-2">Evidence</div>
          <div className="space-y-2">
            {t.evidence.map((e, i) => (
              <a key={i} href={e.source_url} target="_blank" rel="noreferrer noopener" className="card block p-3.5">
                <div className="flex items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${e.kind === "measured" ? "bg-sage/15 text-sage" : "bg-raised text-muted"}`}>{e.kind}</span><span className="text-[11.5px] text-faint">{hostOf(e.source_url)}{e.date ? ` · ${e.date}` : ""}</span></div>
                <div className="mt-1.5 text-[14.5px] leading-snug">{e.claim}</div>
              </a>
            ))}
          </div>
        </div>
        <div className="mt-6 rounded-card border border-dashed border-accent/50 p-5">
          <div className="eyebrow text-accent">Prediction · speculative</div>
          <p className="mt-2 font-serif text-[16.5px] italic leading-relaxed">{t.prediction}</p>
        </div>
        {t.opportunities.length > 0 && <div className="mt-6"><div className="eyebrow mb-2">Business opportunities</div><ul className="space-y-1.5 font-serif text-[16px]">{t.opportunities.map((o) => <li key={o}>— {o}</li>)}</ul></div>}
        {t.calm_applications.length > 0 && <div className="mt-6 rounded-card bg-surface p-5 ring-1 ring-line"><div className="eyebrow mb-2">For Calm & Calmlings</div><ul className="space-y-1.5 text-[14.5px]">{t.calm_applications.map((o) => <li key={o}>— {o}</li>)}</ul></div>}
      </div>
      <Section title="Act on it">
        <div className="mx-5 flex flex-wrap gap-2 lg:mx-0">
          <Delegate label="Research further" kind="research_report" instruction={`Research this trend in depth: ${t.title}. Who's winning, data, and where it goes next.`} context={ctx} />
          <Delegate label="Turn into business ideas" kind="venture_ideas" params={{ count: 3 }} instruction={`Ideas built on: ${t.title}`} />
          <Delegate label="Find who's driving it" kind="people_weekly" params={{ count: 5, brief: `People driving this trend: ${t.title}` }} />
          <Delegate label="Calmlings angle" instruction={`How could Calmlings use this trend? Develop a concept. Trend: ${t.title}`} context={ctx} />
          <Delegate label="Write my take" kind="content_draft" instruction="Write a LinkedIn post with Sean's original perspective on this trend." context={ctx} />
          <AskButton context={ctx} className="chip" />
        </div>
      </Section>
      {ideas.length > 0 && <Section title="Ideas from this trend"><List>{ideas.map((i) => <Row key={i.id} href={`/ideas/${i.id}`} title={i.title} sub={i.one_liner} />)}</List></Section>}
      <Sources sources={t.sources} />
      <div className="mx-5 mt-6 flex flex-wrap items-center gap-2 lg:mx-0">
        <Patch table="trends" id={t.id} patch={{ status: t.status === "saved" ? "new" : "saved" }} toastText={t.status === "saved" ? "Unsaved" : "Saved"}><Icon name="bookmark" size={14} /> {t.status === "saved" ? "Saved" : "Save"}</Patch>
        <Feedback target="trend" id={t.id} title={t.title} options={[{ signal: "more", label: "More like this", icon: "heart" }, { signal: "never", label: "Dismiss", icon: "close" }]} />
      </div>
      <div className="mx-5 mt-4 text-[12px] text-faint lg:mx-0">Discovered {fmtDate(t.discovered_at, { day: "numeric", month: "short" })} · last verified {relTime(t.verified_at)} · seen in {t.seen_count} scan{t.seen_count > 1 ? "s" : ""}</div>
    </article>
  );
}
