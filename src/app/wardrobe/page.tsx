import { getDb } from "@/lib/db";
import { getProfile } from "@/lib/bootstrap";
import { londonDate } from "@/lib/time";
import { Empty, Img, List, PageHeader, Row, Section, Tabs } from "@/components/ui";
import { AskButton, Delegate, Feedback, LiveRefresh, Patch } from "@/components/client";
import { Upload, StyleProfile } from "./client";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function Wardrobe({ searchParams }: { searchParams: Promise<{ tab?: string; cat?: string }> }) {
  const { tab = "today", cat = "" } = await searchParams;
  const db = getDb();
  const profile = await getProfile();
  const items = await db.list("wardrobe", { orderBy: { column: "created_at", ascending: false } });
  const [outfit] = await db.list("outfits", { where: { date: londonDate() } });
  const looks = await db.list("outfits", { orderBy: { column: "date", ascending: false }, limit: 14 });
  const reports = (await db.list("reports", { where: { kind: "shopping" }, orderBy: { column: "created_at", ascending: false }, limit: 6 }));
  const running = (await db.list("tasks", { where: { kind: ["outfit", "wardrobe_tag", "shopping"], status: ["queued", "running"] } })).length > 0;
  const cats = [...new Set(items.map((i) => i.category))];
  const shown = cat ? items.filter((i) => i.category === cat) : items;
  const today = outfit ? items.filter((i) => outfit.item_ids.includes(i.id)) : [];
  return (
    <div>
      <LiveRefresh active={running} />
      <PageHeader title="Wardrobe" eyebrow="Personal stylist" subtitle="Fewer, better things, worn well." actions={<AskButton label="Stylist" suggestions={["Find me some great outfits for a creative industry dinner", "Find something similar to my favourite jacket for less", "What are the three pieces that would most improve my wardrobe?", "Help me develop a more distinctive personal style"]} />} />
      <Tabs base="/wardrobe" active={tab} tabs={[{ key: "today", label: "Today" }, { key: "closet", label: "Closet", count: items.length }, { key: "looks", label: "Looks" }, { key: "style", label: "My style" }]} />
      {tab === "today" && (
        <div className="mx-5 mt-3 lg:mx-0">
          {outfit ? (
            <div className="card overflow-hidden">
              {today.length > 0 ? (
                <div className="grid grid-cols-2 gap-1 p-1">{today.map((w, i) => <Img key={w.id} src={w.image} seed={w.id} alt={w.name} className={`${i === 0 && today.length % 2 ? "col-span-2 aspect-[4/3]" : "aspect-[3/4]"} rounded-[18px]`} />)}</div>
              ) : <div className="p-1"><Img src={null} seed={outfit.title} alt="" className="aspect-[4/3] rounded-[18px]" /></div>}
              <div className="p-5">
                <div className="eyebrow">{outfit.weather ? `${outfit.weather.temp_c}° · ${outfit.weather.summary} · ` : ""}{outfit.occasion}</div>
                <div className="display mt-1 text-[30px] leading-tight">{outfit.title}</div>
                <p className="mt-2 font-serif text-[16px] leading-relaxed text-ink/85">{outfit.rationale}</p>
                {today.length > 0 && <ul className="mt-3 space-y-1 text-[14px] text-muted">{today.map((w) => <li key={w.id}>— {w.name}{w.brand ? `, ${w.brand}` : ""}</li>)}</ul>}
                {outfit.missing.length > 0 && <div className="mt-3 rounded-2xl bg-raised p-3 text-[13px] text-muted">Would complete the look: {outfit.missing.join(", ")}</div>}
                {outfit.shopping.length > 0 && <div className="mt-3 space-y-1.5">{outfit.shopping.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer noopener" className="flex items-center justify-between rounded-2xl bg-raised px-3 py-2.5 text-[13.5px]"><span>{s.brand} {s.name}{s.price ? ` · ${s.price}` : ""}</span><Icon name="external" size={14} /></a>)}</div>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Patch table="outfits" id={outfit.id} patch={{ status: "worn" }} toastText="Logged">Wearing it</Patch>
                  <Delegate label="Restyle" kind="outfit" icon="refresh" />
                  {outfit.missing.length > 0 && <Delegate label="Shop the missing pieces" kind="shopping" instruction={`Find ${outfit.missing.join(", ")} for Sean. Quality and versatility over trend.`} context={{ type: "outfit", id: outfit.id, title: outfit.title }} />}
                </div>
                <div className="mt-3"><Feedback target="outfit" id={outfit.id} title={outfit.title} options={[{ signal: "style", label: "My style", icon: "heart" }, { signal: "less", label: "Not me", icon: "thumbsdown" }]} /></div>
              </div>
            </div>
          ) : (
            <Empty icon="shirt" title="No outfit yet today" body="Your stylist uses live London weather, your calendar and what you own."><Delegate label="Style me" kind="outfit" className="btn-primary" icon="sparkle" /></Empty>
          )}
        </div>
      )}
      {tab === "closet" && (
        <>
          <div className="mx-5 mt-3 lg:mx-0"><Upload /></div>
          {cats.length > 1 && <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-5 lg:px-0"><a href="/wardrobe?tab=closet" className={`chip shrink-0 ${!cat ? "bg-ink text-bg" : ""}`}>All</a>{cats.map((c) => <a key={c} href={`/wardrobe?tab=closet&cat=${c}`} className={`chip shrink-0 capitalize ${cat === c ? "bg-ink text-bg" : ""}`}>{c}</a>)}</div>}
          {shown.length ? (
            <div className="mx-5 mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:mx-0 lg:grid-cols-4">
              {shown.map((w) => (
                <div key={w.id} className="group">
                  <Img src={w.image} seed={w.id} alt={w.name} className="aspect-[3/4] rounded-[18px]">
                    <div className="absolute right-2 top-2 flex gap-1">
                      <Patch table="wardrobe" id={w.id} patch={{ favourite: !w.favourite }} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur"><Icon name="heart" size={15} stroke={w.favourite ? 2.6 : 1.6} /></Patch>
                    </div>
                  </Img>
                  <div className="mt-1.5 truncate text-[13px] font-medium">{w.name}</div>
                  <div className="truncate text-[11.5px] text-muted">{[w.brand, w.colours.join("/"), w.category].filter(Boolean).join(" · ")}</div>
                  <div className="mt-1 flex gap-1">
                    <Delegate label="Similar, less" kind="shopping" instruction={`Find something similar to this ${w.name} (${w.colours.join("/")} ${w.category}${w.brand ? `, ${w.brand}` : ""}) for less.`} context={{ type: "wardrobe", id: w.id, title: w.name }} className="chip px-2 py-1 text-[11px]" icon="search" />
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="mt-4"><Empty icon="upload" title="Your closet is empty" body="Photograph your clothes. The stylist catalogues each piece (when Claude is connected), or tag them yourself." /></div>}
        </>
      )}
      {tab === "looks" && (looks.length ? <List className="mt-3">{looks.map((o) => <Row key={o.id} title={o.title} sub={`${o.date} · ${o.occasion} · ${o.status}`} />)}</List> : <div className="mt-4"><Empty icon="shirt" title="No looks yet" /></div>)}
      {tab === "style" && (
        <>
          <Section title="Style profile"><div className="mx-5 lg:mx-0"><StyleProfile style={profile.style} /></div></Section>
          <Section title="Develop your style">
            <div className="mx-5 flex flex-wrap gap-2 lg:mx-0">
              <Delegate label="My distinctive style, defined" instruction="Study Sean's wardrobe, preferences and life in London and write a guide to developing a distinctive personal style: signature pieces, palette, silhouettes, what to stop buying." />
              <Delegate label="Capsule gaps" kind="shopping" instruction="Identify the 3-5 pieces that would most improve Sean's wardrobe for creative-industry work and London life, with real options at different prices." />
            </div>
          </Section>
          {reports.length > 0 && <Section title="Stylist notes"><List>{reports.map((r) => <Row key={r.id} href={`/reports/${r.id}`} title={r.title} sub={r.summary} />)}</List></Section>}
        </>
      )}
    </div>
  );
}
