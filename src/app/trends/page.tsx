import Link from "next/link";
import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { relTime } from "@/lib/time";
import { Empty, Img, Meter, PageHeader, Tabs } from "@/components/ui";
import { Delegate, LiveRefresh } from "@/components/client";

export const dynamic = "force-dynamic";

const MATURITY: Record<string, string> = { weak_signal: "Weak signal", emerging: "Emerging", accelerating: "Accelerating", mainstream: "Mainstream" };

export default async function Trends({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await ensureBootstrapped();
  const { tab = "radar" } = await searchParams;
  const db = getDb();
  const all = (await db.list("trends", { orderBy: { column: "verified_at", ascending: false } })).filter((t) => t.status !== "dismissed");
  const list = tab === "saved" ? all.filter((t) => t.status === "saved") : tab === "early" ? all.filter((t) => t.maturity === "weak_signal" || t.maturity === "emerging") : [...all].sort((a, b) => b.opportunity_score + b.momentum - (a.opportunity_score + a.momentum));
  const running = (await db.list("tasks", { where: { kind: ["trend_scan"], status: ["queued", "running"] } })).length > 0;
  const [lead, ...rest] = list;
  return (
    <div>
      <LiveRefresh active={running} />
      <PageHeader title="Trends" eyebrow="Trend radar" subtitle="Weak signals that could matter in 6–24 months. Evidence first, predictions labelled." actions={<Delegate label="Scan now" kind="trend_scan" className="btn-primary" icon="sparkle" />} />
      <div className="mt-2"><Tabs base="/trends" active={tab} tabs={[{ key: "radar", label: "Radar", count: all.length }, { key: "early", label: "Early signals" }, { key: "saved", label: "Saved" }]} /></div>
      {lead ? (
        <>
          <Link href={`/trends/${lead.id}`} className="mx-5 mt-3 block overflow-hidden rounded-card ring-1 ring-line lg:mx-0">
            <Img src={lead.image_url} seed={lead.title} alt="" className="aspect-[4/5] sm:aspect-[16/9]">
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] opacity-85">{MATURITY[lead.maturity]} · {lead.region}</div>
                <div className="display mt-2 text-[36px] leading-[1]">{lead.title}</div>
                <p className="mt-2 line-clamp-3 font-serif text-[16px] opacity-90">{lead.what}</p>
                <div className="mt-3 flex items-center gap-4 text-[12px]"><span>Momentum {lead.momentum}/5</span><span>Opportunity {lead.opportunity_score}/10</span></div>
              </div>
            </Img>
          </Link>
          <div className="mx-5 mt-4 space-y-3 lg:mx-0">
            {rest.map((t) => (
              <Link key={t.id} href={`/trends/${t.id}`} className="card flex gap-4 p-3.5 active:scale-[0.99]">
                <Img src={t.image_url} seed={t.title} alt="" className="h-24 w-24 shrink-0 rounded-2xl" />
                <div className="min-w-0 flex-1">
                  <div className="eyebrow text-[10px]">{MATURITY[t.maturity]} · {t.category}</div>
                  <div className="mt-0.5 line-clamp-2 font-serif text-[17px] font-medium leading-snug">{t.title}</div>
                  <div className="mt-2 flex items-center gap-3"><Meter value={t.momentum} /><span className="text-[12px] text-muted">Opp. {t.opportunity_score}/10</span><span className="text-[11.5px] text-faint">{relTime(t.verified_at)}</span></div>
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-4"><Empty icon="trend" title="Nothing on the radar" body="The Trend Forecaster scans launches, funding, communities and search interest across the UK, US and Asia, keeping only trends with verifiable evidence."><Delegate label="Run the trend radar" kind="trend_scan" /></Empty></div>
      )}
    </div>
  );
}
