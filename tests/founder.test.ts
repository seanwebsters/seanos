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
