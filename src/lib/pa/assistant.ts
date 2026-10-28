import "server-only";
import * as z from "zod/v4";
import { getDb } from "@/lib/db";
import type { CalendarEvent, CopilotMessage, PaProposal } from "@/lib/db/types";
import { callAgent } from "@/lib/ai/llm";
import { HttpError } from "@/lib/api";
import { audit } from "@/lib/audit";
import { getProfile, getSettings } from "@/lib/bootstrap";
import { createTask, registerWorkflow, type RunContext } from "@/lib/engine/jobs";
import { syncIcs } from "@/lib/integrations/calendar";
import { ensureLifeHQ } from "@/lib/life/core";
import { notify } from "@/lib/services/notify";
import { addDays, fmtDate, fmtTime, londonDate, londonParts, londonTimeToUtc } from "@/lib/time";
import { newId, nowIso } from "@/lib/util";
import { DEFAULT_ROUTINE, clashes, findSlots, isFree, type Category } from "./slots";

export const THREAD = "pa";

/** Pull the connected calendar if it's more than 15 minutes old. Read-only. */
export async function syncCalendarIfStale() {
  const s = await getSettings();
  if (!s.calendar_ics_url) return { connected: false, error: null as string | null };
  if (s.calendar_synced_at && Date.now() - new Date(s.calendar_synced_at).getTime() < 15 * 60000) return { connected: true, error: null };
  try {
    await syncIcs(s.calendar_ics_url);
    await getDb().update("settings", "app", { calendar_synced_at: nowIso() });
    return { connected: true, error: null };
  } catch (e) {
    return { connected: true, error: (e as Error).message };
  }
}

/** Everything the assistant knows, from saved records. The private journal is never included. */
export async function knowledge(now = new Date()) {
  const db = getDb();
  const me = await ensureLifeHQ();
  const profile = await getProfile();
  const routine = me.routine ?? DEFAULT_ROUTINE;
  const today = londonParts(now).date;
  const horizon = addDays(today, 14);
  const events = (await db.list("events")).filter((e) => e.start.slice(0, 10) >= addDays(today, -1) && e.start.slice(0, 10) <= horizon).sort((a, b) => a.start.localeCompare(b.start));
  const items = await db.list("hq_items");
  const tasks = items.filter((i) => i.section === "tasks" && !i.done);
  const ventures = (await db.list("ventures")).filter((v) => v.stage !== "archived" && !v.merged_into);
  const vtasks = (await db.list("venture_tasks")).filter((t) => t.status !== "done" && t.due && t.due <= addDays(today, 14));
  const projects = await db.list("work_projects");
  const pending = await db.list("pa_proposals", { where: { status: "pending" } });
  const week = (await db.list("week_priorities")).filter((p) => !p.done).sort((a, b) => a.rank - b.rank).slice(0, 3);
  const days = Array.from({ length: 15 }, (_, i) => addDays(today, i)).map((d) => `${d} = ${fmtDate(d, { weekday: "long" })}${d === today ? " (today)" : d === addDays(today, 1) ? " (tomorrow)" : ""}`);
  const lines = [
    `Now: ${fmtDate(now.toISOString(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, ${fmtTime(now.toISOString())} in London.`,
    `Dates ahead: ${days.join("; ")}.`,
    `Sean: ${profile.name}, ${profile.role} at ${profile.company}, lives in Soho, London.`,
    `Routine: wakes ${routine.wake}, sleeps ${routine.sleep}, works ${routine.work_start}-${routine.work_end} on ${routine.work_days.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join("/")}, lunch ${routine.lunch}, dinner ${routine.dinner}.`,
    `\nDiary (next 14 days; [read-only] = from his connected calendar):\n${events.map((e) => `- id ${e.id} · ${e.all_day ? `${e.start.slice(0, 10)} all day` : `${fmtDate(e.start, { weekday: "short", day: "numeric", month: "short" })} ${fmtTime(e.start)}-${e.end ? fmtTime(e.end) : "?"}`} · ${e.title}${e.location ? ` @ ${e.location}` : ""}${e.source === "ics" ? " [read-only]" : ""}`).join("\n") || "- nothing in the diary"}`,
    `\nOpen tasks:\n${[...tasks.map((t) => `- ${t.title}${t.date ? ` (due ${t.date})` : ""}`), ...vtasks.map((t) => `- [${ventures.find((v) => v.id === t.venture_id)?.name ?? "venture"}] ${t.title} (due ${t.due})`)].join("\n") || "- none"}`,
    `\nThis week's priorities: ${week.map((p) => p.title).join("; ") || "none set"}.`,
    `\nCalm projects (work): ${projects.map((p) => `${p.name} [${p.status}${p.next_action ? `, next: ${p.next_action}` : ""}]`).join("; ")}.`,
    `Own ventures (separate from Calm): ${ventures.filter((v) => v.stage !== "concept").map((v) => `${v.name} [${v.stage}]`).join("; ") || "all still concepts"}.`,
    `Goals: ${Object.entries(me.areas).map(([k, a]) => `${k}: ${a.statement}`).join("; ")}. Salary £${me.salary} → £${me.salary_target}; savings target £${me.savings_target}; business target £${me.revenue_target}/year.`,
    `Lists: ${items.filter((i) => ["health", "home", "friends", "travel", "reputation", "vision"].includes(i.section) && !i.done).map((i) => `${i.section}: ${i.title}${i.date ? ` (${i.date})` : ""}`).join("; ") || "none"}.`,
    pending.length ? `\nSuggestions already waiting for Sean's approval: ${pending.map((p) => `${p.title} ${p.start ? fmtDate(p.start, { weekday: "short", day: "numeric" }) + " " + fmtTime(p.start) : ""}`).join("; ")}.` : "",
  ];
  const cl = clashes(events.filter((e) => e.start.slice(0, 10) >= today));
  if (cl.length) lines.push(`\nClashes: ${cl.map((c) => `${c.titles[0]} overlaps ${c.titles[1]} (${fmtDate(c.at, { weekday: "short" })} ${fmtTime(c.at)})`).join("; ")}.`);
  return { text: lines.filter(Boolean).join("\n"), events, routine, today, tasks, vtasks, ventures };
}

