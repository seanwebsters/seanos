import "server-only";
import * as z from "zod/v4";
import { getDb } from "@/lib/db";
import type { Automation, Outreach, Report, Scope } from "@/lib/db/types";
import { callAgent } from "@/lib/ai/llm";
import { AGENTS, isAgentKey, type AgentKey } from "@/lib/ai/agents";
import { dedupeKey, newId, nowIso } from "@/lib/util";
import { generateImage, imagesConfigured } from "@/lib/integrations/images";
import { nextRunAt } from "../schedule";
import { getWorkflow, registerWorkflow, type RunContext } from "../jobs";
import { SEARCH_RULE, SourceVerifier, SourceZ, toSources } from "./common";
import { findPeople } from "./people";
import { IdeaZ, ideaRow } from "./opportunities";

const DocZ = z.object({
  title: z.string(),
  summary: z.string(),
  body: z.string().describe("Markdown document with ## sections"),
  slides: z.array(z.object({ title: z.string(), bullets: z.array(z.string()), notes: z.string() })).describe("Slides if a deck was requested, else empty"),
  image_prompts: z.array(z.string()).describe("Up to 3 image prompts if visuals were requested, else empty"),
  sources: z.array(SourceZ),
});

/** Resolves the subject of a task into context text, respecting scope. */
async function subjectContext(ref: RunContext["task"]["context_ref"]): Promise<{ text: string; scope: Scope }> {
  if (!ref) return { text: "", scope: "personal" };
  const db = getDb();
  const get = async () => {
    switch (ref.type) {
      case "story": { const s = await db.get("stories", ref.id); return s && { text: `Article: ${s.headline}\n${s.what}\nWhy: ${s.why}\nSources: ${s.sources.map((x) => x.url).join(", ")}`, scope: "public" as Scope }; }
      case "trend": { const t = await db.get("trends", ref.id); return t && { text: `Trend: ${t.title}\n${t.what}\nWhy: ${t.why}\nDrivers: ${t.drivers.join(", ")}\nOpportunities: ${t.opportunities.join("; ")}`, scope: "public" as Scope }; }
      case "idea": { const i = await db.get("ideas", ref.id); return i && { text: `Idea: ${i.title}: ${i.one_liner}\nInsight: ${i.insight}\nProduct: ${i.product}\nAudience: ${i.audience}\nModel: ${i.business_model}\nCompetition: ${i.competition.map((c) => c.name).join(", ")}\nNotes: ${i.notes}`, scope: "personal" as Scope }; }
      case "person": { const p = await db.get("people", ref.id); return p && { text: `Person: ${p.name}, ${p.role} at ${p.company} (${p.location}). ${p.achievements.join("; ")}. Profiles: ${p.profiles.map((x) => x.url).join(", ")}`, scope: "personal" as Scope }; }
      case "partnership": { const p = await db.get("partnerships", ref.id); return p && { text: `Calmlings partnership: ${p.brand}. ${p.what_they_do}. Concept: ${p.concept.title}: ${p.concept.summary}`, scope: "work" as Scope }; }
      case "speaking": { const s = await db.get("speaking", ref.id); return s && { text: `Event: ${s.name} (${s.kind}), ${s.location}, ${s.start_date ?? "tbc"}. Organiser: ${s.organiser}. Audience: ${s.audience}`, scope: "public" as Scope }; }
      case "report": { const r = await db.get("reports", ref.id); return r && { text: `Report: ${r.title}\n${r.summary}\n${r.body.slice(0, 4000)}`, scope: r.scope }; }
      case "opportunity": { const o = await db.get("opportunities", ref.id); return o && { text: `Opportunity: ${o.title}\n${o.thesis}\nItems: ${o.items.map((i) => `${i.type}: ${i.title} (${i.role})`).join("; ")}`, scope: "personal" as Scope }; }
      case "experience": { const e = await db.get("experiences", ref.id); return e && { text: `London: ${e.title} at ${e.venue}, ${e.dates}. ${e.description}`, scope: "personal" as Scope }; }
      case "task": { const t = await db.get("tasks", ref.id); return t && { text: `Earlier task: ${t.title}\nResult: ${t.summary ?? ""}`, scope: "personal" as Scope }; }
      default: return null;
    }
  };
  return (await get()) ?? { text: `Subject: ${ref.title}`, scope: "personal" };
}

