import { afterEach, describe, expect, it } from "vitest";
import { setup, src } from "./helpers";
import { setTransport } from "@/lib/ai/llm";
import { createTask, runTask, tick } from "@/lib/engine";
import { projectRecords, SELF_ID, CALMLINGS_ID } from "@/lib/graph/project";
import { loadWorld, convergences, helpers } from "@/lib/graph/query";
import { bm25 } from "@/lib/graph/search";
import { POST as resolveConflict } from "@/app/api/graph/conflict/[id]/route";
import { POST as approve } from "@/app/api/approvals/[id]/route";
import { POST as trust } from "@/app/api/infinity/trust/route";
import { POST as newAmbition } from "@/app/api/infinity/ambitions/route";
import type { Database } from "@/lib/db";

afterEach(() => setTransport(null));
const req = (b: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(b) });
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });
const now = new Date().toISOString();

async function seedWorld(db: Database) {
  await db.insert("people", { id: "p_known", name: "Priya Shah", photo_url: null, role: "Producer", company: "Northlight", location: "London", category: "Producer", profiles: [], achievements: [], why_get_along: "", why_valuable: "", conversation_starter: "", message: "", sources: [], status: "met", origin: "manual", notes: "", interests: [], remind_at: null, daily_pick_date: null, last_contact_at: now, dedupe_key: "priya", discovered_at: now, verified_at: null });
  await db.insert("speaking", { id: "ev1", name: "Future of Animation Summit", kind: "conference", image_url: null, location: "London", start_date: "2099-11-10", end_date: null, organiser: "Animation UK", audience: "Studios", size: null, fit: "", talk_titles: [], cfp_status: "open", deadline: "2099-10-30", deadline_verified: true, submission_url: null, contacts: [], networking: "", next_action: "", pitch: null, status: "discovered", follow_up_at: null, applied_at: null, sources: [src("https://summit.example/cfp")], dedupe_key: "fas", discovered_at: now, verified_at: now });
  await db.insert("stories", { id: "st1", edition_id: "ed", section: "AI & Creative Technology", position: 0, headline: "Animo launches an AI animation tool", dek: "", what: "Animo, founded by Jane Holt, launched Frame, an AI animation tool. Holt previously worked with Priya Shah at Northlight. Animo will exhibit at the Future of Animation Summit next month.", why: "", implications: "", ideas: [], topics: [], sources: [src("https://news.example/animo")], image_url: null, saved: false, created_at: now });
}

const extraction = {
  entities: [
    { ref: "e1", existing_id: null, type: "company", name: "Animo", aliases: [], summary: "AI animation start-up.", attributes: [{ key: "stage", value: "start-up" }], source_index: 0 },
    { ref: "e2", existing_id: null, type: "person", name: "Jane Holt", aliases: [], summary: "Founder of Animo.", attributes: [], source_index: 0 },
    { ref: "e3", existing_id: "n_person_p_known", type: "person", name: "Priya Shah", aliases: [], summary: "", attributes: [], source_index: 0 },
    { ref: "e4", existing_id: "n_event_ev1", type: "event", name: "Future of Animation Summit", aliases: [], summary: "", attributes: [], source_index: 0 },
    { ref: "e5", existing_id: null, type: "technology", name: "Frame", aliases: ["Animo Frame"], summary: "AI animation tool.", attributes: [], source_index: 0 },
  ],
  relations: [
    { from: "e2", to: "e1", type: "founded", quote: "Animo, founded by Jane Holt", confidence: 0.9, valid_from: null, valid_to: null, source_index: 0 },
    { from: "e2", to: "e3", type: "worked_with", quote: "Holt previously worked with Priya Shah at Northlight", confidence: 0.8, valid_from: null, valid_to: null, source_index: 0 },
    { from: "e1", to: "e4", type: "attends", quote: "Animo will exhibit at the Future of Animation Summit", confidence: 0.8, valid_from: null, valid_to: null, source_index: 0 },
    { from: "e1", to: "e5", type: "develops", quote: "launched Frame, an AI animation tool", confidence: 0.9, valid_from: null, valid_to: null, source_index: 0 },
    { from: "e5", to: "CALMLINGS", type: "relevant_to", quote: "Calmlings would love this", confidence: 0.9, valid_from: null, valid_to: null, source_index: 0 },
    { from: "e1", to: "CALMLINGS", type: "relevant_to", quote: "an AI animation tool", confidence: 0.6, valid_from: null, valid_to: null, source_index: 0 },
  ],
};

