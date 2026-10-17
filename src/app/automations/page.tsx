import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/bootstrap";
import { describeSchedule } from "@/lib/engine/schedule";
import { relTime } from "@/lib/time";
import { PageHeader, Pill, Section } from "@/components/ui";
import { ActionButton, Delegate, Patch } from "@/components/client";
import { AutomationTime } from "./time";

export const dynamic = "force-dynamic";

export default async function Automations() {
  const db = getDb();
  const settings = await getSettings();
  const list = await db.list("automations", { orderBy: { column: "created_at", ascending: true } });
  const est = list.filter((a) => a.enabled).reduce((s, a) => s + a.est_cost_cents * (a.cadence === "daily" ? 30 : 4.3), 0);
  return (
    <div>
      <PageHeader title="Automations" eyebrow="Work while you're away" subtitle="Real scheduled jobs on the server. They run even when the app is closed." />
      <div className={`mx-5 mt-2 rounded-card p-5 lg:mx-0 ${settings.autopilot ? "bg-sage/12" : "bg-surface ring-1 ring-line"}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[16px] font-semibold">Autopilot {settings.autopilot ? "is on" : "is off"}</div>
            <div className="mt-0.5 text-[13px] text-muted">Est. ~${(est / 100).toFixed(0)}/month for what's enabled · hard cap ${(settings.daily_budget_cents / 100).toFixed(0)}/day, ${(settings.monthly_budget_cents / 100).toFixed(0)}/month</div>
          </div>
          <Patch table="settings" id="app" patch={{ autopilot: !settings.autopilot }} className={settings.autopilot ? "btn-ghost" : "btn-primary"}>{settings.autopilot ? "Turn off" : "Turn on"}</Patch>
        </div>
      </div>
      <Section title="Schedules">
        <div className="mx-5 space-y-2.5 lg:mx-0">
          {list.map((a) => (
            <div key={a.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold">{a.name}</div>
                  <div className="mt-0.5 text-[13px] text-muted">{a.description}</div>
                  <div className="mt-1.5 text-[12px] text-faint">{describeSchedule(a)} · ~${(a.est_cost_cents / 100).toFixed(2)}/run{a.last_run_at ? ` · last ran ${relTime(a.last_run_at)}` : ""}{a.enabled && settings.autopilot && a.next_run_at ? ` · next ${relTime(a.next_run_at)}` : ""}</div>
                </div>
                <Patch table="automations" id={a.id} patch={{ enabled: !a.enabled }} className="shrink-0"><Pill status={a.enabled ? "completed" : "cancelled"} label={a.enabled ? "On" : "Off"} /></Patch>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <AutomationTime id={a.id} hour={a.hour} minute={a.minute} weekday={a.weekday} cadence={a.cadence} />
                <Delegate label="Run now" kind={a.workflow} instruction={String(a.params.instruction ?? a.description)} params={a.params} icon="play" />
                {a.workflow === "freeform" && <ActionButton url={`/api/entity/automations/${a.id}`} method="DELETE" confirm="Delete this automation?" className="chip text-rose">Delete</ActionButton>}
              </div>
            </div>
          ))}
        </div>
        <p className="mx-5 mt-4 text-[12.5px] text-muted lg:mx-0">Create your own by asking, e.g. “Every Monday, find me new partnership opportunities.”</p>
      </Section>
    </div>
  );
}
