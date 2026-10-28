import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { Img, PageHeader, Sources } from "@/components/ui";
import { AskButton, Feedback, Patch } from "@/components/client";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function ExperiencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await getDb().get("experiences", id);
  if (!e) notFound();
  const ctx = { type: "experience", id: e.id, title: e.title };
  return (
    <article>
      <Img src={e.image_url} seed={e.id} alt="" className="h-[44vh] min-h-[300px] w-full lg:mt-8 lg:rounded-[28px]"><div className="absolute inset-0 bg-gradient-to-t from-bg via-black/10 to-black/30" /></Img>
      <div className="relative -mt-24"><PageHeader back="/lifestyle" title={e.title} eyebrow={`${e.kind} · ${e.area}`} /></div>
      <div className="mx-5 lg:mx-0">
        <div className="text-[14px] text-muted">{e.venue} · {e.dates}{e.price ? ` · ${e.price}` : ""}</div>
        <p className="mt-4 font-serif text-[17.5px] leading-relaxed">{e.description}</p>
        <div className="mt-4 rounded-card bg-accent/10 p-4 text-[14.5px]"><span className="font-medium">Why you'd like it: </span>{e.why}</div>
        <div className="mt-5 flex flex-wrap gap-2">
          {e.url && <a href={e.url} target="_blank" rel="noreferrer noopener" className="btn-primary"><Icon name="external" size={16} /> Official page</a>}
          <Patch table="experiences" id={e.id} patch={{ status: "saved" }} className="btn-ghost" toastText="Saved"><Icon name="bookmark" size={16} /> Save</Patch>
          <Patch table="experiences" id={e.id} patch={{ status: "planned" }} className="btn-ghost" toastText="Planned">I'm going</Patch>
          <AskButton context={ctx} className="btn-ghost" suggestions={["Who should I invite to this?", "Find somewhere great to eat nearby", "Find similar things next month"]} />
        </div>
        <p className="mt-3 text-[12px] text-faint">SEAN OS never books or buys. Use the official page to book.</p>
      </div>
      <Sources sources={e.sources} />
      <div className="mx-5 mt-6 lg:mx-0"><Feedback target="experience" id={e.id} title={e.title} options={[{ signal: "more", label: "More like this", icon: "heart" }, { signal: "never", label: "Not my thing", icon: "close" }]} /></div>
    </article>
  );
}
