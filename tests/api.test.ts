import { afterEach, describe, expect, it } from "vitest";
import { setup, src } from "./helpers";
import { createTask, runTask } from "@/lib/engine";
import { setTransport } from "@/lib/ai/llm";
import { POST as approve } from "@/app/api/approvals/[id]/route";
import { PATCH } from "@/app/api/entity/[table]/[id]/route";
import { POST as feedback } from "@/app/api/feedback/route";
import { signSession, verifySession } from "@/lib/auth-token";

afterEach(() => setTransport(null));

const req = (body: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

describe("approvals", () => {
  it("drafts wait for approval and approving completes the task without publishing", async () => {
    const draft = { platform: "linkedin", title: "T", hook: "H", body: "B", slides: [], notes: "n", source_index: null };
    const { db } = await setup((r, text) => (text.includes("Plan ") ? { angles: [{ angle: "a", platform: "linkedin", source_index: null, why: "w" }] } : { drafts: [draft] }));
    const t = await runTask((await createTask({ title: "Content", kind: "content_plan" })).id);
    expect(t.status).toBe("awaiting_approval");
    const [a] = await db.list("approvals");
    expect(a.task_id).toBe(t.id);
    const res = await approve(req({ decision: "approved" }), params({ id: a.id }));
    expect(res.status).toBe(200);
    expect((await db.get("tasks", t.id))!.status).toBe("completed");
    expect((await db.list("drafts"))[0].status).toBe("approved");
  });
});

describe("entity API", () => {
  it("only allows whitelisted fields", async () => {
    const { db } = await setup(() => ({}));
    const before = (await db.get("settings", "app"))!;
    await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ autopilot: true, id: "hack", timezone: "UTC" }) }), params({ table: "settings", id: "app" }));
    const after = (await db.get("settings", "app"))!;
    expect(after.autopilot).toBe(true);
    expect(after.timezone).toBe(before.timezone);
    const bad = await PATCH(new Request("http://x", { method: "PATCH", body: "{}" }), params({ table: "usage", id: "x" }));
    expect(bad.status).toBe(404);
  });

  it("bumps the draft version when Sean edits it, so the team can learn from the edit", async () => {
    const { db } = await setup(() => ({}));
    await db.insert("drafts", { id: "d", platform: "x", title: "t", hook: "h", body: "old", slides: [], notes: "", status: "awaiting_approval", scheduled_for: null, source_ref: null, agent: "social", original_body: "old", version: 1, task_id: null, created_at: "", updated_at: "" });
    await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ body: "new" }) }), params({ table: "drafts", id: "d" }));
    expect((await db.get("drafts", "d"))!.version).toBe(2);
  });
});

describe("feedback", () => {
  it("records feedback as memory and dismisses on 'never'", async () => {
    const { db } = await setup(() => ({}));
    await db.insert("trends", { id: "t", title: "T", category: "", region: "", what: "", evidence: [], why: "", drivers: [], maturity: "emerging", momentum: 1, opportunity_score: 1, prediction: "", relevance: "", opportunities: [], calm_applications: [], sources: [src("https://a.b")], image_url: null, status: "new", dedupe_key: "t", seen_count: 1, discovered_at: "", verified_at: "" });
    await feedback(req({ target: "trend", id: "t", title: "T", signal: "never" }));
    expect((await db.get("trends", "t"))!.status).toBe("dismissed");
    expect((await db.list("memories", { where: { kind: "feedback" } })).length).toBe(1);
  });
});

describe("sessions", () => {
  it("signs and verifies, rejects tampering and expiry", async () => {
    const tok = await signSession("s3cret");
    expect(await verifySession("s3cret", tok)).toBe(true);
    expect(await verifySession("other", tok)).toBe(false);
    expect(await verifySession("s3cret", tok.replace(/.$/, "0"))).toBe(tok.endsWith("0") ? true : false);
    expect(await verifySession("s3cret", tok, Date.now() + 365 * 86400000)).toBe(false);
  });
});

import { POST as importCsv } from "@/app/api/finance/import/route";

describe("finance import & planner", () => {
  it("imports a CSV once, skips duplicates, and the planner reviews real figures", async () => {
    const { db, calls } = await setup(() => ({ title: "Money check-in", summary: "On track.", body: "## Where it went", budget_suggestions: [{ category: "Eating out", monthly_limit: 150, why: "w" }] }));
    const csv = "Date,Description,Amount\n01/10/2026,PRET A MANGER,-4.50\n02/10/2026,SPOTIFY,-11.99\n03/10/2026,MYSTERY SHOP,-20.00";
    const r1 = await (await importCsv(req({ csv }))).json();
    const r2 = await (await importCsv(req({ csv }))).json();
    expect([r1.added, r2.added, r2.dupes]).toEqual([3, 0, 3]);
    const txns = await db.list("transactions");
    expect(txns.find((t) => t.description === "SPOTIFY")!.category).toBe("Subscriptions");
    const t = await runTask((await createTask({ title: "Money", kind: "finance_review" })).id);
    expect(t.status).toBe("completed");
    const prompt = calls.at(-1)!.content.map((c) => ("text" in c ? c.text : "")).join("");
    expect(prompt).toContain("PRET A MANGER");
    expect((await db.list("reports"))[0].body).toContain("Suggested budgets");
  });
});
