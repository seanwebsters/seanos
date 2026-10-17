import Link from "next/link";
import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { addDays, fmtDate, londonDate } from "@/lib/time";
import { AgentBadge, Empty, PageHeader, Pill, Tabs } from "@/components/ui";
import { AskButton, Delegate, LiveRefresh } from "@/components/client";
import type { Draft } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const PLATFORM: Record<string, string> = { linkedin: "LinkedIn", instagram: "Instagram", x: "X", essay: "Essay", website: "Website", carousel: "Carousel", video: "Video", script: "Script", thread: "Thread" };

export default async function Studio({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await ensureBootstrapped();
  const { tab = "review" } = await searchParams;
  const db = getDb();
  const drafts = await db.list("drafts", { orderBy: { column: "updated_at", ascending: false } });
  const review = drafts.filter((d) => d.status === "awaiting_approval" || d.status === "draft");
  const library = drafts.filter((d) => ["approved", "scheduled", "published"].includes(d.status));
  const running = (await db.list("tasks", { where: { kind: ["content_plan", "content_draft"], status: ["queued", "running"] } })).length > 0;
  const today = londonDate();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  return (
    <div>
      <LiveRefresh active={running} />
      <PageHeader title="Studio" eyebrow="Your media company" subtitle="Drafts in your voice. Nothing is posted without you." actions={<AskButton label="Brief" suggestions={["Write a LinkedIn post about AI filmmaking", "Draft an essay on what happens when anyone can become a studio", "Create an Instagram carousel on character-led IP", "Write a 60-second video script about Calmlings' approach to storytelling"]} />} />
      <div className="mx-5 mt-2 flex flex-wrap gap-2 lg:mx-0">
        <Delegate label="Plan next week's content" kind="content_plan" className="btn-primary" icon="sparkle" />
      </div>
      <div className="mt-5"><Tabs base="/studio" active={tab} tabs={[{ key: "review", label: "To review", count: review.length }, { key: "calendar", label: "Calendar" }, { key: "library", label: "Library", count: library.length }]} /></div>
      {tab === "review" && (review.length ? <DraftGrid drafts={review} /> : <div className="mt-4"><Empty icon="studio" title="Nothing to review" body="Your Personal Brand Director picks angles where you have an original take; the Social Producer drafts them in your voice." /></div>)}
      {tab === "library" && (library.length ? <DraftGrid drafts={library} /> : <div className="mt-4"><Empty icon="book" title="Your library is empty" body="Approved pieces live here, ready to copy or export." /></div>)}
      {tab === "calendar" && (
        <div className="mx-5 mt-4 space-y-2 lg:mx-0">
          {days.map((d) => {
            const items = drafts.filter((x) => x.scheduled_for?.slice(0, 10) === d);
            return (
              <div key={d} className="flex gap-4 rounded-2xl bg-surface p-3.5 ring-1 ring-line/70">
                <div className="w-12 text-center">
                  <div className="text-[11px] uppercase text-muted">{fmtDate(d, { weekday: "short" })}</div>
                  <div className="display text-[26px] leading-none">{fmtDate(d, { day: "numeric" })}</div>
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {items.length ? items.map((x) => <Link key={x.id} href={`/studio/${x.id}`} className="block truncate rounded-xl bg-raised px-3 py-2 text-[13.5px]"><span className="text-muted">{PLATFORM[x.platform]} · </span>{x.title}</Link>) : <div className="py-2 text-[13px] text-faint">Open</div>}
                </div>
              </div>
            );
          })}
          <p className="pt-2 text-[12.5px] text-muted">Schedule approved drafts from the editor. SEAN OS reminds you when it's time; you post them yourself.</p>
        </div>
      )}
    </div>
  );
}

function DraftGrid({ drafts }: { drafts: Draft[] }) {
  return (
    <div className="mx-5 mt-3 grid gap-3 sm:grid-cols-2 lg:mx-0">
      {drafts.map((d) => (
        <Link key={d.id} href={`/studio/${d.id}`} className="card block p-4 active:scale-[0.99]">
          <div className="flex items-center justify-between">
            <span className="eyebrow">{PLATFORM[d.platform] ?? d.platform}</span>
            <Pill status={d.status} label={d.status === "awaiting_approval" ? "Review" : undefined} />
          </div>
          <div className="mt-2 font-serif text-[18px] font-medium leading-snug">{d.hook || d.title}</div>
          <p className="mt-2 line-clamp-4 whitespace-pre-line text-[13.5px] leading-relaxed text-muted">{d.body}</p>
          <div className="mt-3 flex items-center gap-2 text-[12px] text-faint"><AgentBadge agent={d.agent} size={20} /> {d.source_ref ? `From: ${d.source_ref.title}` : "Original"}</div>
        </Link>
      ))}
    </div>
  );
}

