import { afterEach, describe, expect, it } from "vitest";
import { setup, src } from "./helpers";
import { setTransport } from "@/lib/ai/llm";
import { createTask, runTask } from "@/lib/engine";
import { POST as submit } from "@/app/api/infinity/decisions/route";
import { POST as act } from "@/app/api/infinity/decisions/[id]/route";
import { simulate } from "@/lib/future/model";

afterEach(() => setTransport(null));
const req = (b: unknown) => new Request("http://x", { method: "POST", body: JSON.stringify(b) });
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

const view = (stance: string, score: number) => ({ stance, score, summary: "s", points: ["p"], risks: ["r"], assumptions: ["a"], questions: ["q"], preferred_option: stance === "oppose" ? "Not now" : "Build it" });

describe("intelligence council", () => {
  it("researches, runs seven independent lenses, synthesises, and learns from the decision", async () => {
    const lensPrompts: string[] = [];
    const { db, calls } = await setup((r, text) => {
      if (text.includes("Frame the real options")) return { options: ["Build it", "Not now"], unknowns: [{ question: "Is there demand?", finding: "Some", sources: [src("https://www.ft.com/content/abc")] }], evidence: [{ claim: "Real", source_url: "https://www.ft.com/content/abc" }, { claim: "Made up", source_url: "https://fake.example/x" }] };
      if (text.includes("Your lens:")) { lensPrompts.push(text); return view(text.includes("The Sceptic") ? "oppose" : "support", text.includes("The Sceptic") ? 3 : 7); }
      return { disagreements: [{ topic: "Demand", positions: ["Investor: yes", "Sceptic: unproven"] }], tradeoffs: ["Time vs learning"], recommendation: { option: "Build it", confidence: 0.64, rationale: "r" }, would_change: ["No signups after 4 weeks"], next_steps: [{ label: "Smoke test", instruction: "Build a waitlist page" }] };
    });
    const { decision, task } = await (await submit(req({ question: "Should I spend six months building VoysNote?" }))).json();
    const t = await runTask(task.id);
    expect(t.status).toBe("completed");
    expect(lensPrompts).toHaveLength(7);
    // Independence: no lens sees another lens's verdict.
    expect(lensPrompts.every((p) => !p.includes("[support") && !p.includes("[oppose"))).toBe(true);
    const d = (await db.get("decisions", decision.id))!;
    expect(d.status).toBe("ready");
    expect(d.views).toHaveLength(7);
    expect(d.evidence.find((e) => e.claim === "Made up")!.source_url).toBeNull();
    expect(d.recommendation!.option).toBe("Build it");
    expect(calls.find((c) => c.content.some((x) => "text" in x && x.text.includes("Synthesise")))).toBeTruthy();

    await act(req({ action: "decide", option: "Not now", note: "Calm launch season" }), params({ id: decision.id }));
    const mem = (await db.list("memories", { where: { kind: "decision" } })).at(-1)!;
    expect(mem.content).toContain('the council recommended "Build it"');
    expect(mem.content).toContain("Calm launch season");
  });
});

describe("future engine", () => {
  it("models four paths and downgrades unverified 'sourced' assumptions to estimates", async () => {
    const a = (key: string, value: number, basis = "estimate", source_url: string | null = null) => ({ key, value, basis, note: "n", source_url, low: value * 0.5, high: value * 1.5 + 1 });
    const { db } = await setup(() => ({
      summary: "s", model_fit: "f",
      assumptions: [a("months", 12), a("launch_month", 3), a("upfront_cost", 3000), a("monthly_cost", 400), a("hours_per_week", 12), a("price", 8, "sourced", "https://www.ft.com/content/abc"), a("start_customers", 50), a("new_customers_per_month", 40, "sourced", "https://invented.example"), a("acquisition_growth", 5), a("churn_rate", 6), a("other_monthly_income", 0), a("opportunity_cost_per_month", 300)],
      paths: ["optimistic", "conservative", "alternative", "base"].map((name) => ({ name, title: name, narrative: "n", overrides: name === "optimistic" ? [{ key: "new_customers_per_month", value: 120 }] : [], milestones: [], risks: [], dependencies: [] })),
      qualitative: [{ dimension: "Reputation", conservative: 4, base: 6, optimistic: 8, alternative: 5, note: "" }], capabilities: ["Product"], market: "m", sources: [src("https://www.ft.com/content/abc")],
    }));
    const t = await runTask((await createTask({ title: "Futures", kind: "scenario", instruction: "What happens if I spend six months building VoysNote?" })).id);
    expect(t.status).toBe("completed");
    const [s] = await db.list("scenarios");
    expect(s.paths.map((p) => p.name)).toEqual(["conservative", "base", "optimistic", "alternative"]);
    expect(s.assumptions.find((x) => x.key === "price")!.basis).toBe("sourced");
    expect(s.assumptions.find((x) => x.key === "new_customers_per_month")!.basis).toBe("estimate");
    const base = Object.fromEntries(s.assumptions.map((x) => [x.key, x.value]));
    expect(simulate({ ...base, ...s.paths[2].overrides }).mrr_end).toBeGreaterThan(simulate(base).mrr_end);
  });
});
