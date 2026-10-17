import Link from "next/link";
import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { Empty, Img, PageHeader, Pill, Tabs } from "@/components/ui";
import { CreateForm, Delegate, LiveRefresh } from "@/components/client";
import type { Idea } from "@/lib/db/types";

export const dynamic = "force-dynamic";

const score = (i: Idea) => (i.scores ? Math.round(((i.scores.market + i.scores.fit + i.scores.novelty + i.scores.effort) / 4) * 10) / 10 : null);

export default async function Ideas({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await ensureBootstrapped();
  const { tab = "portfolio" } = await searchParams;
  const db = getDb();
  const ideas = (await db.list("ideas", { orderBy: { column: "updated_at", ascending: false } })).filter((i) => i.status !== "archived");
  const running = (await db.list("tasks", { where: { kind: ["venture_ideas", "idea_develop", "idea_capture", "idea_connections"], status: ["queued", "running"] } })).length > 0;
  const groups: Record<string, Idea[]> = {
    portfolio: [...ideas].filter((i) => i.verdict !== "discard").sort((a, b) => (score(b) ?? 0) - (score(a) ?? 0)),
    mine: ideas.filter((i) => i.origin === "user"),
    studio: ideas.filter((i) => i.origin === "agent"),
    parked: ideas.filter((i) => i.verdict === "discard" || i.status === "parked"),
  };
  const list = groups[tab] ?? groups.portfolio;
  return (
    <div>
      <LiveRefresh active={running} />
      <PageHeader title="Ideas" eyebrow="Think tank & venture studio" subtitle="Your ideas and the studio's, developed, challenged and ranked." />
      <div className="mx-5 mt-2 flex flex-wrap gap-2 lg:mx-0">
        <Delegate label="Generate venture ideas" kind="venture_ideas" className="btn-primary" icon="sparkle" />
        <Delegate label="Connect my ideas" kind="idea_connections" className="btn-ghost" icon="link" />
      </div>
      <details className="mx-5 mt-4 card p-4 lg:mx-0">
        <summary className="cursor-pointer text-[15px] font-medium">Capture an idea</summary>
        <div className="mt-3 space-y-3">
          <CreateForm table="ideas" submit="Save to vault" fields={[{ name: "title", label: "Name it" }, { name: "one_liner", label: "One sentence", type: "textarea" }, { name: "tags", label: "Tags (comma separated)", type: "list" }]} />
          <p className="text-[12px] text-muted">Or ask: “I have an idea for…” and the Venture Studio will shape it, check competitors and give a verdict.</p>
        </div>
      </details>
      <div className="mt-5"><Tabs base="/ideas" active={tab} tabs={[{ key: "portfolio", label: "Portfolio", count: groups.portfolio.length }, { key: "mine", label: "Mine", count: groups.mine.length }, { key: "studio", label: "From the studio", count: groups.studio.length }, { key: "parked", label: "Parked", count: groups.parked.length }]} /></div>
      {list.length ? (
        <div className="mx-5 mt-3 grid gap-3 sm:grid-cols-2 lg:mx-0">
          {list.map((i) => (
            <Link key={i.id} href={`/ideas/${i.id}`} className="card block overflow-hidden active:scale-[0.99]">
              <Img src={i.images[0]} seed={i.title} alt="" className="aspect-[16/9]">
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between text-white">
                  <div className="display text-[26px] leading-tight">{i.title}</div>
                  {score(i) !== null && <div className="rounded-full bg-black/35 px-2 py-1 text-[12px] font-semibold backdrop-blur">{score(i)}</div>}
                </div>
              </Img>
              <div className="p-4">
                <p className="line-clamp-2 font-serif text-[15.5px] leading-snug">{i.one_liner}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {i.verdict && <Pill status={i.verdict} />}
                  <span className="text-[12px] text-faint">{i.origin === "user" ? "Yours" : "Studio"} · {i.status}</span>
                  {i.links.length > 0 && <span className="text-[12px] text-faint">· {i.links.length} linked</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-4"><Empty icon="bulb" title="The vault is empty" body="Every week the Venture Studio combines trends, gaps and your strengths into 5–10 original ideas, fewer if fewer are good." /></div>
      )}
    </div>
  );
}