export async function writeDocument(ctx: RunContext, opts: { agent: AgentKey; kind: string; instruction: string; web: boolean; visuals?: boolean; tags?: string[] }): Promise<Report> {
  const db = getDb();
  const subject = await subjectContext(ctx.task.context_ref);
  const r = await ctx.step(opts.agent, opts.instruction.length > 70 ? `${opts.instruction.slice(0, 68)}…` : opts.instruction, async () => {
    const res = await callAgent({ agent: opts.agent, taskId: ctx.task.id, webSearch: opts.web, schema: DocZ, prompt: `${opts.instruction}\n\n${subject.text ? `Context:\n${subject.text}\n\n` : ""}${opts.web ? SEARCH_RULE : "Don't state facts you can't support; label estimates as illustrative."}` });
    return { ...res.data, found: res.sources };
  });
  const v = new SourceVerifier();
  v.add(r.found);
  let images: string[] = [];
  if (opts.visuals && r.image_prompts.length) {
    images = await ctx.step("creative", "Generating visuals", async () => {
      if (!imagesConfigured()) {
        await ctx.log("Visuals skipped: add FAL_KEY to enable image generation.", "creative", "warn");
        return [] as string[];
      }
      const out: string[] = [];
      for (const p of r.image_prompts.slice(0, 3)) out.push(await generateImage(p, ctx.task.id));
      return out;
    });
  }
  const sources = toSources(v.filter(r.sources));
  const row: Report = {
    id: newId("rep"), kind: opts.kind, title: r.title, summary: r.summary, body: r.body, slides: r.slides, sources, subject_ref: ctx.task.context_ref,
    scope: subject.scope === "work" || ["partnerships", "bizdev"].includes(opts.agent) ? "work" : subject.scope, tags: opts.tags ?? [], images, task_id: ctx.task.id, created_at: nowIso(),
  };
  await db.insert("reports", row);
  ctx.cite(sources);
  ctx.deliver({ type: "report", id: row.id, title: row.title });
  if (ctx.task.context_ref?.type === "idea") {
    const idea = await db.get("ideas", ctx.task.context_ref.id);
    if (idea) await db.update("ideas", idea.id, { status: idea.status === "captured" ? "developing" : idea.status, images: [...idea.images, ...images], updated_at: nowIso() });
  }
  return row;
}

registerWorkflow({
  kind: "research_report",
  title: "Research report",
  agent: "research",
  async run(ctx) {
    const r = await writeDocument(ctx, { agent: "research", kind: String(ctx.task.params.report_kind ?? "research"), instruction: ctx.task.instruction, web: true, tags: ["research"] });
    return { summary: r.summary };
  },
});

export const IDEA_ACTIONS: Record<string, { label: string; agent: AgentKey; kind: string; web: boolean; visuals?: boolean; prompt: string }> = {
  business_plan: { label: "Build a business plan", agent: "strategist", kind: "business_plan", web: true, prompt: "Write a lean business plan: problem, solution, customer, market (sourced), model, go-to-market, team, milestones, risks." },
  brand_identity: { label: "Create a brand identity", agent: "creative", kind: "brand_identity", web: false, visuals: true, prompt: "Create a brand identity: name options, positioning, personality, tone of voice, visual direction (type, colour, imagery) and 3 image prompts for a mood board." },
  mockups: { label: "Generate product mockups", agent: "creative", kind: "mockups", web: false, visuals: true, prompt: "Describe the key product moments and write 3 detailed image prompts for photoreal product mockups (no text in images)." },
  competitors: { label: "Research competitors", agent: "research", kind: "market_map", web: true, prompt: "Map the competitive landscape: direct and indirect competitors, positioning, pricing if public, funding if public, gaps, and where this idea can win." },
  market: { label: "Evaluate market demand", agent: "research", kind: "research", web: true, prompt: "Evaluate market demand with evidence: audience size indicators, search and social signals, comparable successes and failures. Separate evidence from estimates." },
  financial_model: { label: "Build a financial model", agent: "strategist", kind: "financial_model", web: false, prompt: "Build an illustrative 3-year financial scenario (conservative / base / ambitious) as markdown tables: pricing, customers, revenue, costs, break-even. Every assumption explicit and labelled illustrative." },
  pitch_deck: { label: "Create a pitch deck", agent: "creative", kind: "deck", web: false, prompt: "Create a 10-slide pitch deck (title, problem, insight, solution, product, market, model, traction plan, team, ask) with speaker notes. Fill the slides array." },
  cofounders: { label: "Find potential co-founders", agent: "networking", kind: "people", web: true, prompt: "Find people who could be strong co-founders or early collaborators for this idea." },
  launch_strategy: { label: "Develop a launch strategy", agent: "strategist", kind: "launch_strategy", web: false, prompt: "Develop a low-cost launch strategy: 2-week test, smoke test or waitlist, first 100 users, channels, metrics and kill criteria." },
  prototype: { label: "Prototype the product", agent: "creative", kind: "prototype", web: false, visuals: true, prompt: "Write a clickable-prototype spec: core user flow screen by screen, key UI components, landing page copy, and 2 image prompts for key screens." },
  challenge: { label: "Challenge assumptions", agent: "strategist", kind: "research", web: true, prompt: "Play devil's advocate. List the riskiest assumptions, evidence for and against each, and how to test them cheaply." },
  collaborators: { label: "Suggest collaborators", agent: "bizdev", kind: "research", web: true, prompt: "Suggest companies, creators and partners who could collaborate on this, with why and how." },
};

