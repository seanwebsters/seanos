import Link from "next/link";
import type { Edition, Story } from "@/lib/db/types";
import { fmtDate } from "@/lib/time";
import { Img, Markdown, Empty, hostOf } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { Delegate, LiveRefresh } from "@/components/client";

const ORDER = ["The World This Morning", "AI & Creative Technology", "Entertainment & Media", "Startups & Business", "Design & Culture", "London", "People Worth Knowing", "Emerging Trends"];

export function EditionView({ edition, stories, generating }: { edition: Edition | null; stories: Story[]; generating: boolean }) {
  if (!edition || (!stories.length && edition.status !== "ready")) {
    return (
      <div className="pt-safe px-0 pt-6">
        <LiveRefresh active={generating} />
        <Masthead date={edition?.date ?? null} />
        {generating ? (
          <div className="mx-5 mt-8 space-y-4 lg:mx-0">
            <div className="eyebrow text-accent">The newsroom is working</div>
            <div className="skeleton h-64" />
            <div className="skeleton h-6 w-3/4" />
            <div className="skeleton h-6 w-1/2" />
          </div>
        ) : (
          <div className="mt-8">
            <Empty icon="edition" title="No edition yet" body="The Editor-in-Chief researches today's real news and writes a personal newspaper with sources, implications and ideas for you.">
              <Delegate label="Publish today's edition" kind="edition" className="btn-primary" icon="play" />
              <Link href="/edition/archive" className="btn-ghost">Archive</Link>
            </Empty>
          </div>
        )}
      </div>
    );
  }
  const lead = stories[0];
  const sections = ORDER.map((s) => [s, stories.filter((x) => x.section === s && x.id !== lead.id)] as const).filter(([, l]) => l.length);
  return (
    <article className="pt-safe pt-6">
      <LiveRefresh active={generating} />
      <Masthead date={edition.date} />
      <Link href={`/edition/story/${lead.id}`} className="mt-6 block">
        <Img src={lead.image_url} seed={lead.id} alt="" className="aspect-[4/5] w-full sm:aspect-[16/9] lg:rounded-[28px]">
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">{lead.section}</div>
            <h2 className="display mt-2 text-[40px] leading-[0.98] sm:text-[52px]">{lead.headline}</h2>
            <p className="mt-3 font-serif text-[17px] leading-snug opacity-90">{lead.dek}</p>
          </div>
        </Img>
      </Link>
      <div className="mx-5 mt-6 border-b border-line pb-6 lg:mx-0">
        <div className="eyebrow">Today</div>
        <h1 className="display mt-1 text-[32px] leading-tight">{edition.title}</h1>
        <p className="mt-2 font-serif text-[17px] leading-relaxed text-ink/80">{edition.standfirst}</p>
      </div>
      {sections.map(([name, list]) => (
        <section key={name} className="mt-10">
          <div className="mx-5 mb-4 flex items-center gap-3 lg:mx-0">
            <h2 className="display text-[28px] leading-none">{name}</h2>
            <div className="h-px flex-1 bg-line" />
          </div>
          <div className="mx-5 grid gap-6 sm:grid-cols-2 lg:mx-0">
            {list.map((s, i) => (
              <Link key={s.id} href={`/edition/story/${s.id}`} className={`group block ${i === 0 && list.length > 2 ? "sm:col-span-2" : ""}`}>
                <Img src={s.image_url} seed={s.id} alt="" className={`${i === 0 && list.length > 2 ? "aspect-[16/9]" : "aspect-[3/2]"} rounded-[20px]`} />
                <h3 className="mt-3 font-serif text-[21px] font-medium leading-[1.2] group-active:opacity-70">{s.headline}</h3>
                <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-muted">{s.dek}</p>
                <div className="mt-2 text-[12px] text-faint">{s.sources.slice(0, 2).map((x) => x.publisher || hostOf(x.url)).join(" · ")}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}
      {edition.big_idea && (
        <section id="big-idea" className="mx-5 mt-14 rounded-[28px] bg-ink p-7 text-bg lg:mx-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">The Big Idea</div>
          <Markdown text={edition.big_idea} className="mt-3 font-serif text-[19px] leading-[1.6] [&_p]:mb-4" />
        </section>
      )}
      {edition.for_me && (
        <section className="mx-5 mt-8 rounded-[28px] bg-surface p-7 ring-1 ring-line lg:mx-0">
          <div className="eyebrow text-accent">What This Means For Me</div>
          <Markdown text={edition.for_me} className="prose-sean mt-3" />
        </section>
      )}
      <div className="mx-5 mt-10 flex flex-wrap gap-2 lg:mx-0">
        <Link href="/edition/archive" className="btn-ghost"><Icon name="search" size={16} /> Archive</Link>
        <Link href="/settings#coverage" className="btn-ghost"><Icon name="settings" size={16} /> Coverage</Link>
      </div>
    </article>
  );
}

function Masthead({ date }: { date: string | null }) {
  return (
    <div className="flex items-end justify-between border-b border-ink/80 px-5 pb-3 lg:px-0">
      <div>
        <div className="eyebrow">{date ? fmtDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Daily"}</div>
        <div className="display mt-1 text-[44px] leading-none lg:text-[60px]">The Sean Edition</div>
      </div>
      <Link href="/edition/archive" aria-label="Archive" className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-raised"><Icon name="search" size={18} /></Link>
    </div>
  );
}
