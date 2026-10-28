import Link from "next/link";
import { getDb } from "@/lib/db";
import { getProfile, getSettings } from "@/lib/bootstrap";
import { ensureLifeHQ } from "@/lib/life/core";
import { DEFAULT_ROUTINE } from "@/lib/pa/slots";
import { fmtDate } from "@/lib/time";
import { AssistantSwitches, LifeSearch, RoutineEditor, type LifeItem } from "@/components/lifemem";

export const dynamic = "force-dynamic";

const GROUPS = ["Goals", "Projects", "Business", "Career", "Money", "Health", "Relationships", "Home", "Travel", "Preferences", "Routines", "Tasks", "Wins", "Other"];
const MEMORY_GROUP: Record<string, string> = { Identity: "Other", Work: "Career", Ambition: "Goals", Writing: "Preferences", Networking: "Preferences", Lifestyle: "Preferences", Style: "Preferences", Privacy: "Preferences", Decisions: "Goals", Founder: "Business" };
const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

export default async function Life({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q ?? "";
  const db = getDb();
  const [me, profile, settings] = await Promise.all([ensureLifeHQ(), getProfile(), getSettings()]);
  const items: LifeItem[] = [];
  const rec = (group: string, id: string, title: string, detail = "", href: string | null = null) => items.push({ id, group, title, detail, kind: "record", href });

  // What Sean has said, plus what the records already hold. Feedback notes and the private journal stay out.
  for (const m of (await db.list("memories")).filter((m) => m.kind !== "feedback").sort((a, b) => b.updated_at.localeCompare(a.updated_at))) {
    const group = GROUPS.includes(m.category) ? m.category : MEMORY_GROUP[m.category] ?? (m.category.startsWith("Venture") ? "Business" : "Other");
    items.push({ id: m.id, group, title: m.content, detail: `${m.category}${m.source === "assistant" ? " · told Life HQ" : m.source === "user" ? "" : ` · ${m.source}`}${m.scope === "work" ? " · Calm work" : ""}`, kind: "memory", href: null });
  }
  for (const [k, a] of Object.entries(me.areas)) if (a.statement) rec("Goals", `area-${k}`, a.statement, `${k[0].toUpperCase()}${k.slice(1)}${a.progress !== null ? ` · your rating ${a.progress}%` : ""}`, "/overview#overview");
  rec("Career", "salary", `Salary ${gbp(me.salary)}, aiming for ${gbp(me.salary_target)}`, `${profile.role} at ${profile.company}`, "/overview#career");
  rec("Money", "savings", `Savings goal ${gbp(me.savings_target)}`, `Starting point ${gbp(me.savings)}`, "/finance");
  rec("Business", "revenue", `Business goal: ${gbp(me.revenue_target)} a year`, "Independent of Calm", "/founder");
  for (const p of await db.list("work_projects")) rec("Projects", p.id, p.name, `Calm · ${p.status}${p.next_action ? ` · next: ${p.next_action}` : ""}`, "/overview#career");
  for (const v of (await db.list("ventures")).filter((v) => v.stage !== "archived" && !v.merged_into)) rec("Business", v.id, v.name, `${v.tagline} · ${v.stage}`, `/founder/v/${v.id}`);
  const sectionGroup: Record<string, string> = { health: "Health", home: "Home", friends: "Relationships", travel: "Travel", reputation: "Career", vision: "Goals", tasks: "Tasks" };
  for (const i of (await db.list("hq_items")).filter((i) => !i.done)) rec(sectionGroup[i.section] ?? "Other", i.id, i.title, [i.value, i.date ? fmtDate(i.date, { weekday: "short", day: "numeric", month: "short" }) : ""].filter(Boolean).join(" · "), i.section === "tasks" ? null : `/overview#${i.section}`);
  for (const t of (await db.list("venture_tasks")).filter((t) => t.status !== "done" && t.due)) rec("Tasks", t.id, t.title, `Founder OS · due ${fmtDate(t.due!, { day: "numeric", month: "short" })}`, `/founder/v/${t.venture_id}?tab=tasks`);
  for (const w of (await db.list("wins")).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20)) rec("Wins", w.id, w.title, `${w.area} · ${fmtDate(w.date)}`);
  const autos = await db.list("automations");
  const a = (k: string) => { const x = autos.find((y) => y.workflow === k); return x ? { id: x.id, enabled: x.enabled } : null; };

  return (
    <div className="mx-auto max-w-[760px] px-5 pb-10 lg:px-0 lg:pt-10">
      <header className="pt-safe pt-5 lg:pt-0">
        <h1 className="display text-[36px] leading-none lg:text-[44px]">Life</h1>
        <p className="mt-2 text-[15px] text-muted">What Life HQ knows about you. Tell it things in Ask (“remember that…”) and they land here. Tap anything you wrote to edit or forget it.</p>
      </header>
      <div className="mt-6"><LifeSearch items={items} groups={GROUPS} initialQuery={q} /></div>

      <section className="mt-10">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Your routine</div>
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-line/70"><RoutineEditor routine={me.routine ?? DEFAULT_ROUTINE} /></div>
      </section>

      <section className="mt-8">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Proactive help</div>
        <AssistantSwitches briefing={a("pa_briefing")} evening={a("pa_evening")} notifications={Boolean(settings.pa_notifications)} />
      </section>

      <section className="mt-8">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Everything else</div>
        <div className="flex flex-wrap gap-2 text-[13px]">
          {[["/overview", "Life overview"], ["/founder", "Founder OS"], ["/finance", "Money"], ["/overview#journal", "Journal"], ["/approvals", "Approvals"], ["/agents", "Agents"], ["/today", "Team briefing"], ["/more", "All workspaces"], ["/settings", "Settings"]].map(([href, label]) => <Link key={href} href={href} className="rounded-full px-3.5 py-1.5 ring-1 ring-line hover:bg-raised">{label}</Link>)}
        </div>
      </section>
    </div>
  );
}