registerWorkflow({
  kind: "idea_develop",
  title: "Develop an idea",
  agent: "ventures",
  async run(ctx) {
    const action = IDEA_ACTIONS[String(ctx.task.params.action ?? "")] ?? IDEA_ACTIONS.business_plan;
    if (action.kind === "people") {
      const subject = await subjectContext(ctx.task.context_ref);
      const people = await findPeople(ctx, { count: 5, brief: `${action.prompt}\n${subject.text}`, category: "Potential co-founder" });
      return { summary: `${people.length} potential co-founders found.` };
    }
    const r = await writeDocument(ctx, { agent: action.agent, kind: action.kind, instruction: `${action.prompt}\n${ctx.task.instruction !== ctx.task.title ? ctx.task.instruction : ""}`, web: action.web, visuals: action.visuals, tags: ["ideas"] });
    return { summary: r.summary };
  },
});

registerWorkflow({
  kind: "idea_capture",
  title: "Capture an idea",
  agent: "ventures",
  async run(ctx) {
    const db = getDb();
    const trends = await db.list("trends");
    const v = new SourceVerifier();
    const res = await ctx.step("ventures", "Shaping the idea", async () => {
      const r = await callAgent({ agent: "ventures", taskId: ctx.task.id, webSearch: true, schema: IdeaZ, prompt: `Sean has an idea. Shape it into a full concept and give an honest verdict. Check competitors with web search.\nSean's idea: ${ctx.task.instruction}\nKnown trends: ${trends.slice(0, 15).map((t) => t.title).join("; ") || "none"}\n${SEARCH_RULE}` });
      return { idea: r.data, found: r.sources };
    });
    v.add(res.found);
    const prev = (await db.list("ideas")).find((i) => i.dedupe_key === dedupeKey(res.idea.title)) ?? null;
    const row = { ...ideaRow(res.idea, trends, ctx.task.id, v, prev), origin: "user" as const };
    await db.upsert("ideas", row);
    ctx.deliver({ type: "idea", id: row.id, title: row.title });
    return { summary: `${row.title}: ${row.one_liner} Verdict: ${row.verdict}.` };
  },
});