const AskZ = z.object({
  reply: z.string().describe("What you say to Sean, briefly and warmly. Never say something is scheduled, moved, saved or reminded: the app adds what actually happened."),
  schedule: z.array(z.object({
    title: z.string(), duration_minutes: z.number().describe("Your honest estimate if Sean didn't say"),
    deadline: z.string().nullable().describe("YYYY-MM-DD: must be finished BEFORE this date. 'before Friday' = Friday's date; 'by Friday' or 'this week' = the day after"),
    earliest: z.string().nullable().describe("YYYY-MM-DD, if it can't happen before a date"),
    category: z.enum(["work", "personal", "business"]).describe("work = Calm job; business = his own ventures; personal = everything else"),
  })).describe("Things Sean wants time found for. Empty unless he asked for time or clearly needs it"),
  tasks: z.array(z.object({ title: z.string(), due: z.string().nullable().describe("YYYY-MM-DD") })).describe("To-dos to note (e.g. 'reply to Holly tomorrow'). Not for things you're scheduling"),
  remember: z.array(z.object({ category: z.enum(["Projects", "Goals", "Career", "Money", "Health", "Relationships", "Preferences", "Routines", "Business", "Home", "Travel", "Other"]), content: z.string() })).describe("Lasting facts or commitments Sean wants kept, in third person"),
  changes: z.array(z.object({ event_id: z.string(), action: z.enum(["move", "delete"]), new_date: z.string().nullable(), new_time: z.string().nullable().describe("HH:MM"), reason: z.string() })).describe("Only when Sean asks to rearrange or cancel"),
});

async function setReply(replyId: string, patch: Partial<CopilotMessage>) {
  if (replyId) await getDb().update("copilot_messages", replyId, patch);
}

