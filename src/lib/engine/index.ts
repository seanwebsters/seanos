import "server-only";
import "./workflows";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/bootstrap";
import { nowIso } from "@/lib/util";
import { createTask, tick } from "./jobs";
import { nextRunAt } from "./schedule";
import { rollRecurring } from "./workflows/finance";

export { createTask, tick, controlTask, runTask, getWorkflow } from "./jobs";

/** Queues due automations. They only run when Autopilot is on. */
export async function runAutomations(now = new Date()): Promise<number> {
  const settings = await getSettings();
  if (!settings.autopilot) return 0;
  const db = getDb();
  let queued = 0;
  for (const a of await db.list("automations", { where: { enabled: true } })) {
    if (!a.next_run_at || a.next_run_at > now.toISOString()) continue;
    // Skip if the previous run is still going.
    const last = a.last_task_id ? await db.get("tasks", a.last_task_id) : null;
    const next = nextRunAt(a, now).toISOString();
    if (last && ["queued", "running"].includes(last.status)) {
      await db.update("automations", a.id, { next_run_at: next });
      continue;
    }
    const task = await createTask({
      title: a.name,
      instruction: String(a.params.instruction ?? a.description),
      kind: a.workflow,
      params: a.params,
      automationId: a.id,
    });
    await db.update("automations", a.id, { last_run_at: nowIso(), last_task_id: task.id, next_run_at: next });
    queued++;
  }
  return queued;
}

/** One heartbeat: schedule, then work. */
export async function heartbeat() {
  await rollRecurring().catch(() => {});
  await runAutomations();
  await tick();
}