registerWorkflow({
  kind: "idea_connections",
  title: "Connect ideas",
  agent: "ventures",
  async run(ctx) {
    const db = getDb();
    const ideas = (await db.list("ideas")).filter((i) => i.status !== "archived");
    if (ideas.length < 2) return { summary: "Add at least two ideas to find connections." };
    const r = await ctx.step("ventures", "Looking for links and unexpected combinations", async () =>
      (await callAgent({ agent: "ventures", taskId: ctx.task.id, schema: z.object({ links: z.array(z.object({ a: z.number(), b: z.number(), why: z.string() })), combinations: z.array(z.object({ title: z.string(), from: z.array(z.number()), concept: z.string() })), ranking: z.array(z.object({ index: z.number(), reason: z.string() })) }), prompt: `Find meaningful relationships between Sean's ideas, suggest unexpected combinations and rank which are most worth pursuing.\n${ideas.map((i, n) => `[${n}] ${i.title}: ${i.one_liner}`).join("\n")}` })).data,
    );
    for (const l of r.links) {
      const a = ideas[l.a], b = ideas[l.b];
      if (!a || !b || a.id === b.id) continue;
      a.links = [...new Set([...a.links, b.id])];
      b.links = [...new Set([...b.links, a.id])];
    }
    for (const i of ideas) await db.update("ideas", i.id, { links: i.links });
    const body = `## Connections\n${r.links.map((l) => `- **${ideas[l.a]?.title}** ↔ **${ideas[l.b]?.title}**: ${l.why}`).join("\n")}\n\n## Unexpected combinations\n${r.combinations.map((c) => `- **${c.title}** (from ${c.from.map((f) => ideas[f]?.title).join(" + ")}): ${c.concept}`).join("\n")}\n\n## Priority\n${r.ranking.map((x, n) => `${n + 1}. **${ideas[x.index]?.title}**: ${x.reason}`).join("\n")}`;
    const id = newId("rep");
    await db.insert("reports", { id, kind: "idea_map", title: "Idea vault: connections & priorities", summary: `${r.links.length} connections, ${r.combinations.length} combinations.`, body, slides: [], sources: [], subject_ref: null, scope: "personal", tags: ["ideas"], images: [], task_id: ctx.task.id, created_at: nowIso() });
    ctx.deliver({ type: "report", id, title: "Idea vault: connections & priorities" });
    return { summary: `${r.links.length} connections and ${r.combinations.length} combinations found.` };
  },
});

registerWorkflow({
  kind: "outreach_draft",
  title: "Draft outreach",
  agent: "networking",
  async run(ctx) {
    const db = getDb();
    const ref = ctx.task.context_ref;
    if (!ref || !["person", "partnership"].includes(ref.type)) throw new Error("Outreach needs a person or partnership.");
    const subject = await subjectContext(ref);
    const agent: AgentKey = ref.type === "person" ? "networking" : "bizdev";
    const r = await ctx.step(agent, `Drafting a message to ${ref.title}`, async () =>
      (await callAgent({ agent, taskId: ctx.task.id, schema: z.object({ subject: z.string(), body: z.string(), channel: z.enum(["email", "linkedin", "dm"]) }), prompt: `${ctx.task.instruction}\n${subject.text}\nShort, warm, specific, in Sean's voice. No invented shared history.` })).data,
    );
    const or: Outreach = { id: newId("out"), target_type: ref.type as "person" | "partnership", target_id: ref.id, target_name: ref.title, channel: r.channel, to: null, subject: r.subject, body: r.body, status: "draft", follow_up_at: null, reply_note: "", approved_at: null, sent_at: null, created_at: nowIso(), updated_at: nowIso() };
    await db.insert("outreach", or);
    if (ref.type === "person") await db.update("people", ref.id, { message: r.body });
    await ctx.needsApproval({ type: "outreach", ref_id: or.id, title: `Message to ${ref.title}`, summary: r.subject, agent });
    return { summary: `Message to ${ref.title} drafted.`, awaitingApproval: true };
  },
});

/* ------------------------- Universal delegation ------------------------- */

const CAPABILITIES: Record<string, { workflow?: string; describe: string }> = {
  research: { describe: "Sourced research report on any topic (Research Analyst, web)" },
  write: { describe: "Any written deliverable by any agent: plan, strategy, brief, email, itinerary, workout plan, budget" },
  deck: { describe: "A slide deck" },
  find_people: { workflow: "people_weekly", describe: "Find interesting people to meet (params: count, brief)" },
  find_partners: { workflow: "partnerships", describe: "Discover Calmlings brand partners (params: count, focus)" },
  partnership_pack: { workflow: "partnership_pack", describe: "Full partnership pack for one named brand (params: brand)" },
  content: { workflow: "content_plan", describe: "Draft social posts/essays in Sean's voice (params: count)" },
  london: { workflow: "london", describe: "Find London restaurants, events, exhibitions, experiences" },
  trends: { workflow: "trend_scan", describe: "Trend radar scan (params: focus)" },
  ideas: { workflow: "venture_ideas", describe: "Generate original business ideas (params: count)" },
  capture_idea: { workflow: "idea_capture", describe: "Capture and shape one of Sean's own ideas" },
  speaking: { workflow: "speaking_scan", describe: "Find speaking opportunities (params: focus)" },
  shopping: { workflow: "shopping", describe: "Research clothes or products to buy, with real links" },
  edition: { workflow: "edition", describe: "Generate today's newspaper" },
  outfit: { workflow: "outfit", describe: "Suggest today's outfit" },
  finance: { workflow: "finance_plan", describe: "Budgets, spending review, savings plans and money questions, using Sean's real finance data (Financial Planner)" },
};

