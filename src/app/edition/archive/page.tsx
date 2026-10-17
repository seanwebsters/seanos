import Link from "next/link";
import { getDb } from "@/lib/db";
import { fmtDate } from "@/lib/time";
import { Empty, Img, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function Archive({ searchParams }: { searchParams: Promise<{ q?: string; topic?: string }> }) {
  const { q = "", topic = "" } = await searchParams;
  const db = getDb();
  const editions = await db.list("editions", { where: { status: "ready" }, orderBy: { column: "date", ascending: false } });
  const stories = await db.list("stories", { orderBy: { column: "created_at", ascending: false } });
  const topics = [...stories.flatMap((s) => s.topics).reduce((m, t) => m.set(t.toLowerCase(), (m.get(t.toLowerCase()) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 16);
  const needle = q.toLowerCase();
  const hits = q || topic ? stories.filter((s) => (!needle || `${s.headline} ${s.dek} ${s.what} ${s.section}`.toLowerCase().includes(needle)) && (!topic || s.topics.some((t) => t.toLowerCase() === topic))) : [];
  return (
    <div>
      <PageHeader back="/edition" title="Archive" eyebrow="The Sean Edition" />
      <form className="mx-5 mt-2 lg:mx-0">
        <div className="relative">
          <Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
          <input name="q" defaultValue={q} placeholder="Search every story" className="field pl-11" />
        </div>
      </form>
      {topics.length > 0 && (
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-5 lg:px-0">
          {topics.map(([t]) => <Link key={t} href={topic === t ? "/edition/archive" : `/edition/archive?topic=${encodeURIComponent(t)}`} className={`chip shrink-0 ${topic === t ? "bg-accent text-[#141413]" : ""}`}>{t}</Link>)}
        </div>
      )}
      {q || topic ? (
        <div className="mx-5 mt-6 space-y-4 lg:mx-0">
          <div className="text-[13px] text-muted">{hits.length} stories</div>
          {hits.map((s) => (
            <Link key={s.id} href={`/edition/story/${s.id}`} className="flex gap-3">
              <Img src={s.image_url} seed={s.id} alt="" className="h-20 w-20 shrink-0 rounded-2xl" />
              <div className="min-w-0"><div className="eyebrow text-[10px]">{s.section}</div><div className="mt-0.5 line-clamp-2 font-serif text-[17px] leading-snug">{s.headline}</div></div>
            </Link>
          ))}
        </div>
      ) : editions.length ? (
        <div className="mx-5 mt-6 grid grid-cols-2 gap-3 lg:mx-0 lg:grid-cols-3">
          {editions.map((e) => {
            const lead = stories.find((s) => s.edition_id === e.id && s.position === 0);
            return (
              <Link key={e.id} href={`/edition/${e.id}`} className="block">
                <Img src={lead?.image_url} seed={e.id} alt="" className="aspect-[3/4] rounded-[20px]">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                    <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] opacity-80">{fmtDate(e.date, { weekday: "short", day: "numeric", month: "short" })}</div>
                    <div className="display mt-1 line-clamp-3 text-[19px] leading-tight">{e.title}</div>
                  </div>
                </Img>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="mt-6"><Empty icon="edition" title="No past editions" body="Every edition is archived here and searchable by topic." /></div>
      )}
    </div>
  );
}
