import "server-only";
import * as z from "zod/v4";
import { getDb } from "@/lib/db";
import type { CopilotMessage, Venture, VentureTask } from "@/lib/db/types";
import { callAgent } from "@/lib/ai/llm";
import { audit } from "@/lib/audit";
import { newId, nowIso } from "@/lib/util";
import { createTask, registerWorkflow } from "@/lib/engine/jobs";
import { DRIVER } from "./finmodel";
import { getModel, portfolioSignals, saveModel, ventureByName } from "./core";
import { founderContext } from "./workflows";

/**
 * The Founder Copilot can only take internal actions: records in SEAN OS and
 * delegated agent tasks. Anything external (emails, payments, filings) goes
 * through drafts and the approvals queue, never from here.
 */
export const COPILOT_WORKFLOWS = {
  venture_build: "Build the business (strategy → model → funding → investors → 90-day plan)",
  cfo_model: "Rebuild or adjust the financial model",
  investor_research: "Find verified investors for this venture",
  fundraising_plan: "Refresh the fundraising plan, readiness and data room",
  growth_plan: "Plan how to get users and revenue: channels, launch plan, experiments for approval",
  growth_review: "Score running growth experiments against recorded numbers",
  commercial_analysis: "Rank the whole portfolio",
  council: "Put a decision to the Intelligence Council",
  scenario: "Model a what-if scenario",
  research_report: "Sourced research report",
} as const;
type CopilotWorkflow = keyof typeof COPILOT_WORKFLOWS;

const ActionZ = z.object({
  type: z.enum(["create_venture_task", "run_workflow", "update_driver", "record_note", "set_stage", "create_venture"]),
  venture: z.string().nullable().describe("Venture name, exactly as listed"),
  title: z.string().describe("Task title, workflow instruction, note, or new venture name"),
  detail: z.string().describe("Extra detail; empty string if none"),
  workflow: z.enum(Object.keys(COPILOT_WORKFLOWS) as [CopilotWorkflow, ...CopilotWorkflow[]]).nullable(),
  phase: z.enum(["30", "60", "90", "later"]).nullable(),
  driver_key: z.string().nullable(),
  driver_value: z.number().nullable(),
  stage: z.enum(["concept", "researching", "validating", "building", "launched", "paused"]).nullable(),
});
export type CopilotAction = z.infer<typeof ActionZ>;

const ReplyZ = z.object({
  reply: z.string().describe("Your answer to Sean, as his cofounder. Direct, specific, honest about uncertainty."),
  actions: z.array(ActionZ).describe("Internal actions to take now. Only when Sean asked for them or clearly agreed; otherwise empty."),
});

/** Executes one whitelisted internal action. Returns what happened, truthfully. */
export async function executeCopilotAction(a: CopilotAction, threadVenture: Venture | null): Promise<CopilotMessage["actions"][number]> {
  const db = getDb();
  const v = a.venture ? await ventureByName(a.venture) : threadVenture;
  const fail = (label: string) => ({ type: a.type, label, ref: null, ok: false });
  switch (a.type) {
    case "create_venture": {
      const name = a.title.trim().slice(0, 80);
      if (!name) return fail("No venture name given");
      if (await ventureByName(name)) return fail(`${name} already exists`);
      const row: Venture = {
        id: newId("ven"), name, tagline: a.detail.slice(0, 200), category: "", stage: "concept", status: "draft", thesis: "", customer: "", market: "", competition: "", business_model: "", validation: "", product: "", roadmap: "",
        ownership: "unclear", ip_notes: "", licensing: "", confidentiality: "personal", conflicts: [], incorporated: false, priority: 20, health: null, idea_id: null, merged_into: null, tags: [], is_demo: false, created_at: nowIso(), updated_at: nowIso(),
      };
      await db.insert("ventures", row);
      await audit("copilot", "venture.create", `venture:${row.id}`, name);
      return { type: a.type, label: `Created venture ${name}`, ref: `/founder/v/${row.id}`, ok: true };
    }
    case "create_venture_task": {
      if (!v) return fail("Which venture? Task not created");
      const t: VentureTask = { id: newId("vt"), venture_id: v.id, title: a.title.slice(0, 160), detail: a.detail, phase: a.phase ?? "30", owner: "Sean", due: null, status: "todo", engine_task_id: null, created_at: nowIso(), updated_at: nowIso() };
      await db.insert("venture_tasks", t);
      return { type: a.type, label: `Task added to ${v.name}: ${t.title}`, ref: `/founder/v/${v.id}?tab=tasks`, ok: true };
    }
    case "run_workflow": {
      const wf = a.workflow;
      if (!wf) return fail("No workflow chosen");
      const needsVenture = ["venture_build", "cfo_model", "investor_research", "fundraising_plan", "growth_plan", "growth_review"].includes(wf);
      if (needsVenture && !v) return fail("Which venture? Nothing started");
      const task = await createTask({
        title: `${v && needsVenture ? `${v.name}: ` : ""}${COPILOT_WORKFLOWS[wf].split(" (")[0]}`,
        instruction: a.title || COPILOT_WORKFLOWS[wf],
        kind: wf,
        params: { venture_id: v?.id, focus: a.detail || undefined },
        contextRef: v ? { type: "venture", id: v.id, title: v.name } : null,
      });
      return { type: a.type, label: `Started: ${task.title}`, ref: `/tasks/${task.id}`, ok: true };
    }
    case "update_driver": {
      if (!v) return fail("Which venture? Model not changed");
      const m = await getModel(v.id);
      if (!m || m.version === 0) return fail(`${v.name} has no model yet`);
      if (!a.driver_key || !DRIVER[a.driver_key] || a.driver_value === null || !Number.isFinite(a.driver_value)) return fail("Unknown driver or value");
      const drivers = m.drivers.map((d) => (d.key === a.driver_key ? { ...d, value: a.driver_value!, basis: "user" as const, note: a.detail || "Set via Copilot" } : d));
      const next = await saveModel(v.id, { drivers }, "copilot", `${DRIVER[a.driver_key].label} → ${a.driver_value} (asked via Copilot)`);
      return { type: a.type, label: `${v.name} model v${next.version}: ${DRIVER[a.driver_key].label} = ${a.driver_value}`, ref: `/founder/v/${v.id}?tab=finance`, ok: true };
    }
    case "record_note": {
      if (!a.title.trim()) return fail("Empty note");
      await db.insert("memories", { id: newId("mem"), category: v ? `Venture: ${v.name}` : "Founder", content: a.title.slice(0, 500), kind: "decision", scope: v?.ownership === "calm" ? "work" : "personal", source: "copilot", provenance: null, confidence: 1, pinned: false, created_at: nowIso(), updated_at: nowIso() });
      return { type: a.type, label: `Noted: ${a.title.slice(0, 60)}`, ref: "/memory", ok: true };
    }
    case "set_stage": {
      if (!v || !a.stage) return fail("Venture or stage missing");
      await db.update("ventures", v.id, { stage: a.stage, updated_at: nowIso() });
      await audit("copilot", "venture.stage", `venture:${v.id}`, `${v.stage} → ${a.stage}`);
      return { type: a.type, label: `${v.name} moved to ${a.stage}`, ref: `/founder/v/${v.id}`, ok: true };
    }
  }
}

