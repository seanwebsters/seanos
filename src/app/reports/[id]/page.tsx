import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { fmtDate } from "@/lib/time";
import { Img, Markdown, PageHeader, Sources } from "@/components/ui";
import { AskButton, CopyButton, Delegate } from "@/components/client";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const BACK: Record<string, string> = { idea: "/ideas", partnership: "/calmlings", person: "/people", trend: "/trends", speaking: "/speaking", event: "/diary" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getDb().get("reports", id);
  if (!r) notFound();
  const back = r.subject_ref ? `${BACK[r.subject_ref.type] ?? "/intelligence"}${["idea", "partnership", "person", "trend", "speaking"].includes(r.subject_ref.type) ? `/${r.subject_ref.id}` : ""}` : "/intelligence";
  const ctx = { type: "report", id: r.id, title: r.title };
  return (
    <article>
      <PageHeader back={back} title={r.title} eyebrow={`${r.kind.replace(/_/g, " ")} · ${fmtDate(r.created_at, { day: "numeric", month: "short", year: "numeric" })}`} subtitle={r.scope === "work" ? <span className="flex items-center gap-1 text-[12.5px]"><Icon name="lock" size={12} /> Work · confidential</span> : undefined} />
      <div className="mx-5 lg:mx-0">
        <p className="font-serif text-[19px] leading-snug text-ink/85">{r.summary}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {r.slides.length > 0 && <Link href={`/reports/${r.id}/deck`} className="btn-primary"><Icon name="grid" size={16} /> Present deck</Link>}
          <CopyButton text={`# ${r.title}\n\n${r.body}`} className="btn-ghost" label="Copy markdown" />
          {r.scope !== "work" && <Delegate label="Turn into a post" kind="content_draft" instruction="Turn this into a LinkedIn post with Sean's perspective." context={ctx} className="btn-ghost" />}
          <AskButton context={ctx} label="Go deeper" className="btn-ghost" suggestions={["Research the most important open question further", "Turn this into a pitch deck", "Challenge the conclusions", "Turn this into a task plan"]} />
        </div>
        {r.images.length > 0 && <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto">{r.images.map((src) => <Img key={src} src={src} seed={src} alt="" className="aspect-[4/5] w-[70%] shrink-0 rounded-card sm:w-[260px]" />)}</div>}
        <div className="mt-6"><Markdown text={r.body} /></div>
        {r.slides.length > 0 && (
          <div className="mt-8 space-y-2">
            <div className="eyebrow">Slides</div>
            {r.slides.map((s, i) => <div key={i} className="card p-4"><div className="text-[12px] text-muted">{i + 1}</div><div className="font-semibold">{s.title}</div><ul className="mt-1 list-disc pl-5 text-[14px] text-ink/80">{s.bullets.map((b) => <li key={b}>{b}</li>)}</ul></div>)}
          </div>
        )}
      </div>
      <Sources sources={r.sources} />
    </article>
  );
}
