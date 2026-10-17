import { getDb } from "@/lib/db";
import { getProfile, getSettings, DEFAULT_COVERAGE } from "@/lib/bootstrap";
import { env } from "@/lib/env";
import { budgetStatus, MODELS } from "@/lib/ai/llm";
import { PageHeader, Section } from "@/components/ui";
import { EditField, ThemeToggle } from "@/components/client";
import { Icon } from "@/components/Icon";
import { Budgets, Coverage, PushSetup, SignOut } from "./client";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const db = getDb();
  const s = await getSettings();
  const p = await getProfile();
  const b = await budgetStatus();
  const subs = await db.count("push_subscriptions");
  const integrations = [
    { name: "Claude (Anthropic)", ok: Boolean(env.anthropicApiKey), what: "Powers every agent: research with web search, writing, planning, vision.", need: "ANTHROPIC_API_KEY" },
    { name: "Database", ok: db.backend === "supabase" || !process.env.VERCEL, what: db.backend === "supabase" ? "Supabase PostgreSQL" : `Local file store in ${env.dataDir}${process.env.VERCEL ? " (temporary on Vercel!)" : ""}`, need: "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, and run supabase/migrations/0001_init.sql" },
    { name: "Image generation (fal.ai)", ok: Boolean(env.falKey), what: "Product mockups, campaign visuals, brand boards.", need: "FAL_KEY" },
    { name: "Push notifications", ok: Boolean(env.vapidPublicKey && env.vapidPrivateKey), what: `${subs} device${subs === 1 ? "" : "s"} subscribed.`, need: "VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY (npx web-push generate-vapid-keys)" },
    { name: "Calendar", ok: Boolean(s.calendar_ics_url), what: "Read-only via your calendar's private iCal address.", need: "Paste the address below" },
    { name: "Sign-in", ok: Boolean(env.ownerPasscode), what: env.ownerPasscode ? "Passcode protected." : "Open in development. Required in production.", need: "OWNER_PASSCODE + SESSION_SECRET" },
    { name: "Scheduled jobs", ok: !process.env.VERCEL || Boolean(env.cronSecret), what: process.env.VERCEL ? "Vercel Cron calls /api/cron/tick." : "Built-in worker runs every 30 seconds.", need: "CRON_SECRET (Vercel)" },
    { name: "Gmail & Contacts", ok: false, what: "Not built yet: needs a Google OAuth app. Reconnection suggestions use your CRM and calendar for now.", need: "GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (future)" },
  ];
  return (
    <div>
      <PageHeader title="Settings" />
      <Section title="Connections">
        <div className="mx-5 space-y-2 lg:mx-0">
          {integrations.map((i) => (
            <div key={i.name} className="card flex items-start gap-3 p-4">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${i.ok ? "bg-sage/20 text-sage" : "bg-raised text-faint"}`}><Icon name={i.ok ? "check" : "close"} size={14} /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium">{i.name}</div>
                <div className="text-[13px] text-muted">{i.what}</div>
                {!i.ok && <div className="mt-1 text-[12px] text-accent">Needs: {i.need}</div>}
              </div>
            </div>
          ))}
        </div>
        <p className="mx-5 mt-3 text-[12px] text-faint lg:mx-0">Keys live only in server environment variables. They're never stored in the database or sent to your browser.</p>
      </Section>
      <Section title="Spend & models">
        <div className="mx-5 lg:mx-0">
          <div className="mb-3 text-[13.5px] text-muted">Today ${(b.day / 100).toFixed(2)} · this month ${(b.month / 100).toFixed(2)}</div>
          <Budgets daily={s.daily_budget_cents} monthly={s.monthly_budget_cents} model={s.default_model} fast={s.fast_model} models={MODELS} />
        </div>
      </Section>
      <Section title="Notifications">
        <div className="mx-5 lg:mx-0"><PushSetup threshold={s.notify_threshold} configured={Boolean(env.vapidPublicKey)} /></div>
      </Section>
      <Section title="The Edition coverage"><div id="coverage" className="mx-5 lg:mx-0"><Coverage coverage={{ ...DEFAULT_COVERAGE, ...s.coverage }} /></div></Section>
      <Section title="Calendar">
        <div id="calendar" className="mx-5 space-y-2 lg:mx-0">
          <EditField table="settings" id="app" field="calendar_ics_url" value={s.calendar_ics_url ?? ""} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" />
          <p className="text-[12px] text-muted">Google Calendar: Settings → your calendar → Integrate calendar → “Secret address in iCal format”. Outlook: Settings → Calendar → Shared calendars → Publish → ICS. Read-only; SEAN OS never changes your calendar.</p>
        </div>
      </Section>
      <Section title="About you">
        <div className="mx-5 space-y-2 lg:mx-0">
          <EditField table="profile" id="me" field="name" value={p.name} placeholder="Name" />
          <EditField table="profile" id="me" field="location" value={p.location} placeholder="Location" />
          <EditField table="profile" id="me" field="role" value={p.role} placeholder="Role" />
          <EditField table="profile" id="me" field="bio" value={p.bio} multiline placeholder="Bio" />
          <EditField table="profile" id="me" field="writing_voice" value={p.writing_voice} multiline placeholder="How you write" />
          <p className="text-[12px] text-muted">The rest of what the team knows lives in <a href="/memory" className="text-accent">Memory</a>.</p>
        </div>
      </Section>
      <Section title="Appearance"><div className="mx-5 lg:mx-0"><ThemeToggle /></div></Section>
      <div className="mx-5 mt-10 lg:mx-0"><SignOut /></div>
    </div>
  );
}