const slotLabel = (start: string, end: string) => `${fmtDate(start, { weekday: "short", day: "numeric", month: "short" })} · ${fmtTime(start)}–${fmtTime(end)}`;

/** Turns a parsed request into real records and pending proposals. Returns the reply text. */
export async function act(ctx: RunContext | null, replyId: string, parsed: z.infer<typeof AskZ>, k: Awaited<ReturnType<typeof knowledge>>) {
  const db = getDb();
  const parts = [parsed.reply.trim()];
  const done: CopilotMessage["actions"] = [];
  for (const t of parsed.tasks.slice(0, 5)) {
    const row = { id: newId("hq"), section: "tasks" as const, title: t.title.slice(0, 200), value: "", date: t.due && /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : null, done: false, position: Date.now(), created_at: nowIso(), updated_at: nowIso() };
    await db.insert("hq_items", row);
    done.push({ type: "task", label: `Added to your tasks: ${row.title}${row.date ? ` (${fmtDate(row.date, { weekday: "short", day: "numeric", month: "short" })})` : ""}`, ref: "/life?q=tasks", ok: true });
  }
  for (const m of parsed.remember.slice(0, 5)) {
    await db.insert("memories", { id: newId("mem"), category: m.category, content: m.content.slice(0, 800), kind: "fact", scope: m.category === "Career" && /calm/i.test(m.content) ? "work" : "personal", source: "assistant", provenance: `Told Life HQ on ${k.today}`, confidence: 1, pinned: false, created_at: nowIso(), updated_at: nowIso() });
    done.push({ type: "memory", label: `Saved to Life: ${m.content.slice(0, 90)}`, ref: "/life", ok: true });
  }
  let proposed = 0;
  for (const s of parsed.schedule.slice(0, 2)) {
    const deadline = s.deadline && /^\d{4}-\d{2}-\d{2}$/.test(s.deadline) ? s.deadline : null;
    const req = { title: s.title.slice(0, 120), duration: Math.min(8 * 60, Math.max(15, Math.round(s.duration_minutes))), deadline, earliest: s.earliest && /^\d{4}-\d{2}-\d{2}$/.test(s.earliest) ? s.earliest : null, category: s.category as Category };
    const slots = findSlots({ now: new Date(), events: k.events, routine: k.routine, duration: req.duration, category: req.category, deadline: req.deadline, earliest: req.earliest });
    const by = deadline ? ` before ${fmtDate(deadline, { weekday: "long" })}` : "";
    const hrs = req.duration % 60 === 0 ? `${req.duration / 60} hour${req.duration === 60 ? "" : "s"}` : `${req.duration} minutes`;
    if (!slots.length) {
      parts.push(`I checked your diary and couldn't find a free ${hrs}${by} without cutting into sleep, meals or your plans. I can look further out, shorten it, or suggest something to move.`);
      continue;
    }
    parts.push(`I've checked your diary${parsed.schedule.length > 1 ? ` for "${req.title}"` : ""}. The best times${by} for ${hrs}:`);
    for (const sl of slots) {
      await db.insert("pa_proposals", { id: newId("pp"), message_id: replyId, kind: "create_event", title: req.title, start: sl.start, end: sl.end, event_id: null, reason: sl.reason, request: req, status: "pending", result: null, created_at: nowIso(), decided_at: null });
      proposed++;
    }
  }
  for (const c of parsed.changes.slice(0, 5)) {
    const e = k.events.find((x) => x.id === c.event_id);
    if (!e) continue;
    if (e.source === "ics") { parts.push(`"${e.title}" comes from your connected calendar, which I can only read. Change it there and it'll update here.`); continue; }
    if (c.action === "delete") {
      await db.insert("pa_proposals", { id: newId("pp"), message_id: replyId, kind: "delete_event", title: e.title, start: e.start, end: e.end, event_id: e.id, reason: c.reason, request: null, status: "pending", result: null, created_at: nowIso(), decided_at: null });
      proposed++;
      continue;
    }
    if (!c.new_date || !c.new_time || !/^\d{2}:\d{2}$/.test(c.new_time)) continue;
    const [h, m] = c.new_time.split(":").map(Number);
    const start = londonTimeToUtc(c.new_date, h, m);
    const len = e.end ? new Date(e.end).getTime() - new Date(e.start).getTime() : 3600000;
    const end = new Date(start.getTime() + len);
    if (!isFree(k.events.filter((x) => x.id !== e.id), start.toISOString(), end.toISOString())) { parts.push(`Moving "${e.title}" to ${slotLabel(start.toISOString(), end.toISOString())} would clash with something else, so I haven't suggested it.`); continue; }
    await db.insert("pa_proposals", { id: newId("pp"), message_id: replyId, kind: "move_event", title: e.title, start: start.toISOString(), end: end.toISOString(), event_id: e.id, reason: c.reason, request: null, status: "pending", result: null, created_at: nowIso(), decided_at: null });
    proposed++;
  }
  const text = parts.filter(Boolean).join("\n\n");
  await setReply(replyId, { text, actions: done, status: "done" });
  if (ctx) await ctx.log(`${done.length} saved, ${proposed} suggestion${proposed === 1 ? "" : "s"} waiting for approval`, "chief_of_staff");
  return { text, saved: done.length, proposed };
}