describe("world model", () => {
  it("projects records idempotently, extracts quoted facts and finds the coordinated opportunity", async () => {
    const { db } = await setup((req, text) => (text.includes("Extract entities") ? extraction : {}));
    await seedWorld(db);
    await projectRecords();
    const n1 = await db.count("graph_nodes");
    await projectRecords();
    expect(await db.count("graph_nodes")).toBe(n1);
    expect((await db.list("graph_edges")).some((e) => e.from === SELF_ID && e.to === "n_person_p_known" && e.type === "knows")).toBe(true);

    const t = await runTask((await createTask({ title: "Update", kind: "graph_extract" })).id);
    expect(t.status).toBe("completed");
    expect(t.summary).toContain("rejected");
    const edges = await db.list("graph_edges");
    const founded = edges.find((e) => e.type === "founded")!;
    expect(founded.sources[0].quote).toBe("Animo, founded by Jane Holt");
    expect(founded.sources[0].url).toBe("https://news.example/animo");
    expect(edges.some((e) => e.type === "relevant_to" && e.sources[0].quote === "Calmlings would love this")).toBe(false);
    expect(await db.count("graph_nodes", { type: "event" })).toBe(1); // resolved to the existing event, not duplicated

    const w = await loadWorld();
    const conv = convergences(w);
    const animo = conv.find((c) => c.node.name === "Animo")!;
    expect(animo).toBeTruthy();
    expect(new Set(animo.legs.map((l) => l.kind))).toEqual(new Set(["person", "event", "project"]));
    expect(helpers(w, animo.node.id).some((h) => h.person.name === "Priya Shah" && h.inNetwork)).toBe(true);
    expect(bm25([...w.nodes.values()], "animo frame")[0].node.name).toMatch(/Frame|Animo/);

    // Re-running extraction on unchanged sources costs nothing.
    const t2 = await runTask((await createTask({ title: "Update", kind: "graph_extract" })).id);
    expect(t2.summary).toContain("Nothing new");
  });

  it("detects a contradiction and resolves it", async () => {
    const { db } = await setup((req, text) => (text.includes("Extract entities") ? {
      entities: [{ ref: "e1", existing_id: "n_person_p_known", type: "person", name: "Priya Shah", aliases: [], summary: "", attributes: [], source_index: 0 }, { ref: "e2", existing_id: null, type: "company", name: "Brightframe", aliases: [], summary: "", attributes: [], source_index: 0 }],
      relations: [{ from: "e1", to: "e2", type: "works_at", quote: "Priya Shah, who works at Brightframe", confidence: 0.8, valid_from: null, valid_to: null, source_index: 0 }],
    } : {}));
    await seedWorld(db);
    await db.update("stories", "st1", { what: "Priya Shah, who works at Brightframe, spoke about animation pipelines at length today." });
    await runTask((await createTask({ title: "Update", kind: "graph_extract" })).id);
    const [c] = await db.list("graph_conflicts", { where: { status: "open" } });
    expect(c.description).toContain("Northlight");
    await resolveConflict(req({ choice: "Brightframe", mode: "past" }), params({ id: c.id }));
    const worksAt = (await db.list("graph_edges")).filter((e) => e.type === "works_at" && e.from === "n_person_p_known");
    expect(worksAt.find((e) => e.to.includes("northlight"))!.valid_to).not.toBeNull();
    expect((await db.get("graph_conflicts", c.id))!.status).toBe("resolved");
  });
});

describe("what am I missing", () => {
  it("keeps only evidence-backed findings and accepts 'nothing to report'", async () => {
    let empty = false;
    const { db } = await setup((req, text) => {
      if (!text.includes("What am I missing")) return {};
      return empty ? { findings: [], next_best_move: null } : {
        findings: [
          { kind: "connection", title: "Animo links three of your threads", insight: "i", evidence: ["attention"], impact: 4, confidence: 0.7, recommendation: { label: "Intro via Priya", instruction: "Draft" } },
          { kind: "risk", title: "Invented", insight: "x", evidence: ["made_up_signal"], impact: 5, confidence: 0.9, recommendation: { label: "x", instruction: "x" } },
        ],
        next_best_move: { title: "Ask Priya for an intro", why: "w", instruction: "Draft a note", evidence: ["attention"] },
      };
    });
    const t = await runTask((await createTask({ title: "Missing", kind: "missing" })).id);
    const ins = await db.list("insights", { where: { run_id: t.id } });
    expect(ins.map((i) => i.title).sort()).toEqual(["Animo links three of your threads", "Ask Priya for an intro"]);
    expect(t.summary).toContain("dropped for lack of evidence");
    empty = true;
    const t2 = await runTask((await createTask({ title: "Missing", kind: "missing" })).id);
    expect(t2.summary).toBe("Nothing important enough to surface right now.");
  });
});