registerWorkflow({
  kind: "copilot",
  title: "Founder Copilot",
  agent: "chief_of_staff",
  async run(ctx) {
    const db = getDb();
    const thread = String(ctx.task.params.thread ?? "founder");
    const replyId = String(ctx.task.params.reply_id ?? "");
    const history = (await db.list("copilot_messages", { where: { thread } })).sort((a, b) => a.created_at.localeCompare(b.created_at)).filter((m) => m.id !== replyId).slice(-12);
    const tv = thread.startsWith("v:") ? await db.get("ventures", thread.slice(2)) : null;
    const s = await portfolioSignals();
    const ventures = s.rows.map((r) => `${r.v.name} [${r.v.stage}${r.model ? `, model v${r.model.version}` : ""}${r.open ? `, ${r.open} open tasks` : ""}]`).join("; ");
    const out = await ctx.step("chief_of_staff", "Thinking it through", async () =>
      (await callAgent({
        agent: "chief_of_staff", taskId: ctx.task.id, effort: "medium", schema: ReplyZ,
        prompt: `You are Sean's AI cofounder in Founder OS. Answer his latest message. You can take only these internal actions: create a venture, add a venture task, change one financial-model driver (saved as a new version), record a decision note, set a venture's stage, or start one of these agent workflows: ${Object.entries(COPILOT_WORKFLOWS).map(([k, d]) => `${k} (${d})`).join("; ")}.
You cannot send emails, contact investors, spend money, sign or file anything. If he asks for that, say you'll prepare a draft for his approval instead and start the relevant workflow. Never claim an action happened unless it's in your actions list. Label forecasts as forecasts. For legal, tax or investment questions, flag them for a qualified professional.
Ventures: ${ventures}
Model driver keys: ${Object.keys(DRIVER).join(", ")}
${tv ? `This thread is about:\n${await founderContext(tv)}` : ""}
Conversation:
${history.map((m) => `${m.role === "sean" ? "Sean" : "You"}: ${m.text}`).join("\n")}`,
      })).data,
    );
    const done: CopilotMessage["actions"] = [];
    for (const a of out.actions.slice(0, 5)) {
      try {
        done.push(await executeCopilotAction(a, tv));
      } catch (e) {
        done.push({ type: a.type, label: `Failed: ${(e as Error).message}`, ref: null, ok: false });
      }
    }
    if (replyId) await db.update("copilot_messages", replyId, { text: out.reply, actions: done, status: "done" });
    return { summary: `${out.reply.slice(0, 200)}${done.length ? ` · ${done.filter((d) => d.ok).length}/${done.length} actions done` : ""}` };
  },
});

/** Records Sean's message and queues the cofounder's reply. */
export async function postCopilotMessage(thread: string, text: string) {
  const db = getDb();
  const at = nowIso();
  const mine: CopilotMessage = { id: newId("cm"), thread, role: "sean", text: text.slice(0, 4000), actions: [], task_id: null, status: "done", created_at: at };
  await db.insert("copilot_messages", mine);
  const reply: CopilotMessage = { id: newId("cm"), thread, role: "cofounder", text: "", actions: [], task_id: null, status: "pending", created_at: new Date(Date.now() + 1).toISOString() };
  await db.insert("copilot_messages", reply);
  const task = await createTask({ title: `Copilot: ${text.slice(0, 60)}`, instruction: text, kind: "copilot", params: { thread, reply_id: reply.id } });
  await db.update("copilot_messages", reply.id, { task_id: task.id });
  return { mine, reply: { ...reply, task_id: task.id }, task };
}
