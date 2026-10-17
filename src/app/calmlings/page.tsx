import Link from "next/link";
import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { Empty, Img, PageHeader, Pill, Tabs } from "@/components/ui";
import { AskButton, Delegate, LiveRefresh } from "@/components/client";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const STAGES = [
  { key: "all", label: "All" }, { key: "discovered", label: "Discovered" }, { key: "shortlisted", label: "Shortlist" }, { key: "in_development", label: "Developing" },
  { key: "outreach_ready", label: "Outreach ready" }, { key: "contacted", label: "Contacted" }, { key: "in_talks", label: "In talks" }, { key: "passed", label: "Passed" },
];

export default async function Calmlings({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await ensureBootstrapped();
  const { tab = "all" } = await searchParams;
  const db = getDb();
  const all = await db.list("partnerships", { orderBy: { column: "updated_at", ascending: false } });
  const list = tab === "all" ? all.filter((p) => p.status !== "passed") : all.filter((p) => p.status === tab);
  const running = (await db.list("tasks", { where: { kind: ["partnerships", "partnership_pack"], status: ["queued", "running"] } })).length > 0;
  const reports = (await db.list("reports", { where: { scope: "work" }, orderBy: { column: "created_at", ascending: false }, limit: 5 }));
  return (
    <div>
      <LiveRefresh active={running} />
      <PageHeader title="Calmlings" eyebrow="Partnerships & IP" subtitle="Brand, licensing and entertainment opportunities, researched and ready for you." actions={<span className="flex items-center gap-1 rounded-full bg-raised px-2.5 py-1 text-[11.5px] text-muted"><Icon name="lock" size={12} /> Work · private</span>} />
      <div className="mx-5 mt-2 flex flex-wrap gap-2 lg:mx-0">
        <Delegate label="Discover partners" kind="partnerships" className="btn-primary" icon="sparkle" />
        <AskButton label="Partnership pack" suggestions={["Prepare a full partnership pack for LEGO", "Find unexpected partners in hospitality", "Research 20 potential Calmlings brand partners", "Find licensing partners in Japan"]} />
      </div>
      <div className="mt-5"><Tabs base="/calmlings" active={tab} tabs={STAGES.map((s) => ({ ...s, count: s.key === "all" ? undefined : all.filter((p) => p.status === s.key).length || undefined }))} /></div>
      {list.length ? (
        <div className="mx-5 mt-3 grid gap-3 sm:grid-cols-2 lg:mx-0">
          {list.map((p) => (
            <Link key={p.id} href={`/calmlings/${p.id}`} className="card block overflow-hidden active:scale-[0.99]">
              <Img src={p.images[0]} seed={p.brand} alt="" className="aspect-[16/9]">
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                <div className="absolute bottom-0 p-4 text-white">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">{p.category}{p.unexpected ? " · Unexpected" : ""}</div>
                  <div className="display text-[28px] leading-tight">{p.brand}</div>
                </div>
              </Img>
              <div className="p-4">
                <div className="flex items-center justify-between gap-2"><div className="truncate font-serif text-[16px] font-medium">{p.concept.title || "Concept in development"}</div><Pill status={p.status === "outreach_ready" ? "pending" : "draft"} label={p.status.replace(/_/g, " ")} /></div>
                <p className="mt-1.5 line-clamp-2 text-[13.5px] text-muted">{p.opportunity}</p>
                <div className="mt-2 text-[12px] text-faint">{p.contacts.length ? `${p.contacts.length} verified contact${p.contacts.length > 1 ? "s" : ""}` : "No verified contact yet"}</div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-4"><Empty icon="briefcase" title="No partnerships here" body="The Partnership Director, Creative Director, Business Strategist and BD Agent work together: research, concept, commercials, contacts and outreach."><Delegate label="Run discovery" kind="partnerships" /></Empty></div>
      )}
      {reports.length > 0 && (
        <div className="mx-5 mt-10 lg:mx-0">
          <div className="display mb-3 text-[24px]">Work documents</div>
          <div className="space-y-2">{reports.map((r) => <Link key={r.id} href={`/reports/${r.id}`} className="card block p-4"><div className="text-[14.5px] font-medium">{r.title}</div><div className="mt-0.5 line-clamp-1 text-[12.5px] text-muted">{r.summary}</div></Link>)}</div>
        </div>
      )}
    </div>
  );
}