describe("strategy engine", () => {
  const plan = {
    success: ["Known for X"], assumptions: ["a"], risks: ["r"], stop_doing: ["s"],
    strategies: [{ title: "Publish original thinking", description: "d", rationale: "r", objectives: [{ title: "Become a recognised voice", description: "d", due: "2027-06-01", metrics: [{ name: "Essays", target: 12, unit: "", source: "published_pieces" }], initiatives: [{ title: "Essay series", description: "d", projects: [{ title: "First three essays", description: "d", owner_agent: "brand", actions: [{ title: "Draft essay one", instruction: "Draft an essay on AI and IP", owner_agent: "social" }, { title: "Pick themes", instruction: "Pick themes", owner_agent: "brand" }] }] }] }] }],
  };
  const respond = (req: unknown, text: string) => (text.includes("rigorous sceptic") ? { weak_assumptions: ["w"], missing: ["m"], overcomplicated: [], verdict: "Solid but optimistic." } : plan);

  it("decomposes an ambition, waits for approval, and respects autonomy", async () => {
    const { db } = await setup(respond);
    const { ambition, task } = await (await newAmbition(req({ statement: "Become a recognised leader in creative technology and AI entertainment" }))).json();
    const t = await runTask(task.id);
    expect(t.status).toBe("awaiting_approval");
    const items = await db.list("strategy_items", { where: { ambition_id: ambition.id } });
    expect(items.map((i) => i.level).sort()).toEqual(["action", "action", "initiative", "objective", "project", "strategy"]);
    expect(items.every((i) => i.status === "proposed")).toBe(true);
    expect((await db.get("ambitions", ambition.id))!.assumptions).toContain("Sceptic: w");
    const [a] = await db.list("approvals", { where: { type: "strategy" } });
    await approve(req({ decision: "approved" }), params({ id: a.id }));
    const after = await db.list("strategy_items", { where: { ambition_id: ambition.id } });
    expect(after.every((i) => i.status === "approved")).toBe(true);
    expect(after.filter((i) => i.task_ids.length)).toHaveLength(0); // level 2: nothing starts by itself
    expect((await db.get("tasks", t.id))!.status).toBe("completed");
    expect((await db.list("audit_log")).some((x) => x.action === "strategy.approve")).toBe(true);
  });

  it("starts approved actions automatically at autonomy level 3", async () => {
    const { db } = await setup(respond);
    await db.update("settings", "app", { autonomy_level: 3 });
    const { ambition, task } = await (await newAmbition(req({ statement: "Build a profitable AI creative studio" }))).json();
    await runTask(task.id);
    const [a] = await db.list("approvals", { where: { type: "strategy" } });
    await approve(req({ decision: "approved" }), params({ id: a.id }));
    const actions = (await db.list("strategy_items", { where: { ambition_id: ambition.id, level: "action" } }));
    expect(actions.every((x) => x.task_ids.length === 1)).toBe(true);
    const created = await db.get("tasks", actions[0].task_ids[0]);
    expect(created!.context_ref).toMatchObject({ type: "strategy", id: actions[0].id });
  });
});

describe("trust", () => {
  it("emergency stop halts the queue and pauses work", async () => {
    const { db } = await setup(() => ({}));
    const t = await createTask({ title: "x", kind: "research_report" });
    await trust(req({ halted: true }));
    expect((await db.get("tasks", t.id))!.status).toBe("paused");
    await db.update("tasks", t.id, { status: "queued" });
    expect(await tick()).toBe(0);
    await trust(req({ halted: false }));
    expect((await db.list("audit_log")).map((a) => a.action)).toEqual(expect.arrayContaining(["trust.emergency_stop", "trust.resume"]));
  });
});

export { CALMLINGS_ID };
