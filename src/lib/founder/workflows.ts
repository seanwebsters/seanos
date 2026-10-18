import "server-only";
import * as z from "zod/v4";
import { getDb } from "@/lib/db";
import type { Basis, Driver, FinModel, Venture } from "@/lib/db/types";
import { callAgent } from "@/lib/ai/llm";
import { getProfile } from "@/lib/bootstrap";
import { dedupeKey, newId, nowIso } from "@/lib/util";
import { addDays, londonDate } from "@/lib/time";
import { registerWorkflow, type RunContext } from "@/lib/engine/jobs";
import { notify } from "@/lib/services/notify";
import { SEARCH_RULE, SourceVerifier, SourceZ, toSources } from "@/lib/engine/workflows/common";
import { DRIVER_DEFS, STREAMS, money, runModel, type StreamKey } from "./finmodel";
import { ensureCapTable, getModel, portfolioSignals, saveModel, upsertDoc } from "./core";

const streamKeys = Object.keys(STREAMS) as [StreamKey, ...StreamKey[]];
const driverKeys = DRIVER_DEFS.map((d) => d.key) as [string, ...string[]];

async function founderContext(v: Venture) {
  const p = await getProfile();
  return `Founder: ${p.name}, ${p.age}, ${p.location}. ${p.role} at ${p.company} (employed; independent ventures must stay separate from Calm work). Creative and technical strengths: ${p.interests.slice(0, 5).join("; ")}.\nVenture: ${v.name}: ${v.tagline}. Category: ${v.category}. Stage: ${v.stage} (a proposed concept unless stated otherwise; not incorporated: ${v.incorporated ? "incorporated" : "not incorporated"}).\nKnown so far:\n${[["Thesis", v.thesis], ["Customer", v.customer], ["Market", v.market], ["Competition", v.competition], ["Model", v.business_model], ["Validation", v.validation]].filter(([, x]) => x).map(([k, x]) => `${k}: ${x}`).join("\n") || "Nothing yet."}\nOwnership: ${v.ownership}. Possible conflicts: ${v.conflicts.join(" ") || "none flagged"}.`;
}

/* ------------------------------ Strategy ------------------------------ */

const StrategyZ = z.object({
  concept: z.string().describe("The concept, clarified in 2-3 sentences"),
  thesis: z.string(),
  customer: z.string().describe("Specific target customer and the job they hire it for"),
  market_summary: z.string(),
  market_claims: z.array(z.object({ claim: z.string(), basis: z.enum(["verified", "estimate"]), source_url: z.string().nullable() })).describe("Market size and growth claims; verified only with a found URL"),
  competitors: z.array(z.object({ name: z.string(), url: z.string().nullable(), note: z.string() })),
  differentiation: z.string(),
  business_model: z.string(),
  pricing: z.string(),
  gtm: z.string().describe("Go-to-market: first channel, first 1,000 customers"),
  validation: z.array(z.object({ experiment: z.string(), metric: z.string(), success: z.string(), cost: z.string(), days: z.number() })),
  mvp: z.array(z.object({ milestone: z.string(), weeks: z.number() })),
  risks: z.array(z.object({ risk: z.string(), kind: z.enum(["market", "product", "financial", "legal", "operational", "founder"]), mitigation: z.string() })),
  body: z.string().describe("The full strategy as markdown with ## sections"),
  sources: z.array(SourceZ),
});

