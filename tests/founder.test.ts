import { afterEach, describe, expect, it } from "vitest";
import { setup } from "./helpers";
import { setTransport } from "@/lib/ai/llm";
import { runTask } from "@/lib/engine";
import { decrypt, encrypt, getCredential, setCredential } from "@/lib/integrations/vault";
import { runModel } from "@/lib/founder/finmodel";
import { POST as ventureAct } from "@/app/api/founder/ventures/[id]/route";
import { POST as createVenture } from "@/app/api/founder/ventures/route";
import { POST as saveModelApi, GET as getModelApi } from "@/app/api/founder/model/[ventureId]/route";
import { POST as pipelineAct } from "@/app/api/founder/pipeline/[id]/route";
import { POST as copilotPost, GET as copilotGet } from "@/app/api/founder/copilot/route";
import { GET as credsGet, POST as credsPost } from "@/app/api/founder/credentials/route";

afterEach(() => setTransport(null));
const req = (b: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(b) });
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

import { team, VERGE } from "./founder-team";

describe("founder os", () => {
  it("seeds the 16 proposed ventures as unverified concepts with Calm conflicts flagged", async () => {
    const { db } = await setup(() => ({}));
    const vs = await db.list("ventures");
    expect(vs.length).toBe(16);
    expect(vs.every((v) => v.stage === "concept" && v.status === "draft" && v.ownership === "unclear" && !v.incorporated)).toBe(true);
    expect(vs.find((v) => v.name === "SleepStories")!.conflicts[0]).toMatch(/Calm/);
    expect(vs.find((v) => v.name === "Moonwilders")!.conflicts).toHaveLength(0);
  });

  it("Webster end to end: strategy, model, funding, readiness, verified investors, plan, legal", async () => {
    const { db } = await setup((r, text) => team(r.agent, text));
    const webster = (await db.list("ventures")).find((v) => v.name === "Webster")!;
    const { task } = await (await ventureAct(req({ action: "build" }), params({ id: webster.id }))).json();
    const t = await runTask(task.id);
    expect(t.error).toBeNull();
    expect(t.status).toBe("completed");

    const v = (await db.get("ventures", webster.id))!;
    expect(v.status).toBe("completed");
    expect(v.stage).toBe("validating");
    expect(v.thesis).toContain("Audience-tested");
    // Unverified market claim is downgraded to an estimate.
    expect(v.market).toContain(`[verified: ${VERGE}]`);
    expect(v.market).toContain("Market worth £9bn [estimate]");
    expect(v.conflicts.some((c) => c.includes("Calmlings"))).toBe(true);
    expect(v.health!.score).toBe(28);

    const docs = await db.list("venture_docs", { where: { venture_id: v.id } });
    const kinds = docs.map((d) => d.kind).sort();
    for (const k of ["strategy", "validation", "risks", "funding_requirements", "funding_plan", "readiness", "data_room", "investor_memo", "deck", "investor_faq", "plan_90", "legal", "cofounder"]) expect(kinds).toContain(k);
    const strategy = docs.find((d) => d.kind === "strategy")!;
    expect(strategy.sources.map((s) => s.url)).toEqual([VERGE]);
    expect(docs.find((d) => d.kind === "funding_requirements")!.basis).toBe("forecast");
    expect(docs.find((d) => d.kind === "readiness")!.checklist).toHaveLength(3);
    expect(docs.find((d) => d.kind === "legal")!.checklist[0].item.startsWith("⚖")).toBe(true);
    expect(docs.find((d) => d.kind === "funding_plan")!.body).toContain("Funding is never guaranteed");

    // Model: versioned, and only drivers with a found source are "verified".
    const m = (await db.list("fin_models", { where: { venture_id: v.id } }))[0];
    expect(m.version).toBe(1);
    expect(m.drivers.find((d) => d.key === "cpm")!.basis).toBe("verified");
    const lic = m.drivers.find((d) => d.key === "licensing_deals_per_quarter")!;
    expect(lic.basis).toBe("estimate");
    expect(lic.source_url).toBeNull();
    expect(runModel(m).kpis.funding_need).toBeGreaterThan(0);
    expect(await db.count("fin_model_versions", { venture_id: v.id })).toBe(1);

    // Only the investor with a real source survives; no warm intro is implied.
    const investors = await db.list("investors");
    expect(investors.map((i) => i.name)).toEqual(["Real Angel Fund"]);
    expect(investors[0].cheque.stated).toBe(true);
    const pipe = await db.list("investor_pipeline", { where: { venture_id: v.id } });
    expect(pipe).toHaveLength(1);
    expect(pipe[0].stage).toBe("researching");
    expect(pipe[0].warm_intro).toBeNull();

    const tasks = await db.list("venture_tasks", { where: { venture_id: v.id } });
    expect(tasks.map((x) => x.phase).sort()).toEqual(["30", "60", "90"]);

    const cap = (await db.list("cap_tables", { where: { venture_id: v.id } }))[0];
    expect(cap.rounds[0].status).toBe("modelled");
    expect(cap.basis).toBe("estimate");

    // Nothing external was sent.
    expect(await db.count("outreach")).toBe(0);

    // Editable: Sean's edit becomes a new version and survives a CFO rerun.
    const res = await saveModelApi(req({ drivers: [{ key: "cpm", value: 3.1 }], note: "My own CPM data" }), params({ ventureId: v.id }));
    expect((await res.json()).model.version).toBe(2);
    const cpm = (await db.list("fin_models", { where: { venture_id: v.id } }))[0].drivers.find((d) => d.key === "cpm")!;
    expect(cpm).toMatchObject({ value: 3.1, basis: "user" });
    const rerun = await (await ventureAct(req({ action: "model" }), params({ id: v.id }))).json();
    await runTask(rerun.task.id);
    const m3 = (await db.list("fin_models", { where: { venture_id: v.id } }))[0];
    expect(m3.version).toBe(3);
    expect(m3.drivers.find((d) => d.key === "cpm")!.value).toBe(3.1);
    const csv = await (await getModelApi(new Request(`http://x?format=csv`), params({ ventureId: v.id }))).text();
    expect(csv).toContain("Closing cash");
    expect(csv).toContain("forecasts");

    // Pipeline: stage history and a documented warm intro.
    await pipelineAct(req({ action: "stage", stage: "shortlisted", note: "Good fit" }), params({ id: pipe[0].id }));
    await pipelineAct(req({ action: "intro", via: "Alex (documented)" }), params({ id: pipe[0].id }));
    const p2 = (await db.get("investor_pipeline", pipe[0].id))!;
    expect(p2.stage).toBe("shortlisted");
    expect(p2.history).toHaveLength(2);
    expect(p2.warm_intro!.via).toBe("Alex (documented)");
  });

  it("copilot takes only whitelisted internal actions and reports failures truthfully", async () => {
    const { db } = await setup((r, text) => team(r.agent, text));
    const webster = (await db.list("ventures")).find((v) => v.name === "Webster")!;
    const b = await (await ventureAct(req({ action: "build" }), params({ id: webster.id }))).json();
    await runTask(b.task.id);
    const out = await (await copilotPost(req({ thread: `v:${webster.id}`, text: "Be more cautious on CPM and add a task to call producers" }))).json();
    await runTask(out.task.id);
    const { messages } = await (await copilotGet(new Request(`http://x?thread=v:${webster.id}`))).json();
    expect(messages).toHaveLength(2);
    const reply = messages[1];
    expect(reply.status).toBe("done");
    expect(reply.actions.map((a: { ok: boolean }) => a.ok)).toEqual([true, true, false]);
    const m = (await db.list("fin_models", { where: { venture_id: webster.id } }))[0];
    expect(m.drivers.find((d) => d.key === "cpm")).toMatchObject({ value: 1.8, basis: "user" });
    expect(m.change_note).toContain("Copilot");
    expect((await db.list("venture_tasks", { where: { venture_id: webster.id } })).some((t) => t.title === "Call two kids' media producers")).toBe(true);
    expect(await db.count("outreach")).toBe(0);
  });

  it("creates a venture from an idea and starts the pipeline", async () => {
    const { db } = await setup((r, text) => team(r.agent, text));
    const res = await (await createVenture(req({ name: "Pocket Planets", idea: "Collectible planets kids grow with real-world steps" }))).json();
    expect(res.task.kind).toBe("venture_build");
    expect((await db.get("ventures", res.venture.id))!.status).toBe("running");
    const dupe = await createVenture(req({ name: "pocket planets" }));
    expect(dupe.status).toBe(409);
  });

  it("encrypts credentials and never returns them", async () => {
    await setup(() => ({}));
    const enc = encrypt("ch-secret-1234");
    expect(enc.ciphertext).not.toContain("secret");
    expect(decrypt(enc)).toBe("ch-secret-1234");
    expect(() => decrypt({ ...enc, tag: Buffer.alloc(16).toString("base64") })).toThrow();
    await credsPost(req({ provider: "companies_house", secret: "ch-secret-1234" }));
    expect(await getCredential("companies_house")).toBe("ch-secret-1234");
    const body = JSON.stringify(await (await credsGet()).json());
    expect(body).not.toContain("ch-secret");
    expect(body).toContain("…1234");
    await setCredential("companies_house", "another-key-9999");
    expect(await getCredential("companies_house")).toBe("another-key-9999");
  });
});