const PlanZ = z.object({
  title: z.string().describe("Short task title"),
  objective: z.string(),
  recurrence: z.object({ cadence: z.enum(["daily", "weekly"]), weekday: z.number().nullable().describe("0=Sunday"), hour: z.number(), minute: z.number() }).nullable().describe("Only if Sean asked for something recurring"),
  steps: z.array(z.object({
    agent: z.enum(AGENTS.map((a) => a.key) as [AgentKey, ...AgentKey[]]),
    capability: z.enum(Object.keys(CAPABILITIES) as [string, ...string[]]),
    instruction: z.string(),
    count: z.number().nullable(),
    focus: z.string().nullable(),
  })).describe("1-4 steps; later steps can build on earlier ones"),
});

registerWorkflow({
  kind: "freeform",
  title: "Delegated task",
  agent: "chief_of_staff",
  async run(ctx) {
    const db = getDb();
    const subject = await subjectContext(ctx.task.context_ref);
    const plan = await ctx.step("chief_of_staff", "Understanding the objective and planning", async () =>
      (await callAgent({
        agent: "chief_of_staff", taskId: ctx.task.id, effort: "low", schema: PlanZ,
        prompt: `Sean asked: "${ctx.task.instruction}"\n${subject.text ? `About: ${subject.text}\n` : ""}Plan the work and assign specialists. Capabilities:\n${Object.entries(CAPABILITIES).map(([k, c]) => `- ${k}: ${c.describe}`).join("\n")}\nAgents: ${AGENTS.map((a) => `${a.key} (${a.name})`).join(", ")}.\nPrefer the fewest steps that produce a usable deliverable.`,
      })).data,
    );
    await db.update("tasks", ctx.task.id, { title: ctx.task.title === ctx.task.instruction.slice(0, 80) ? plan.title : ctx.task.title });
    if (plan.recurrence && !ctx.task.automation_id) {
      const a: Automation = { id: newId("auto"), workflow: "freeform", name: plan.title, description: ctx.task.instruction, cadence: plan.recurrence.cadence, weekday: plan.recurrence.weekday, hour: plan.recurrence.hour, minute: plan.recurrence.minute, params: { instruction: ctx.task.instruction }, enabled: true, est_cost_cents: 40, last_run_at: nowIso(), next_run_at: null, last_task_id: ctx.task.id, created_at: nowIso() };
      a.next_run_at = nextRunAt(a).toISOString();
      await db.insert("automations", a);
      await ctx.log(`Set up as a recurring automation: ${plan.title}.`, "chief_of_staff");
    }
    const results: string[] = [];
    let awaiting = false;
    for (const [i, s] of plan.steps.slice(0, 4).entries()) {
      const cap = CAPABILITIES[s.capability];
      const agent: AgentKey = isAgentKey(s.agent) ? s.agent : "research";
      const prior = results.length ? `\n\nEarlier results from the team:\n${results.join("\n")}` : "";
      const wf = cap?.workflow ? getWorkflow(cap.workflow) : null;
      if (wf) {
        const sub: RunContext = { ...ctx, task: { ...ctx.task, instruction: `${s.instruction}${prior}`, title: s.instruction, params: { ...ctx.task.params, count: s.count ?? undefined, focus: s.focus ?? undefined, brand: s.focus ?? s.instruction, brief: s.instruction } } };
        const out = await wf.run(sub);
        awaiting ||= Boolean(out.awaitingApproval);
        results.push(`${i + 1}. ${out.summary}`);
      } else {
        const doc = await writeDocument(ctx, { agent, kind: s.capability === "deck" ? "deck" : s.capability === "research" ? "research" : "document", instruction: `${s.instruction}${s.capability === "deck" ? " Fill the slides array." : ""}${prior}`, web: s.capability === "research" || agent === "research" || agent === "concierge", tags: ["delegated"] });
        results.push(`${i + 1}. ${doc.title}: ${doc.summary}`);
      }
      await ctx.progress(0.2 + (0.8 * (i + 1)) / plan.steps.length);
    }
    return { summary: `${plan.objective}\n${results.join("\n")}`, awaitingApproval: awaiting };
  },
});
