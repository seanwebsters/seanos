import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { fmtDate } from "@/lib/time";
import { Img, Sources } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { AskButton, Delegate, Feedback, Patch } from "@/components/client";

export const dynamic = "force-dynamic";

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const s = await db.get("stories", id);
  if (!s) notFound();
  const ed = await db.get("editions", s.edition_id);
  const ctx = { type: "story", id: s.id, title: s.headline };
  return (
    <article>
      <Img src={s.image_url} seed={s.id} alt="" className="h-[56vh] min-h-[380px] w-full lg:mt-8 lg:rounded-[28px]">
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-black/30 to-black/30" />
        <div className="pt-safe absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-4">
          <Link href={ed ? `/edition/${ed.id}` : "/edition"} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur" aria-label="Back"><Icon name="back" size={20} /></Link>
          <Patch table="stories" id={s.id} patch={{ saved: !s.saved }} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur" toastText={s.saved ? "Removed" : "Saved"}>
            <Icon name="bookmark" size={18} stroke={s.saved ? 2.4 : 1.6} />
          </Patch>
        </div>
        <div className="absolute inset-x-0 bottom-0 px-5 pb-2 lg:px-8">
          <div className="eyebrow text-accent">{s.section}</div>
          <h1 className="display mt-2 text-[40px] leading-[1] lg:text-[54px]">{s.headline}</h1>
        </div>
      </Img>
      <div className="mx-5 lg:mx-8">
        <p className="mt-4 font-serif text-[20px] leading-snug text-ink/85">{s.dek}</p>
        <div className="mt-3 text-[12.5px] text-muted">{ed ? fmtDate(ed.date, { day: "numeric", month: "long", year: "numeric" }) : ""} · {s.sources.length} source{s.sources.length === 1 ? "" : "s"}</div>
        <div className="prose-sean mt-6">
          <h3>What happened</h3>
          <p>{s.what}</p>
          <h3>Why it matters</h3>
          <p>{s.why}</p>
          <h3>What it means for you</h3>
          <p>{s.implications}</p>
        </div>
        {s.ideas.length > 0 && (
          <div className="mt-6 rounded-card bg-accent/10 p-5">
            <div className="eyebrow text-accent">Ideas & opportunities</div>
            <ul className="mt-2 space-y-2 font-serif text-[16.5px] leading-snug">{s.ideas.map((i) => <li key={i}>— {i}</li>)}</ul>
          </div>
        )}
        <div className="mt-8">
          <div className="eyebrow mb-3">Act on this</div>
          <div className="flex flex-wrap gap-2">
            <Delegate label="Write a LinkedIn post about this" kind="content_draft" instruction="Write a LinkedIn post about this, with Sean's own perspective." context={ctx} />
            <Delegate label="Research this further" kind="research_report" instruction={`Research this further: ${s.headline}`} context={ctx} />
            <Delegate label="Find the founder" instruction={`Find the founder or key people behind this story and draft a casual intro: ${s.headline}`} context={ctx} />
            <Delegate label="How could Calm use this?" instruction={`How could Calm Studios and Calmlings use this? ${s.headline}`} context={ctx} />
            <Delegate label="Turn this into a business idea" kind="idea_capture" instruction={`Turn this into a business idea: ${s.headline}. ${s.what}`} context={ctx} />
            <AskButton context={ctx} label="Ask something else" className="chip" />
          </div>
        </div>
        <Sources sources={s.sources} />
        <div className="mt-8">
          <div className="eyebrow mb-3">Tune your edition</div>
          <Feedback target="story" id={s.id} title={s.headline} options={[{ signal: "more", label: "More like this", icon: "heart" }, { signal: "less", label: "Less like this", icon: "thumbsdown" }]} />
        </div>
      </div>
    </article>
  );
}