describe("agent office", () => {
  it("animates only agents with real work, attributing a running step to its own agent", async () => {
    const { db } = await setup(() => ({}));
    const { officeState } = await import("@/lib/founder/office");
    const { createTask } = await import("@/lib/engine");
    expect((await officeState()).agents.every((a) => a.state === "idle" && !a.task)).toBe(true);
    const t = await createTask({ title: "Webster: build the business", kind: "venture_build", agent: "chief_of_staff" });
    await db.update("tasks", t.id, { status: "running" });
    await db.insert("task_steps", { id: "st1", task_id: t.id, idx: 1, agent: "cfo", title: "Financial model for Webster", status: "running", output: null, cost_cents: 0, started_at: new Date().toISOString(), finished_at: null, error: null });
    const q = await createTask({ title: "Find investors", kind: "investor_research", agent: "investors" });
    const w = await createTask({ title: "Draft", kind: "research_report", agent: "fundraising" });
    await db.update("tasks", w.id, { status: "awaiting_approval" });
    const s = await officeState();
    const by = Object.fromEntries(s.agents.map((a) => [a.key, a]));
    expect(by.cfo.state).toBe("working");
    expect(by.cfo.task!.step).toBe("Financial model for Webster");
    expect(by.chief_of_staff.state).toBe("idle");
    expect(by.investors.state).toBe("queued");
    expect(by.investors.task!.id).toBe(q.id);
    expect(by.fundraising.state).toBe("waiting");
    expect(by.legal.state).toBe("idle");
  });
});

