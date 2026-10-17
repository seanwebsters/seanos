import Link from "next/link";
import { getDb } from "@/lib/db";
import { ensureBootstrapped } from "@/lib/bootstrap";
import { londonDate, relTime } from "@/lib/time";
import { Empty, Img, PageHeader, Section, Tabs } from "@/components/ui";
import { CopyButton, CreateForm, Delegate, LiveRefresh, Patch } from "@/components/client";
import { Icon } from "@/components/Icon";
import type { Person } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function People({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await ensureBootstrapped();
  const { tab = "discover" } = await searchParams;
  const db = getDb();
  const people = await db.list("people", { orderBy: { column: "discovered_at", ascending: false } });
  const today = londonDate();
  const daily = people.filter((p) => p.daily_pick_date === today);
  const running = (await db.list("tasks", { where: { kind: ["people_weekly", "person_research"], status: ["queued", "running"] } })).length > 0;
  const groups: Record<string, Person[]> = {
    discover: people.filter((p) => p.status === "suggested"),
    saved: people.filter((p) => p.status === "saved"),
    crm: people.filter((p) => ["contacted", "met"].includes(p.status)),
  };
  return (
    <div>
      <LiveRefresh active={running} />
      <PageHeader title="People" eyebrow="Networking" subtitle="Interesting humans, verified details, messages that sound like you." actions={<Delegate label="Find 10" kind="people_weekly" className="btn-primary" icon="sparkle" />} />
      {daily.length > 0 && (
        <Section title="Today's three">
          <div className="mx-5 space-y-3 lg:mx-0">{daily.map((p) => <PersonCard key={p.id} p={p} />)}</div>
        </Section>
      )}
      <div className="mt-6"><Tabs base="/people" active={tab} tabs={[{ key: "discover", label: "Discover", count: groups.discover.length }, { key: "saved", label: "Saved", count: groups.saved.length }, { key: "crm", label: "Relationships", count: groups.crm.length }, { key: "add", label: "Add someone" }]} /></div>
      {tab === "add" ? (
        <div className="mx-5 mt-3 card p-4 lg:mx-0">
          <div className="mb-3 text-[14px] text-muted">Add someone you've met to your private CRM.</div>
          <CreateForm table="people" submit="Add to relationships" fields={[{ name: "name", label: "Name" }, { name: "role", label: "Role" }, { name: "company", label: "Company" }, { name: "location", label: "Where you met / where they're based" }, { name: "interests", label: "Interests (comma separated)", type: "list" }, { name: "notes", label: "Notes", type: "textarea" }]} />
        </div>
      ) : groups[tab]?.length ? (
        <div className="mx-5 mt-3 grid gap-3 sm:grid-cols-2 lg:mx-0">{groups[tab].map((p) => <PersonCard key={p.id} p={p} compact={tab === "crm"} />)}</div>
      ) : (
        <div className="mt-4"><Empty icon="people" title={tab === "crm" ? "No relationships yet" : "No one here yet"} body={tab === "crm" ? "Mark people as contacted or add someone you've met." : "Each week the Networking Agent finds ten people worth meeting, with verified profiles and a message you could actually send."}><Delegate label="Find people now" kind="people_weekly" /></Empty></div>
      )}
    </div>
  );
}

function PersonCard({ p, compact = false }: { p: Person; compact?: boolean }) {
  return (
    <div className="card p-4">
      <Link href={`/people/${p.id}`} className="flex items-center gap-3">
        <Img src={p.photo_url} seed={p.name} alt={p.name} className="h-14 w-14 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-semibold">{p.name}</div>
          <div className="truncate text-[13px] text-muted">{[p.role, p.company].filter(Boolean).join(" · ")}</div>
          <div className="truncate text-[12px] text-faint">{p.category}{p.location ? ` · ${p.location}` : ""}</div>
        </div>
        <Icon name="chevron" size={18} className="text-faint" />
      </Link>
      {!compact && p.why_get_along && <p className="mt-3 line-clamp-3 text-[13.5px] leading-relaxed text-ink/80">{p.why_get_along}</p>}
      {compact && <div className="mt-2 text-[12.5px] text-muted">{p.last_contact_at ? `Last contact ${relTime(p.last_contact_at)}` : "No contact logged"}{p.remind_at ? ` · reminder ${relTime(p.remind_at)}` : ""}</div>}
      {!compact && p.message && <div className="mt-3 rounded-2xl bg-raised p-3 font-serif text-[14.5px] italic leading-snug">“{p.message}”</div>}
      {!compact && (
        <div className="mt-3 flex flex-wrap gap-2">
          <CopyButton text={p.message} />
          {p.status === "suggested" && <Patch table="people" id={p.id} patch={{ status: "saved" }} toastText="Saved"><Icon name="bookmark" size={14} /> Save</Patch>}
          <Patch table="people" id={p.id} patch={{ status: "contacted", last_contact_at: new Date().toISOString() }} toastText="Marked as contacted"><Icon name="check" size={14} /> Contacted</Patch>
        </div>
      )}
    </div>
  );
}
