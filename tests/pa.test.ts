import { afterEach, describe, expect, it } from "vitest";
import { setup } from "./helpers";
import { setTransport } from "@/lib/ai/llm";
import { runTask } from "@/lib/engine";
import { POST as send, GET as read } from "@/app/api/pa/route";
import { POST as decide } from "@/app/api/pa/proposals/[id]/route";
import { POST as another } from "@/app/api/pa/another/route";
import { isFree } from "@/lib/pa/slots";
import { knowledge, todayAtAGlance } from "@/lib/pa/assistant";
import { addDays, londonDate, londonTimeToUtc } from "@/lib/time";
import { nowIso } from "@/lib/util";

afterEach(() => setTransport(null));
const req = (b: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(b) });
const p = <T,>(x: T) => ({ params: Promise.resolve(x) });
const empty = { tasks: [], remember: [], changes: [], schedule: [] };

describe("Life HQ assistant", () => {
  it("finds a real free hour before the deadline, waits for approval, then saves it", async () => {
    const prompts: string[] = [];
    const deadline = addDays(londonDate(), 3);
    const { db } = await setup((_r, text) => {
      prompts.push(text);
      return { ...empty, reply: "Got it: an hour on the Calmlings colouring book.", schedule: [{ title: "Calmlings colouring book", duration_minutes: 60, deadline, earliest: null, category: "work" }] };
    });
    const tomorrow = addDays(londonDate(), 1);
    await db.insert("events", { id: "evt_busy", title: "Plush prototype review", start: londonTimeToUtc(tomorrow, 9, 0).toISOString(), end: londonTimeToUtc(tomorrow, 18, 0).toISOString(), all_day: false, location: "", description: "", source: "manual", external_id: null, prep_report_id: null });

    const out = await (await send(req({ text: "I need to work on my Calmlings colouring book for an hour before " + deadline }))).json();
    await runTask(out.task.id);
    // The assistant saw the real diary and the Calm projects.
    expect(prompts[0]).toContain("Plush prototype review");
    expect(prompts[0]).toContain("Calmlings Game");
    expect(prompts[0]).not.toContain("journal");

    let view = await (await read()).json();
    const reply = view.messages.at(-1);
    expect(reply.status).toBe("done");
    expect(reply.text).toContain("I've checked your diary");
    const props = view.proposals.filter((x: { message_id: string }) => x.message_id === reply.id);
    expect(props.length).toBeGreaterThan(0);
    const events = await db.list("events");
    for (const x of props) {
      expect(isFree(events, x.start, x.end)).toBe(true);
      expect(x.start.slice(0, 10) < deadline).toBe(true);
    }
    // Nothing was added before approval.
    expect(events).toHaveLength(1);

    const ok = await (await decide(req({ decision: "approve" }), p({ id: props[0].id }))).json();
    expect(ok.label).toContain("Added to your diary");
    const saved = (await db.list("events")).find((e) => e.created_by === "assistant")!;
    expect(saved).toMatchObject({ title: "Calmlings colouring book", start: props[0].start, end: props[0].end });
    view = await (await read()).json();
    expect(view.messages.at(-1).actions.at(-1)).toMatchObject({ type: "diary", ok: true });
    // The other options for the same task are closed, and approving twice is refused.
    expect((await db.get("pa_proposals", props[1]?.id ?? props[0].id))!.status).not.toBe("pending");
    expect((await decide(req({ decision: "approve" }), p({ id: props[0].id }))).status).toBe(409);
  });

  it("refuses a slot that's been taken since, and finds other times without repeating", async () => {
    const deadline = addDays(londonDate(), 6);
    const { db } = await setup(() => ({ ...empty, reply: "Two hours on the startup.", schedule: [{ title: "Startup work", duration_minutes: 120, deadline, earliest: null, category: "business" }] }));
    const out = await (await send(req({ text: "Find me two hours to work on my startup" }))).json();
    await runTask(out.task.id);
    const first = (await db.list("pa_proposals", { where: { status: "pending" } }));
    expect(first.length).toBeGreaterThan(1);
    await db.insert("events", { id: "evt_clash", title: "Dinner", start: first[0].start!, end: first[0].end!, all_day: false, location: "", description: "", source: "manual", external_id: null, prep_report_id: null });
    expect((await decide(req({ decision: "approve" }), p({ id: first[0].id }))).status).toBe(409);
    const msg = (await (await another(req({ message_id: first[0].message_id }))).json()).message;
    const next = await db.list("pa_proposals", { where: { message_id: msg.id } });
    expect(next.every((n) => !first.some((f) => f.start === n.start))).toBe(true);
  });

  it("notes tasks and remembers facts as real records, and won't touch the connected calendar", async () => {
    const { db } = await setup(() => ({
      ...empty, reply: "Noted.",
      tasks: [{ title: "Reply to Holly", due: addDays(londonDate(), 1) }],
      remember: [{ category: "Goals", content: "Sean wants to build his own business generating £100k a year." }],
      changes: [{ event_id: "ics_x", action: "delete", new_date: null, new_time: null, reason: "busy" }],
    }));
    await db.insert("events", { id: "ics_x", title: "All Hands", start: londonTimeToUtc(addDays(londonDate(), 1), 15, 0).toISOString(), end: londonTimeToUtc(addDays(londonDate(), 1), 16, 0).toISOString(), all_day: false, location: "", description: "", source: "ics", external_id: "x", prep_report_id: null });
    const out = await (await send(req({ text: "Remember that I want a £100k business, and I need to reply to Holly tomorrow. Cancel All Hands." }))).json();
    await runTask(out.task.id);
    const reply = (await (await read()).json()).messages.at(-1);
    expect(reply.actions.map((a: { label: string }) => a.label).join(" ")).toMatch(/Added to your tasks: Reply to Holly.*Saved to Life/);
    expect(reply.text).toContain("connected calendar");
    expect((await db.list("hq_items", { where: { section: "tasks" } }))[0].title).toBe("Reply to Holly");
    expect((await db.list("memories", { where: { source: "assistant" } }))[0].content).toContain("£100k");
    expect(await db.get("events", "ics_x")).toBeTruthy();
    expect(await db.count("pa_proposals")).toBe(0);
    const k = await knowledge();
    expect(k.text).toContain("Reply to Holly");
    const g = await todayAtAGlance();
    expect(g.tasksSoon + g.tasksDue).toBe(1);
  });

  it("shows the real reason when it can't answer", async () => {
    const { db } = await setup(() => ({}));
    await db.update("settings", "app", { updated_at: nowIso() });
    process.env.ANTHROPIC_API_KEY_BACKUP = process.env.ANTHROPIC_API_KEY;
    const out = await (await send(req({ text: "Organise my Thursday" }))).json();
    await db.update("tasks", out.task.id, { status: "blocked", blocked_on: "Add an Anthropic API key to switch me on." });
    const reply = (await (await read()).json()).messages.at(-1);
    expect(reply).toMatchObject({ status: "failed", text: "Add an Anthropic API key to switch me on." });
  });
});