describe("growth engine", () => {
  it("gates paid experiments behind a cap, starts only on approval, and scores from real numbers", async () => {
    const { db } = await setup((r, text) => team(r.agent, text));
    const { POST: growth } = await import("@/app/api/founder/growth/[ventureId]/route");
    const { POST: approve } = await import("@/app/api/approvals/[id]/route");
    const band = (await db.list("ventures")).find((v) => v.name === "BandApp")!;
    const go = (b: unknown) => growth(req(b), params({ ventureId: band.id }));

    // No cap: the paid experiment isn't even proposed.
    let t = (await (await go({ action: "plan" })).json()).task;
    let done = await runTask(t.id);
    expect(done.status).toBe("awaiting_approval");
    let exps = await db.list("experiments", { where: { venture_id: band.id } });
    expect(exps.map((e) => e.budget)).toEqual([0]);
    expect((await db.list("venture_docs", { where: { venture_id: band.id, kind: "growth_plan" } }))[0].body).toContain("Store listing (draft)");

    // With a £100 cap both are proposed; the earlier proposal is replaced.
    expect((await go({ action: "cap", cap: 100 })).status).toBe(200);
    t = (await (await go({ action: "plan" })).json()).task;
    await runTask(t.id);
    exps = (await db.list("experiments", { where: { venture_id: band.id } })).filter((e) => e.status === "proposed");
    expect(exps.map((e) => e.budget).sort()).toEqual([0, 80]);
    const paid = exps.find((e) => e.budget === 80)!, free = exps.find((e) => e.budget === 0)!;

    // Lower the cap below the budget: approval is refused and nothing starts.
    await go({ action: "cap", cap: 50 });
    const refused = await approve(req({ decision: "approved" }), params({ id: paid.approval_id! }));
    expect(refused.status).toBe(409);
    expect((await db.get("experiments", paid.id))!.status).toBe("proposed");
    expect((await db.get("approvals", paid.approval_id!))!.status).toBe("pending");
    await go({ action: "cap", cap: 100 });
    expect((await approve(req({ decision: "approved" }), params({ id: paid.approval_id! }))).status).toBe(200);
    expect((await approve(req({ decision: "approved" }), params({ id: free.approval_id! }))).status).toBe(200);
    const running = (await db.get("experiments", paid.id))!;
    expect(running.status).toBe("running");

    // Real numbers, by hand and by CSV; then the window closes and a review scores it.
    const day = running.started_at!;
    await go({ action: "metric", date: day, metric: "installs", value: 70 });
    const csv = await (await go({ action: "csv", csv: `date,installs,spend\n${day},90,40\nnot-a-date,1,1` })).json();
    expect(csv).toMatchObject({ added: 1, updated: 1, skipped: 1 });
    await go({ action: "spend", id: paid.id, value: 78 });
    await db.update("experiments", paid.id, { ends_at: "2000-01-01", started_at: "1999-12-25" });
    await db.update("experiments", free.id, { ends_at: "2000-01-01", started_at: "1999-12-25" });
    await db.update("experiments", paid.id, { started_at: day, ends_at: day });
    const rv = (await (await go({ action: "review" })).json()).task;
    await runTask(rv.id);
    const scored = (await db.get("experiments", paid.id))!;
    expect(scored.result).toMatchObject({ value: 90, verdict: "inconclusive" });
    expect((await db.get("experiments", free.id))!.result!.verdict).toBe("no_data");
    expect(scored.spent).toBe(78);
    // Nothing was published or sent.
    expect(await db.count("outreach")).toBe(0);
  });

  it("parses long and wide metric CSVs", async () => {
    const { parseMetricsCsv } = await import("@/lib/founder/growth-core");
    expect(parseMetricsCsv('Date,Metric,Value\n01/10/2026,Revenue,"£1,234"\n2026-10-02,installs,5').rows).toEqual([{ date: "2026-10-01", metric: "revenue", value: 1234 }, { date: "2026-10-02", metric: "installs", value: 5 }]);
    expect(parseMetricsCsv("date,metric,value\n2026-10-01,revenue,12.5").rows).toEqual([{ date: "2026-10-01", metric: "revenue", value: 12.5 }]);
    expect(parseMetricsCsv("date,installs,sign ups,revenue\n02/10/2026,4,,9").rows).toEqual([{ date: "2026-10-02", metric: "installs", value: 4 }, { date: "2026-10-02", metric: "revenue", value: 9 }]);
  });
});
