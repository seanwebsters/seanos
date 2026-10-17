import Link from "next/link";
import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { relTime } from "@/lib/time";
import { Empty, Img, List, PageHeader, Row, Section } from "@/components/ui";
import { Delegate, LiveRefresh } from "@/components/client";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function Opportunities() {
  await ensureBootstrapped();
  const db = getDb();
  const opps = (await db.list("opportunities", { orderBy: { column: "created_at", ascending: false } })).filter((o) => o.status !== "dismissed");
  const trends = (await db.list("trends", { where: { status: ["new", "saved"] } })).sort((a, b) => b.opportunity_score - a.opportunity_score).slice(0, 4);
  const ideas = (await db.list("ideas", { where: { verdict: "explore" } })).slice(0, 4);
  const speaking = (await db.list("speaking", { where: { cfp_status: ["open", "rolling"], status: ["discovered", "saved"] } })).slice(0, 4);
  const partners = (await db.list("partnerships", { where: { status: ["discovered", "shortlisted", "outreach_ready"] } })).slice(0, 4);
  const reports = await db.list("reports", { where: { kind: "opportunity_report" }, orderBy: { column: "created_at", ascending: false }, limit: 4 });
  const running = (await db.list("tasks", { where: { kind: ["opportunity_engine", "opportunity_report", "trend_scan", "venture_ideas", "speaking_scan"], status: ["queued", "running"] } })).length > 0;
  return (
    <div>
      <LiveRefresh active={running} />
      <PageHeader title="Opportunities" eyebrow="Venture studio · talent agent · forecaster" subtitle="What's happening that you should know about, and what you can actually do about it." />
      <div className="mx-5 mt-2 flex flex-wrap gap-2 lg:mx-0">
        <Delegate label="Connect the dots" kind="opportunity_engine" className="btn-primary" icon="link" />
        <Delegate label="Weekly report" kind="opportunity_report" className="btn-ghost" icon="book" />
      </div>
      <Section title="Connected opportunities">
        {opps.length ? (
          <div className="mx-5 space-y-3 lg:mx-0">
            {opps.map((o) => (
              <Link key={o.id} href={`/opportunities/${o.id}`} className="block rounded-card bg-ink p-5 text-bg active:scale-[0.99]">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] opacity-60"><span>{o.status === "new" ? "New" : o.status}</span><span>{o.score}/10</span></div>
                <div className="display mt-2 text-[28px] leading-tight">{o.title}</div>
                <p className="mt-2 line-clamp-3 font-serif text-[15.5px] opacity-80">{o.thesis}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">{o.items.map((i) => <span key={i.id} className="rounded-full bg-bg/15 px-2.5 py-1 text-[11.5px]">{i.type}: {i.title}</span>)}</div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty icon="link" title="Nothing connected yet" body="The Chief of Staff links trends, ideas, people, stages and partnerships into single opportunities with an action plan. It needs a few discoveries first.">
            <Delegate label="Scan trends" kind="trend_scan" />
            <Delegate label="Generate ideas" kind="venture_ideas" />
            <Delegate label="Find speaking slots" kind="speaking_scan" />
          </Empty>
        )}
      </Section>
      {[["Trends", "/trends", trends.map((t) => ({ id: t.id, href: `/trends/${t.id}`, title: t.title, sub: `Opportunity ${t.opportunity_score}/10 · ${t.maturity.replace("_", " ")}`, img: t.image_url }))],
        ["Ideas to explore", "/ideas", ideas.map((i) => ({ id: i.id, href: `/ideas/${i.id}`, title: i.title, sub: i.one_liner, img: i.images[0] ?? null }))],
        ["Stages open now", "/speaking", speaking.map((s) => ({ id: s.id, href: `/speaking/${s.id}`, title: s.name, sub: `${s.kind} · ${s.location}${s.deadline ? ` · apply by ${s.deadline}` : ""}`, img: s.image_url }))],
        ["Calmlings partnerships", "/calmlings", partners.map((p) => ({ id: p.id, href: `/calmlings/${p.id}`, title: p.brand, sub: p.concept.title || p.opportunity, img: p.images[0] ?? null }))],
      ].map(([title, href, rows]) => (rows as { id: string; href: string; title: string; sub: string; img: string | null }[]).length ? (
        <Section key={title as string} title={title as string} href={href as string}>
          <List>{(rows as { id: string; href: string; title: string; sub: string; img: string | null }[]).map((r) => <Row key={r.id} href={r.href} title={r.title} sub={r.sub} left={<Img src={r.img} seed={r.title} alt="" className="h-11 w-11 shrink-0 rounded-xl" />} />)}</List>
        </Section>
      ) : null)}
      {reports.length > 0 && (
        <Section title="Friday reports">
          <List>{reports.map((r) => <Row key={r.id} href={`/reports/${r.id}`} title={r.title} sub={`${relTime(r.created_at)} · ${r.summary}`} left={<Icon name="book" size={18} className="text-accent" />} />)}</List>
        </Section>
      )}
    </div>
  );
}