async function strategyStep(ctx: RunContext, v: Venture, rawIdea: string) {
  const db = getDb();
  const r = await ctx.step("strategist", `Strategy for ${v.name}`, async () => {
    const res = await callAgent({ agent: "strategist", taskId: ctx.task.id, webSearch: true, schema: StrategyZ, effort: "high", prompt: `Build the business strategy for this venture: clarify the concept, research the market, identify the target customer, analyse competitors, propose differentiation, define the business model, pricing and go-to-market, list validation experiments (cheap, fast, with success criteria), an MVP roadmap, and the key risks.\n${rawIdea ? `Sean's raw idea: ${rawIdea}\n` : ""}${await founderContext(v)}\n${SEARCH_RULE}` });
    return { ...res.data, found: res.sources };
  });
  const ver = new SourceVerifier();
  ver.add(r.found);
  const sources = toSources(ver.filter(r.sources));
  const claims = r.market_claims.map((c) => (c.basis === "verified" && ver.has(c.source_url) ? c : { ...c, basis: "estimate" as const, source_url: null }));
  const competitors = r.competitors.map((c) => ({ ...c, url: c.url && (ver.has(c.url) || ver.hostSeen(c.url)) ? c.url : null }));
  await db.update("ventures", v.id, {
    thesis: r.thesis, customer: r.customer, market: `${r.market_summary}\n${claims.map((c) => `- ${c.claim} [${c.basis}${c.source_url ? `: ${c.source_url}` : ""}]`).join("\n")}`,
    competition: competitors.map((c) => `- ${c.name}${c.url ? ` (${c.url})` : ""}: ${c.note}`).join("\n"), business_model: `${r.business_model}\nPricing: ${r.pricing}`,
    validation: r.validation.map((x) => `- ${x.experiment}: ${x.metric}; success = ${x.success} (${x.cost}, ${x.days} days)`).join("\n"),
    product: r.concept, roadmap: r.mvp.map((m) => `- ${m.milestone} (week ${m.weeks})`).join("\n"), tagline: v.tagline || r.concept.slice(0, 120), updated_at: nowIso(),
  });
  await upsertDoc(v.id, "strategy", { title: `${v.name}: business strategy`, body: r.body, sources, basis: "estimate", data: { claims, competitors, differentiation: r.differentiation, gtm: r.gtm, pricing: r.pricing } }, "strategist", ctx.task.id);
  await upsertDoc(v.id, "validation", { title: "Validation experiments", body: "", checklist: r.validation.map((x) => ({ item: `${x.experiment}: success = ${x.success}`, status: "todo", note: `${x.metric} · ${x.cost}`, due: addDays(londonDate(), x.days) })), basis: "estimate" }, "research", ctx.task.id);
  await upsertDoc(v.id, "risks", { title: "Risk register", body: r.risks.map((x) => `- **${x.kind}**: ${x.risk}. Mitigation: ${x.mitigation}`).join("\n"), data: { risks: r.risks }, basis: "estimate" }, "strategist", ctx.task.id);
  ctx.cite(sources);
  return r;
}

/* -------------------------------- CFO -------------------------------- */

const ModelZ = z.object({
  currency: z.enum(["GBP", "USD"]),
  months: z.number(),
  streams: z.array(z.enum(streamKeys)),
  drivers: z.array(z.object({ key: z.enum(driverKeys), value: z.number(), basis: z.enum(["verified", "estimate"]), note: z.string(), source_url: z.string().nullable() })),
  opex: z.array(z.object({ name: z.string(), monthly: z.number(), start_month: z.number(), growth_pct: z.number() })),
  team: z.array(z.object({ role: z.string(), monthly_cost: z.number(), start_month: z.number() })),
  startup_costs: z.array(z.object({ item: z.string(), amount: z.number() })),
  upside: z.array(z.object({ key: z.enum(driverKeys), value: z.number() })),
  downside: z.array(z.object({ key: z.enum(driverKeys), value: z.number() })),
  rationale: z.string().describe("Markdown: why these drivers, what the model can't capture, and which assumptions matter most"),
  sources: z.array(SourceZ),
});

export async function cfoStep(ctx: RunContext, v: Venture, brief: string, instruction = "") {
  const existing = await getModel(v.id);
  const r = await ctx.step("cfo", `Financial model for ${v.name}`, async () => {
    const res = await callAgent({
      agent: "cfo", taskId: ctx.task.id, webSearch: true, schema: ModelZ, effort: "high",
      prompt: `Build the driver-based financial model for ${v.name}. Choose the revenue streams that fit, then set every relevant driver. Use benchmarks you find (subscription prices, CPMs, churn, CAC, AI generation costs) and mark them "verified" only with a URL found in this task; otherwise "estimate" with a short reason. Include realistic startup costs, monthly operating costs and any team costs (founder works on this alongside a full-time job unless stated). Provide upside and downside overrides for the drivers that matter most. 36 months, GBP unless the venture is US-first.\nDrivers available:\n${DRIVER_DEFS.map((d) => `- ${d.key}: ${d.label} (${d.unit}${d.stream ? `, ${d.stream} stream` : ""}). ${d.help}`).join("\n")}\n${instruction ? `Sean asked: ${instruction}\n` : ""}${existing && existing.version > 0 ? `Current model (v${existing.version}) drivers: ${existing.drivers.filter((d) => d.value).map((d) => `${d.key}=${d.value} [${d.basis}]`).join(", ")}. Keep values Sean set himself (basis user) unless asked.\n` : ""}\nContext:\n${brief}\n${SEARCH_RULE}`,
    });
    return { ...res.data, found: res.sources };
  });
  const ver = new SourceVerifier();
  ver.add(r.found);
  const prev = new Map((existing?.drivers ?? []).map((d) => [d.key, d]));
  const drivers: Driver[] = DRIVER_DEFS.map((def) => {
    const user = prev.get(def.key);
    if (user?.basis === "user") return user;
    const x = r.drivers.find((d) => d.key === def.key);
    const verified = x?.basis === "verified" && ver.has(x.source_url);
    return { key: def.key, label: def.label, unit: def.unit, value: x?.value ?? (def.key === "launch_month" ? 1 : 0), basis: (x ? (verified ? "verified" : "estimate") : "estimate") as Basis, note: x?.note ?? "", source_url: verified ? x!.source_url : null };
  });
  const model = await saveModel(v.id, {
    currency: r.currency, months: Math.min(60, Math.max(12, Math.round(r.months || 36))), streams: Object.fromEntries(r.streams.map((s) => [s, true])), drivers,
    opex: r.opex, team: r.team, startup_costs: r.startup_costs.map((c) => ({ ...c, basis: "estimate" as Basis })),
    scenarios: { upside: Object.fromEntries(r.upside.map((x) => [x.key, x.value])), downside: Object.fromEntries(r.downside.map((x) => [x.key, x.value])) },
  }, "agent:cfo", instruction ? `CFO update: ${instruction.slice(0, 120)}` : "CFO built the model");
  const base = runModel(model), up = runModel(model, "upside"), down = runModel(model, "downside");
  const fmt = (n: number) => money(n, model.currency);
  const startup = model.startup_costs.reduce((s, c) => s + c.amount, 0);
  const body = `## Funding requirement (forecast)\n| | Downside | Base | Upside |\n|---|---|---|---|\n| Funding need (incl. 6-month buffer) | ${fmt(down.kpis.funding_need)} | ${fmt(base.kpis.funding_need)} | ${fmt(up.kpis.funding_need)} |\n| Deepest cash point | ${fmt(down.kpis.min_cash)} (month ${down.kpis.min_cash_month}) | ${fmt(base.kpis.min_cash)} (month ${base.kpis.min_cash_month}) | ${fmt(up.kpis.min_cash)} (month ${up.kpis.min_cash_month}) |\n| Year-1 revenue | ${fmt(down.kpis.revenue_y1)} | ${fmt(base.kpis.revenue_y1)} | ${fmt(up.kpis.revenue_y1)} |\n| Break-even | ${down.kpis.break_even_month ? `month ${down.kpis.break_even_month}` : "not in horizon"} | ${base.kpis.break_even_month ? `month ${base.kpis.break_even_month}` : "not in horizon"} | ${up.kpis.break_even_month ? `month ${up.kpis.break_even_month}` : "not in horizon"} |\n\nStartup costs: ${fmt(startup)} (estimates).\n\nThese are model outputs from labelled assumptions, not predictions. Revenue, company valuation and your personal wealth are different things.\n\n${r.rationale}`;
  await upsertDoc(v.id, "funding_requirements", { title: "Initial funding requirements", body, basis: "forecast", data: { base: base.kpis, upside: up.kpis, downside: down.kpis, model_version: model.version } }, "cfo", ctx.task.id);
  ctx.cite(toSources(ver.filter(r.sources)));
  return { model, base, up, down };
}

/* ----------------------------- Fundraising ----------------------------- */

const FundZ = z.object({
  route: z.enum(["bootstrap", "grants", "angels", "accelerator", "pre_seed_vc", "seed_vc", "strategic", "revenue_based", "crowdfunding"]),
  why: z.string(),
  alternatives: z.array(z.object({ route: z.string(), verdict: z.string() })),
  round: z.object({ instrument: z.string().describe("e.g. SEIS/EIS-eligible equity, advance subscription agreement, grant"), target: z.number(), currency: z.enum(["GBP", "USD"]), valuation_low: z.number(), valuation_high: z.number(), valuation_rationale: z.string(), use_of_funds: z.array(z.object({ item: z.string(), pct: z.number() })), milestones: z.array(z.string()) }),
  readiness: z.array(z.object({ item: z.string(), status: z.enum(["todo", "done", "na"]), note: z.string() })).describe("Investor-readiness checklist; 'done' only if the context shows it exists"),
  data_room: z.array(z.string()),
  roadmap: z.array(z.object({ phase: z.string(), weeks: z.number(), goals: z.array(z.string()) })),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
  memo: z.string().describe("One-page investment memo in markdown. Label every number as forecast or estimate; no invented traction."),
  deck: z.array(z.object({ title: z.string(), bullets: z.array(z.string()), notes: z.string() })).describe("10-12 slide pitch deck; no invented traction or logos"),
});

async function fundraisingStep(ctx: RunContext, v: Venture, brief: string, need: { base: number; down: number; up: number; currency: "GBP" | "USD" }) {
  const db = getDb();
  const r = await ctx.step("fundraising", `Fundraising plan for ${v.name}`, async () =>
    (await callAgent({
      agent: "fundraising", taskId: ctx.task.id, effort: "high", schema: FundZ,
      prompt: `Recommend how ${v.name} should be funded at its current stage, and prepare the materials.\nFunding need from the CFO's model (forecast): base ${money(need.base, need.currency)}, downside ${money(need.down, need.currency)}, upside ${money(need.up, need.currency)}.\nSize the round from that need and the milestones it should buy. Give a valuation range only as an estimate with rationale (comparables, stage norms), never as fact. Consider UK SEIS/EIS where relevant (flag for accountant review). Readiness items should only be 'done' if the context proves they exist.\n${brief}`,
    })).data,
  );
  const fmt = (n: number) => money(n, r.round.currency);
  await upsertDoc(v.id, "funding_plan", {
    title: "Funding strategy", basis: "estimate",
    body: `## Recommendation: ${r.route.replace(/_/g, " ")}\n${r.why}\n\n## The round (estimate)\n- Instrument: ${r.round.instrument}\n- Target: ${fmt(r.round.target)}\n- Indicative valuation range: ${fmt(r.round.valuation_low)}–${fmt(r.round.valuation_high)} pre-money (estimate: ${r.round.valuation_rationale})\n- Selling roughly ${Math.round((r.round.target / (r.round.target + r.round.valuation_high)) * 100)}–${Math.round((r.round.target / (r.round.target + r.round.valuation_low)) * 100)}% of the company\n\n### Use of funds\n${r.round.use_of_funds.map((u) => `- ${u.item}: ${u.pct}%`).join("\n")}\n\n### Milestones this round should buy\n${r.round.milestones.map((m) => `- ${m}`).join("\n")}\n\n## Alternatives considered\n${r.alternatives.map((a) => `- **${a.route}**: ${a.verdict}`).join("\n")}\n\n## Roadmap\n${r.roadmap.map((p) => `- **${p.phase}** (${p.weeks} weeks): ${p.goals.join("; ")}`).join("\n")}\n\n*Not investment, tax or legal advice. Funding is never guaranteed.*`,
    data: { route: r.route, round: r.round, roadmap: r.roadmap, need },
  }, "fundraising", ctx.task.id);
  await upsertDoc(v.id, "readiness", { title: "Investor-readiness checklist", body: "", checklist: r.readiness.map((x) => ({ item: x.item, status: x.status, note: x.note, due: null })), basis: "estimate" }, "fundraising", ctx.task.id);
  await upsertDoc(v.id, "data_room", { title: "Data room checklist", body: "", checklist: r.data_room.map((x) => ({ item: x, status: "todo", note: "", due: null })), basis: "estimate" }, "fundraising", ctx.task.id);
  await upsertDoc(v.id, "investor_memo", { title: "One-page investment memo", body: r.memo, basis: "estimate" }, "fundraising", ctx.task.id);
  await upsertDoc(v.id, "deck", { title: `${v.name}: pitch deck (draft)`, body: "", slides: r.deck, basis: "estimate" }, "fundraising", ctx.task.id);
  await upsertDoc(v.id, "investor_faq", { title: "Investor FAQ", body: r.faq.map((f) => `### ${f.q}\n${f.a}`).join("\n\n"), basis: "estimate" }, "fundraising", ctx.task.id);
  const cap = await ensureCapTable(v.id);
  const modelled = { name: `${r.round.instrument} (modelled)`, pre_money: Math.round((r.round.valuation_low + r.round.valuation_high) / 2), amount: Math.round(r.round.target), pool_top_up_pct: 10, status: "modelled" as const, date: null };
  await db.update("cap_tables", cap.id, { rounds: [...cap.rounds.filter((x) => x.status === "closed"), modelled], currency: r.round.currency, updated_at: nowIso() });
  return r;
}

/* --------------------------- Investor research --------------------------- */

const InvestorsZ = z.object({
  investors: z.array(z.object({
    name: z.string(), kind: z.enum(["angel", "vc", "accelerator", "grant", "strategic", "syndicate", "other"]), firm: z.string(),
    geography: z.array(z.string()), stages: z.array(z.string()), sectors: z.array(z.string()),
    cheque_min: z.number().nullable(), cheque_max: z.number().nullable(), cheque_currency: z.string(), cheque_stated: z.boolean().describe("True only if a source states the cheque size"),
    thesis: z.string(), notable: z.array(z.object({ name: z.string(), url: z.string().nullable() })),
    website: z.string().nullable(), apply_url: z.string().nullable().describe("Public application or contact route, never a personal email"),
    fit_score: z.number().describe("1-10"), fit_reasons: z.array(z.string()), sources: z.array(SourceZ),
  })),
});

export async function investorStep(ctx: RunContext, v: Venture, brief: string, focus = "") {
  const db = getDb();
  const r = await ctx.step("investors", `Researching investors for ${v.name}`, async () => {
    const res = await callAgent({ agent: "investors", taskId: ctx.task.id, webSearch: true, schema: InvestorsZ, prompt: `Find 8-12 real, currently active investors relevant to ${v.name}: UK and US angels, pre-seed/seed funds, accelerators, grant bodies or strategic investors that back this sector and stage. ${focus}\nFor each: firm, stage, geography, sectors, a relevant portfolio company, thesis, public website and application route. Cheque size only if a source states it. Give an honest fit score with reasons.\n${brief}\n${SEARCH_RULE}` });
    return { ...res.data, found: res.sources };
  });
  const ver = new SourceVerifier();
  ver.add(r.found);
  const existing = await db.list("investors");
  const pipeline = await db.list("investor_pipeline", { where: { venture_id: v.id } });
  let added = 0, dropped = 0;
  for (const i of r.investors) {
    const sources = toSources(ver.filter(i.sources));
    if (!sources.length) { dropped++; continue; }
    const key = dedupeKey(i.firm || i.name, i.name);
    let inv = existing.find((x) => x.dedupe_key === key);
    const row = {
      name: i.name, kind: i.kind, firm: i.firm, geography: i.geography, stages: i.stages, sectors: i.sectors,
      cheque: { min: i.cheque_stated ? i.cheque_min : null, max: i.cheque_stated ? i.cheque_max : null, currency: i.cheque_currency, stated: i.cheque_stated && sources.length > 0 },
      thesis: i.thesis, notable: i.notable.map((n) => ({ ...n, url: n.url && (ver.has(n.url) || ver.hostSeen(n.url)) ? n.url : null })),
      website: i.website && ver.hostSeen(i.website) ? i.website : null, apply_url: i.apply_url && (ver.has(i.apply_url) || ver.hostSeen(i.apply_url)) ? i.apply_url : null,
      sources, last_verified: londonDate(),
    };
    if (inv) inv = await db.update("investors", inv.id, row);
    else { inv = { id: newId("inv"), ...row, dedupe_key: key, created_at: nowIso() }; await db.insert("investors", inv); existing.push(inv); }
    if (!pipeline.some((p) => p.investor_id === inv!.id)) {
      await db.insert("investor_pipeline", { id: newId("pipe"), venture_id: v.id, investor_id: inv.id, stage: "researching", fit_score: Math.max(1, Math.min(10, Math.round(i.fit_score))), fit_reasons: i.fit_reasons, warm_intro: null, next_step: i.apply_url ? "Review fit, then prepare a tailored application" : "Review fit and find a documented intro route", follow_up_at: null, notes: "", history: [{ at: nowIso(), stage: "researching", note: "Found by Investor Research" }], created_at: nowIso(), updated_at: nowIso() });
      added++;
    }
    ctx.cite(sources);
  }
  if (dropped) await ctx.log(`${dropped} investor${dropped > 1 ? "s" : ""} dropped: no verifiable source.`, "investors", "warn");
  return { added, dropped };
}

/* ------------------------- Operations & legal ------------------------- */

const PlanZ = z.object({ tasks: z.array(z.object({ title: z.string(), detail: z.string(), phase: z.enum(["30", "60", "90"]), owner: z.string().describe("'sean' or an agent key such as research, growth, cfo, fundraising, investors, legal, operations, bizdev, creative"), due_days: z.number() })), summary: z.string() });
const LegalZ = z.object({ items: z.array(z.object({ item: z.string(), note: z.string(), due_days: z.number().nullable(), professional: z.boolean() })), conflicts: z.array(z.string()), summary: z.string() });

async function planStep(ctx: RunContext, v: Venture, brief: string) {
  const db = getDb();
  const r = await ctx.step("operations", `30/60/90-day plan for ${v.name}`, async () =>
    (await callAgent({ agent: "operations", taskId: ctx.task.id, effort: "medium", schema: PlanZ, prompt: `Turn the strategy, validation plan, model and fundraising roadmap into a 90-day action plan: 10-16 concrete tasks across days 1-30 (validate), 31-60 (build), 61-90 (prove and prepare to raise). Owners: Sean for things only he can do (decisions, conversations, approvals), agents for preparation. Respect that Sean has a full-time job.\n${brief}` })).data,
  );
  const old = await db.list("venture_tasks", { where: { venture_id: v.id, status: "todo" } });
  for (const t of old.filter((x) => !x.engine_task_id)) await db.remove("venture_tasks", t.id);
  for (const t of r.tasks) await db.insert("venture_tasks", { id: newId("vt"), venture_id: v.id, title: t.title, detail: t.detail, phase: t.phase, owner: t.owner, due: addDays(londonDate(), Math.max(1, Math.round(t.due_days))), status: "todo", engine_task_id: null, created_at: nowIso(), updated_at: nowIso() });
  await upsertDoc(v.id, "plan_90", { title: "90-day plan", body: r.summary, basis: "estimate" }, "operations", ctx.task.id);
  return r;
}

async function legalStep(ctx: RunContext, v: Venture, brief: string) {
  const db = getDb();
  const r = await ctx.step("legal", `Legal & IP checklist for ${v.name}`, async () =>
    (await callAgent({ agent: "legal", taskId: ctx.task.id, effort: "low", schema: LegalZ, prompt: `Prepare the legal and compliance checklist for ${v.name} as a UK founder who is also employed at Calm Studios: incorporation (if/when), IP ownership and assignment, employment-contract review (IP, moonlighting, non-compete), trademark checks for the name, data protection (UK GDPR / ICO), consumer and platform terms, and anything sector-specific. Flag items that need a qualified professional. List any likely conflicts with Calm.\n${brief}` })).data,
  );
  await upsertDoc(v.id, "legal", { title: "Legal & compliance checklist", body: `${r.summary}\n\n*Coordination only, not legal advice. Items marked ⚖ need a qualified solicitor or accountant.*`, checklist: r.items.map((x) => ({ item: `${x.professional ? "⚖ " : ""}${x.item}`, status: "todo", note: x.note, due: x.due_days ? addDays(londonDate(), x.due_days) : null })), basis: "estimate" }, "legal", ctx.task.id);
  const cur = (await db.get("ventures", v.id))!;
  await db.update("ventures", v.id, { conflicts: [...new Set([...cur.conflicts, ...r.conflicts])].slice(0, 8), updated_at: nowIso() });
}

const SummaryZ = z.object({ health: z.number().describe("0-100 readiness of the venture, from evidence"), reasons: z.array(z.string()), actions: z.array(z.object({ title: z.string(), why: z.string() })).describe("The three highest-value next actions"), summary: z.string() });

async function cofounderSummary(ctx: RunContext, v: Venture, brief: string) {
  const db = getDb();
  const r = await ctx.step("chief_of_staff", "Cofounder summary", async () => (await callAgent({ agent: "chief_of_staff", taskId: ctx.task.id, effort: "low", schema: SummaryZ, prompt: `As Sean's AI cofounder, summarise where ${v.name} stands after this work: an honest health score from the evidence (a concept with no validation should score low), reasons, and the three highest-value next actions. Challenge distractions.\n${brief}` })).data);
  await db.update("ventures", v.id, { health: { score: Math.max(0, Math.min(100, Math.round(r.health))), reasons: r.reasons }, updated_at: nowIso() });
  await upsertDoc(v.id, "cofounder", { title: "Cofounder summary", body: `${r.summary}\n\n## Three highest-value actions\n${r.actions.map((a, i) => `${i + 1}. **${a.title}**: ${a.why}`).join("\n")}`, data: { actions: r.actions }, basis: "estimate" }, "chief_of_staff", ctx.task.id);
  return r;
}

/* ------------------------------ Workflows ------------------------------ */

registerWorkflow({
  kind: "venture_build",
  title: "Build the business",
  agent: "chief_of_staff",
  async run(ctx) {
    const db = getDb();
    const v0 = await db.get("ventures", String(ctx.task.params.venture_id ?? ""));
    if (!v0) throw new Error("Venture not found.");
    await db.update("ventures", v0.id, { status: "researching", stage: v0.stage === "concept" ? "researching" : v0.stage, updated_at: nowIso() });
    try {
      const raw = String(ctx.task.params.raw_idea ?? "");
      const s = await strategyStep(ctx, v0, raw);
      await ctx.progress(0.2);
      const v1 = (await db.get("ventures", v0.id))!;
      const brief = `${await founderContext(v1)}\n\nStrategy:\n${s.body.slice(0, 6000)}`;
      const fin = await cfoStep(ctx, v1, brief);
      await ctx.progress(0.4);
      const finBrief = `${brief}\n\nModel v${fin.model.version} (forecast): year-1 revenue ${money(fin.base.kpis.revenue_y1, fin.model.currency)}, break-even ${fin.base.kpis.break_even_month ? `month ${fin.base.kpis.break_even_month}` : "not within 36 months"}, funding need ${money(fin.base.kpis.funding_need, fin.model.currency)}, LTV:CAC ${fin.base.kpis.ltv_cac?.toFixed(1) ?? "n/a"}.`;
      await fundraisingStep(ctx, v1, finBrief, { base: fin.base.kpis.funding_need, down: fin.down.kpis.funding_need, up: fin.up.kpis.funding_need, currency: fin.model.currency });
      await ctx.progress(0.55);
      const inv = await investorStep(ctx, v1, finBrief);
      await ctx.progress(0.7);
      await planStep(ctx, v1, finBrief);
      await legalStep(ctx, v1, finBrief);
      await ctx.progress(0.9);
      const sum = await cofounderSummary(ctx, v1, finBrief);
      await db.update("ventures", v0.id, { status: "completed", stage: v1.stage === "researching" ? "validating" : v1.stage, updated_at: nowIso() });
      ctx.deliver({ type: "venture", id: v0.id, title: v0.name });
      return { summary: `${v0.name}: strategy, ${fin.model.currency} model v${fin.model.version} (base funding need ${money(fin.base.kpis.funding_need, fin.model.currency)}), funding plan, readiness checklist, ${inv.added} verified investors, 90-day plan and legal checklist are ready. Health ${sum.health}/100. Next: ${sum.actions[0]?.title ?? "review the plan"}.` };
    } catch (e) {
      await db.update("ventures", v0.id, { status: (e as Error).name === "BlockedError" ? "draft" : "failed", updated_at: nowIso() });
      throw e;
    }
  },
});

registerWorkflow({
  kind: "cfo_model",
  title: "Update financial model",
  agent: "cfo",
  async run(ctx) {
    const v = await getDb().get("ventures", String(ctx.task.params.venture_id ?? ""));
    if (!v) throw new Error("Venture not found.");
    const strat = (await getDb().list("venture_docs", { where: { venture_id: v.id, kind: "strategy" } }))[0];
    const fin = await cfoStep(ctx, v, `${await founderContext(v)}\n${strat ? `Strategy:\n${strat.body.slice(0, 5000)}` : ""}`, ctx.task.instruction === ctx.task.title ? "" : ctx.task.instruction);
    ctx.deliver({ type: "venture", id: v.id, title: v.name });
    return { summary: `Model v${fin.model.version} saved. Base funding need ${money(fin.base.kpis.funding_need, fin.model.currency)}; break-even ${fin.base.kpis.break_even_month ? `month ${fin.base.kpis.break_even_month}` : "not within horizon"} (forecast).` };
  },
});

registerWorkflow({
  kind: "investor_research",
  title: "Investor research",
  agent: "investors",
  async run(ctx) {
    const v = await getDb().get("ventures", String(ctx.task.params.venture_id ?? ""));
    if (!v) throw new Error("Venture not found.");
    const r = await investorStep(ctx, v, await founderContext(v), String(ctx.task.params.focus ?? ""));
    ctx.deliver({ type: "venture", id: v.id, title: v.name });
    return { summary: `${r.added} new investors added to ${v.name}'s pipeline${r.dropped ? `; ${r.dropped} dropped for lack of a verifiable source` : ""}.` };
  },
});

registerWorkflow({
  kind: "fundraising_plan",
  title: "Fundraising plan",
  agent: "fundraising",
  async run(ctx) {
    const db = getDb();
    const v = await db.get("ventures", String(ctx.task.params.venture_id ?? ""));
    if (!v) throw new Error("Venture not found.");
    const m = await getModel(v.id);
    const k = m && m.version > 0 ? { base: runModel(m).kpis.funding_need, down: runModel(m, "downside").kpis.funding_need, up: runModel(m, "upside").kpis.funding_need, currency: m.currency } : { base: 0, down: 0, up: 0, currency: "GBP" as const };
    const r = await fundraisingStep(ctx, v, `${await founderContext(v)}\n${ctx.task.instruction}`, k);
    return { summary: `Recommended route: ${r.route.replace(/_/g, " ")}. Target ${money(r.round.target, r.round.currency)} (estimate).` };
  },
});

const BriefZ = z.object({ headline: z.string(), attention: z.array(z.object({ title: z.string(), venture: z.string().nullable(), why: z.string() })), actions: z.array(z.object({ title: z.string(), venture: z.string().nullable(), why: z.string() })).describe("Exactly three highest-value actions for today"), challenge: z.string().nullable().describe("One distraction to drop, if any") });

function signalsText(s: Awaited<ReturnType<typeof portfolioSignals>>) {
  return s.rows.filter((r) => r.v.stage !== "concept" || r.open || r.model).map((r) => `${r.v.name} [${r.v.stage}, health ${r.v.health?.score ?? "n/a"}]: ${r.open} open tasks${r.overdue.length ? `, ${r.overdue.length} overdue (${r.overdue.slice(0, 3).map((t) => t.title).join("; ")})` : ""}${r.dueSoon.length ? `, due this week: ${r.dueSoon.slice(0, 3).map((t) => t.title).join("; ")}` : ""}${r.stalled ? ", STALLED 14+ days" : ""}${r.model ? `, model v${r.model.version}: funding need ${money(r.model.kpis.funding_need, r.model.currency)} (forecast)${r.model.actualCash !== null ? `, actual cash ${money(r.model.actualCash, r.model.currency)}` : ""}` : ", no model"}${r.readiness !== null ? `, investor readiness ${Math.round(r.readiness * 100)}%` : ""}${r.pipelineCount ? `, ${r.pipelineCount} investors in pipeline` : ""}${r.followUps.length ? `, follow-ups due: ${r.followUps.map((f) => f.investor).join(", ")}` : ""}${r.variance ? `, variance ${r.variance.month}: revenue ${Math.round(r.variance.revenue)}, costs ${Math.round(r.variance.costs)} vs plan` : ""}`).join("\n") + `\nPending approvals: ${s.approvals}. Council decisions awaiting Sean: ${s.decisions}. ${s.rows.filter((r) => r.v.stage === "concept" && !r.open && !r.model).length} other ventures are untouched concepts.`;
}

registerWorkflow({
  kind: "founder_briefing",
  title: "AI Cofounder briefing",
  agent: "chief_of_staff",
  async run(ctx) {
    const s = await portfolioSignals();
    const r = await ctx.step("chief_of_staff", "Preparing your founder briefing", async () => (await callAgent({ agent: "chief_of_staff", taskId: ctx.task.id, effort: "low", schema: BriefZ, prompt: `Write Sean's AI cofounder briefing for ${s.today}: what needs his attention, where his businesses stand, and the three highest-value actions for today. Ground every item in these signals; don't invent progress. Push back on spreading too thin.\n${signalsText(s)}` })).data);
    await upsertDoc("portfolio", "briefing", { title: r.headline, body: "", data: { date: s.today, attention: r.attention, actions: r.actions, challenge: r.challenge }, basis: "estimate" }, "chief_of_staff", ctx.task.id);
    return { summary: `${r.headline} Today: ${r.actions.map((a) => a.title).join("; ")}` };
  },
});

registerWorkflow({
  kind: "venture_review",
  title: "Weekly venture review",
  agent: "chief_of_staff",
  async run(ctx) {
    const s = await portfolioSignals();
    for (const r of s.rows) {
      if (r.stalled) await notify({ title: `${r.v.name} has stalled`, body: "No task movement in 14 days.", href: `/founder/v/${r.v.id}`, importance: 2 });
      for (const f of r.followUps) await notify({ title: `Follow up: ${f.investor}`, body: `${r.v.name}: ${f.p.next_step}`, href: `/founder/v/${r.v.id}?tab=funding`, importance: 2 });
      if (r.variance && Math.abs(r.variance.costs) > 0 && r.variance.costs > 0.2 * Math.max(1, (r.model?.kpis.peak_burn ?? 0))) await notify({ title: `${r.v.name}: costs above plan`, body: `${r.variance.month}: ${Math.round(r.variance.costs)} over the model.`, href: `/founder/v/${r.v.id}?tab=finance`, importance: 2 });
    }
    const r = await ctx.step("chief_of_staff", "Weekly venture review", async () => (await callAgent({ agent: "chief_of_staff", taskId: ctx.task.id, effort: "medium", schema: z.object({ title: z.string(), body: z.string().describe("Markdown: Portfolio at a glance, Stalled or blocked, Money (forecast vs actual), Fundraising, Deadlines, What to stop, Priorities next week") }), prompt: `Weekly venture review for Sean. Be selective and honest; recommend where to focus and what to pause.\n${signalsText(s)}` })).data);
    await upsertDoc("portfolio", "weekly_review", { title: r.title, body: r.body, basis: "estimate" }, "chief_of_staff", ctx.task.id);
    return { summary: r.title };
  },
});

const ScoreZ = z.object({ criteria: z.array(z.object({ key: z.string(), label: z.string(), weight: z.number() })), scores: z.array(z.object({ venture: z.string(), scores: z.array(z.object({ key: z.string(), score: z.number().describe("1-5"), why: z.string() })), evidence: z.enum(["none", "thin", "some", "strong"]) })), recommendation: z.string() });

registerWorkflow({
  kind: "commercial_analysis",
  title: "Portfolio analysis",
  agent: "analyst",
  async run(ctx) {
    const db = getDb();
    const ventures = (await db.list("ventures")).filter((v) => v.stage !== "archived" && !v.merged_into);
    const s = await portfolioSignals();
    const r = await ctx.step("analyst", "Scoring the portfolio", async () => (await callAgent({ agent: "analyst", taskId: ctx.task.id, effort: "medium", schema: ScoreZ, prompt: `Compare Sean's ventures on traction, feasibility, cost to test, market potential, distribution advantage, time required and founder fit. Use these criteria with stated weights (they must sum to 1). Score 1-5 with a one-line reason each, and rate the evidence behind each venture honestly. Recommend where his limited hours should go.\n${ventures.map((v) => `- ${v.name}: ${v.tagline}. Stage ${v.stage}. ${v.thesis.slice(0, 200)}${v.conflicts.length ? " (possible Calm conflict)" : ""}`).join("\n")}\nSignals:\n${signalsText(s)}` })).data);
    const total = r.criteria.reduce((x, c) => x + c.weight, 0) || 1;
    const ranked = r.scores.map((x) => ({ ...x, total: r.criteria.reduce((sum, c) => sum + (c.weight / total) * (x.scores.find((y) => y.key === c.key)?.score ?? 0), 0) })).sort((a, b) => b.total - a.total);
    await upsertDoc("portfolio", "ranking", { title: "Where your time should go", body: r.recommendation, data: { criteria: r.criteria, ranked }, basis: "estimate" }, "analyst", ctx.task.id);
    return { summary: `Top: ${ranked.slice(0, 3).map((x) => `${x.venture} (${x.total.toFixed(1)}/5)`).join(", ")}. ${r.recommendation.slice(0, 200)}` };
  },
});

export { founderContext };
export type { FinModel };
