import Link from "next/link";
import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { fmtDate, londonDate } from "@/lib/time";
import { Empty, Img, PageHeader, Pill, Tabs } from "@/components/ui";
import { Delegate, LiveRefresh } from "@/components/client";
import { Icon } from "@/components/Icon";
import type { Speaking } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function SpeakingBoard({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await ensureBootstrapped();
  const { tab = "open" } = await searchParams;
  const db = getDb();
  const today = londonDate();
  const all = (await db.list("speaking", { orderBy: { column: "start_date", ascending: true } })).filter((s) => s.status !== "dismissed" && (!s.end_date && !s.start_date ? true : (s.end_date ?? s.start_date)! >= today));
  const groups: Record<string, Speaking[]> = {
    open: all.filter((s) => ["open", "rolling"].includes(s.cfp_status) && ["discovered", "saved", "drafting"].includes(s.status)),
    podcasts: all.filter((s) => s.kind === "podcast"),
    pipeline: all.filter((s) => ["drafting", "applied", "contacted", "accepted"].includes(s.status)),
    all,
  };
  const list = groups[tab] ?? groups.open;
  const running = (await db.list("tasks", { where: { kind: ["speaking_scan", "speaking_pitch", "speaker_profile"], status: ["queued", "running"] } })).length > 0;
  return (
    <div>
      <LiveRefresh active={running} />
      <PageHeader title="Speaking" eyebrow="Your talent agent" subtitle="Stages, podcasts and panels with real routes in. Verified dates only." actions={<Link href="/speaking/profile" className="btn-ghost"><Icon name="people" size={16} /> Profile</Link>} />
      <div className="mx-5 mt-2 flex flex-wrap gap-2 lg:mx-0">
        <Delegate label="Scout opportunities" kind="speaking_scan" className="btn-primary" icon="sparkle" />
        <Delegate label="Find podcasts" kind="speaking_scan" params={{ focus: "Focus on podcasts that host guests in AI, creativity, entertainment and startups, with guest application routes." }} className="btn-ghost" />
      </div>
      <div className="mt-5"><Tabs base="/speaking" active={tab} tabs={[{ key: "open", label: "Open now", count: groups.open.length }, { key: "pipeline", label: "My pipeline", count: groups.pipeline.length }, { key: "podcasts", label: "Podcasts", count: groups.podcasts.length }, { key: "all", label: "All" }]} /></div>
      {list.length ? (
        <div className="mx-5 mt-3 grid gap-3 sm:grid-cols-2 lg:mx-0">
          {list.map((s) => {
            const days = s.deadline ? Math.ceil((new Date(`${s.deadline}T23:59:00Z`).getTime() - Date.now()) / 86400000) : null;
            return (
              <Link key={s.id} href={`/speaking/${s.id}`} className="card block overflow-hidden active:scale-[0.99]">
                <Img src={s.image_url} seed={s.name} alt="" className="aspect-[16/9]">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                  <div className="absolute left-3 top-3"><Pill status={s.cfp_status} label={s.cfp_status === "open" ? "Applications open" : s.cfp_status.replace(/_/g, " ")} /></div>
                  <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">{s.kind} · {s.location}</div>
                    <div className="display text-[25px] leading-tight">{s.name}</div>
                  </div>
                </Img>
                <div className="flex items-center justify-between gap-2 p-4 text-[13px]">
                  <span className="text-muted">{s.start_date ? fmtDate(s.start_date, { day: "numeric", month: "short", year: "numeric" }) : "Date tbc"}</span>
                  {days !== null && days >= 0 ? <span className={days <= 7 ? "font-semibold text-rose" : "text-accent"}>{days === 0 ? "Deadline today" : `${days}d to apply`}</span> : <span className="text-faint">{s.status}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="mt-4"><Empty icon="stage" title={tab === "pipeline" ? "No applications yet" : "No opportunities yet"} body="The Speaking Scout checks official pages for dates, deadlines and submission routes, and skips anything whose deadline has passed."><Delegate label="Scout now" kind="speaking_scan" /></Empty></div>
      )}
    </div>
  );
}