const RULES = `You are Life HQ, Sean's personal assistant. Calm, warm, brief; British English. Use only the information below; if something isn't there, say you don't know.
You can: find time (the app checks the diary and offers real free slots), note tasks, remember facts, and suggest moving or deleting events Sean created. Every diary change waits for Sean's approval. You can't send messages, email people, book or buy anything, or change his connected calendar.
Never claim you've scheduled, moved, saved or set a reminder. The app reports what actually happened.
Keep Calm work and his own ventures separate. When he's overwhelmed, help him choose: name the one or two things that matter most.`;

async function respond(ctx: RunContext, mode: "chat" | "briefing" | "evening") {
  const db = getDb();
  const replyId = String(ctx.task.params.reply_id ?? "");
  const cal = await syncCalendarIfStale();
  const k = await knowledge();
  const history = (await db.list("copilot_messages", { where: { thread: THREAD } })).filter((m) => m.id !== replyId && m.status === "done").sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-12);
  const ask = mode === "chat" ? `Conversation so far:\n${history.map((m) => `${m.role === "sean" ? "Sean" : "You"}: ${m.text}`).join("\n")}\n\nRespond to Sean's latest message.`
    : mode === "briefing" ? "Write Sean's short morning briefing for today: what matters most, the first fixed commitment, anything due or overdue, clashes, and one suggestion for when to do his most important task. Three to five short lines. If a task clearly needs time today, add it to schedule."
    : "Help Sean plan tomorrow: what's fixed, what's due, what's left over from today, and a sensible order. Three to five short lines. Offer to find time for the most important unscheduled thing via schedule.";
  const parsed = await ctx.step("chief_of_staff", mode === "chat" ? "Understanding what you need" : mode === "briefing" ? "Morning briefing" : "Planning tomorrow", async () =>
    (await callAgent({ agent: "chief_of_staff", taskId: ctx.task.id, effort: "low", schema: AskZ, prompt: `${RULES}\n${cal.error ? `(Couldn't refresh the connected calendar: ${cal.error}. Using the last copy.)\n` : ""}\n${k.text}\n\n${ask}` })).data,
  );
  const out = await act(ctx, replyId, mode === "chat" ? parsed : { ...parsed, remember: [], changes: [] }, k);
  return out;
}

registerWorkflow({
  kind: "pa",
  title: "Life HQ",
  agent: "chief_of_staff",
  async run(ctx) {
    const out = await respond(ctx, "chat");
    return { summary: out.text.slice(0, 240) };
  },
});

for (const [kind, mode, title] of [["pa_briefing", "briefing", "Morning briefing"], ["pa_evening", "evening", "Plan tomorrow"]] as const) {
  registerWorkflow({
    kind, title, agent: "chief_of_staff",
    async run(ctx) {
      const db = getDb();
      // Scheduled briefings create their own message in the conversation.
      let replyId = String(ctx.task.params.reply_id ?? "");
      if (!replyId) {
        replyId = newId("cm");
        await db.insert("copilot_messages", { id: replyId, thread: THREAD, role: "cofounder", text: "", actions: [], task_id: ctx.task.id, status: "pending", created_at: nowIso() });
        ctx.task.params.reply_id = replyId;
      }
      const out = await respond(ctx, mode);
      if ((await getSettings()).pa_notifications) await notify({ title, body: out.text.slice(0, 180), href: "/", importance: 2 });
      return { summary: out.text.slice(0, 240) };
    },
  });
}

/** Records Sean's message and starts the assistant's reply. */
export async function postPaMessage(text: string) {
  const db = getDb();
  const mine: CopilotMessage = { id: newId("cm"), thread: THREAD, role: "sean", text: text.slice(0, 4000), actions: [], task_id: null, status: "done", created_at: nowIso() };
  await db.insert("copilot_messages", mine);
  const reply: CopilotMessage = { id: newId("cm"), thread: THREAD, role: "cofounder", text: "", actions: [], task_id: null, status: "pending", created_at: new Date(Date.now() + 1).toISOString() };
  await db.insert("copilot_messages", reply);
  const task = await createTask({ title: `Life HQ: ${text.slice(0, 60)}`, instruction: text, kind: "pa", params: { reply_id: reply.id } });
  await db.update("copilot_messages", reply.id, { task_id: task.id });
  return { mine, reply: { ...reply, task_id: task.id }, task };
}

/** Sean's decision on a suggestion. The diary only changes here, after approval, and the result is reported from what was saved. */
export async function decideProposal(id: string, decision: "approve" | "reject") {
  const db = getDb();
  const p = await db.get("pa_proposals", id);
  if (!p) throw new HttpError(404, "Suggestion not found");
  if (p.status !== "pending") throw new HttpError(409, p.status === "approved" ? "Already done." : "That suggestion is no longer open.");
  if (decision === "reject") {
    await db.update("pa_proposals", id, { status: "rejected", decided_at: nowIso() });
    return { ok: true, label: null };
  }
  const events = await db.list("events");
  let label = "";
  let ref = "/diary";
  if (p.kind === "create_event") {
    if (!p.start || !p.end) throw new HttpError(400, "Missing time");
    if (!isFree(events, p.start, p.end)) throw new HttpError(409, "That time isn't free any more. Ask me to find another.");
    const ev: CalendarEvent = { id: newId("evt"), title: p.title, start: p.start, end: p.end, all_day: false, location: "", description: "Added by Life HQ after your approval.", source: "manual", external_id: null, prep_report_id: null, created_by: "assistant" };
    await db.insert("events", ev);
    if (!(await db.get("events", ev.id))) throw new HttpError(500, "Couldn't save it to the diary.");
    for (const s of await db.list("pa_proposals", { where: { message_id: p.message_id, status: "pending" } })) if (s.id !== id && s.kind === "create_event" && s.request?.title === p.request?.title) await db.update("pa_proposals", s.id, { status: "superseded", decided_at: nowIso() });
    label = `Added to your diary: ${p.title}, ${slotLabel(p.start, p.end)}`;
    ref = `/diary?date=${londonParts(new Date(p.start)).date}`;
    await db.update("pa_proposals", id, { status: "approved", decided_at: nowIso(), result: ev.id });
  } else {
    const e = p.event_id ? await db.get("events", p.event_id) : null;
    if (!e) throw new HttpError(404, "That event isn't in the diary any more.");
    if (e.source === "ics") throw new HttpError(400, "That event belongs to your connected calendar.");
    if (p.kind === "move_event") {
      if (!isFree(events.filter((x) => x.id !== e.id), p.start!, p.end!)) throw new HttpError(409, "The new time isn't free any more.");
      await db.update("events", e.id, { start: p.start!, end: p.end });
      label = `Moved "${e.title}" to ${slotLabel(p.start!, p.end!)}`;
      ref = `/diary?date=${londonParts(new Date(p.start!)).date}`;
    } else {
      await db.remove("events", e.id);
      label = `Removed "${e.title}" from your diary`;
    }
    await db.update("pa_proposals", id, { status: "approved", decided_at: nowIso(), result: e.id });
  }
  await audit("sean", `pa.${p.kind}`, `proposal:${id}`, label);
  const msg = await db.get("copilot_messages", p.message_id);
  if (msg) await db.update("copilot_messages", msg.id, { actions: [...msg.actions, { type: "diary", label, ref, ok: true }] });
  return { ok: true, label };
}

/** "Find another time": the same request, searched again without the times already offered. No model involved. */
export async function anotherTime(messageId: string) {
  const db = getDb();
  const all = await db.list("pa_proposals", { where: { message_id: messageId } });
  const open = all.filter((p) => p.kind === "create_event" && p.request);
  if (!open.length) throw new HttpError(400, "Nothing to reschedule here.");
  const req = open[0].request!;
  const prior = (await db.list("pa_proposals")).filter((p) => p.request?.title === req.title && p.start && p.end).map((p) => ({ start: p.start!, end: p.end! }));
  for (const p of open.filter((x) => x.status === "pending")) await db.update("pa_proposals", p.id, { status: "superseded", decided_at: nowIso() });
  const k = await knowledge();
  const slots = findSlots({ now: new Date(), events: k.events, routine: k.routine, duration: req.duration, category: req.category, deadline: req.deadline, earliest: req.earliest, exclude: prior });
  const reply: CopilotMessage = { id: newId("cm"), thread: THREAD, role: "cofounder", text: slots.length ? "Here are some other times:" : `That's every free slot${req.deadline ? ` before ${fmtDate(req.deadline, { weekday: "long" })}` : ""}. I can look further out, or suggest something to move.`, actions: [], task_id: null, status: "done", created_at: nowIso() };
  await db.insert("copilot_messages", reply);
  for (const sl of slots) await db.insert("pa_proposals", { id: newId("pp"), message_id: reply.id, kind: "create_event", title: req.title, start: sl.start, end: sl.end, event_id: null, reason: sl.reason, request: req, status: "pending", result: null, created_at: nowIso(), decided_at: null });
  return reply;
}

/** A briefing from saved data alone: the first thing Sean sees, no model call needed. */
export async function todayAtAGlance(now = new Date()) {
  const db = getDb();
  const today = londonParts(now).date;
  const k = await knowledge(now);
  const todays = k.events.filter((e) => (e.all_day ? e.start.slice(0, 10) === today : londonParts(new Date(e.start)).date === today));
  const timed = todays.filter((e) => !e.all_day);
  const due = [...k.tasks.filter((t) => t.date && t.date <= today), ...k.vtasks.filter((t) => t.due! <= today)];
  const soon = [...k.tasks.filter((t) => t.date && t.date > today && t.date <= addDays(today, 3)), ...k.vtasks.filter((t) => t.due! > today && t.due! <= addDays(today, 3))];
  const trips = (await db.list("hq_items", { where: { section: "travel" } })).filter((t) => t.date && t.date >= today && !t.done).sort((a, b) => a.date!.localeCompare(b.date!));
  const week = (await db.list("week_priorities")).filter((p) => !p.done);
  const cl = clashes(todays);
  return {
    today, priorities: week.sort((a, b) => a.rank - b.rank).slice(0, 3),
    meetings: timed.length, first: timed[0] ?? null, tasksDue: due.length, tasksSoon: soon.length, overdue: k.tasks.filter((t) => t.date && t.date < today).length + k.vtasks.filter((t) => t.due! < today).length,
    trip: trips[0] ? { title: trips[0].title, days: Math.round((new Date(`${trips[0].date}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86400000) } : null,
    clashes: cl,
  };
}
