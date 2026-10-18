/** A fake Founder OS team for tests and visual fixtures: each agent answers its own step. */
import { src } from "./helpers";

export const VERGE = "https://www.theverge.com/ai/1";
export const FT = "https://www.ft.com/content/abc";

export function team(agent: string, text: string): unknown {
  switch (agent) {
    case "strategist":
      return {
        concept: "An AI-native studio that develops, tests and publishes original animated IP.", thesis: "Audience-tested IP can be built for a fraction of studio cost.", customer: "Families with kids 4-9 on YouTube and streaming",
        market_summary: "Kids' animation is consolidating around digital-first IP.",
        market_claims: [{ claim: "Kids' YouTube viewing is growing", basis: "verified", source_url: VERGE }, { claim: "Market worth £9bn", basis: "verified", source_url: "https://made-up.example/report" }],
        competitors: [{ name: "Moonbug", url: "https://moonbug.example", note: "Acquired IP roll-up" }], differentiation: "Audience-in-the-loop development", business_model: "Ad revenue then licensing", pricing: "Free with ads",
        gtm: "YouTube shorts", validation: [{ experiment: "Publish 6 shorts", metric: "Retention", success: ">40% at 30s", cost: "£300", days: 21 }], mvp: [{ milestone: "Pilot episode", weeks: 8 }],
        risks: [{ risk: "Platform dependence", kind: "market", mitigation: "Diversify" }], body: "## Strategy\nWebster builds IP.", sources: [src(VERGE), src("https://made-up.example/report")],
      };
    case "cfo":
      return {
        currency: "GBP", months: 36, streams: ["advertising", "licensing"],
        drivers: [
          { key: "launch_month", value: 3, basis: "estimate", note: "After pilot", source_url: null },
          { key: "free_users_start", value: 2000, basis: "estimate", note: "Seeded from shorts", source_url: null },
          { key: "free_users_growth", value: 12, basis: "estimate", note: "", source_url: null },
          { key: "impressions_per_user", value: 30, basis: "estimate", note: "", source_url: null },
          { key: "cpm", value: 2.5, basis: "verified", note: "Kids CPM benchmark", source_url: FT },
          { key: "licensing_deals_per_quarter", value: 0.3, basis: "verified", note: "Fake source", source_url: "https://nope.example/cpm" },
          { key: "licensing_deal_value", value: 15000, basis: "estimate", note: "", source_url: null },
          { key: "infra_fixed", value: 400, basis: "estimate", note: "AI generation + hosting", source_url: null },
        ],
        opex: [{ name: "Animation freelancers", monthly: 2500, start_month: 1, growth_pct: 2 }], team: [], startup_costs: [{ item: "Pilot production", amount: 8000 }],
        upside: [{ key: "free_users_growth", value: 18 }], downside: [{ key: "free_users_growth", value: 6 }], rationale: "CPM and growth matter most.", sources: [src(FT)],
      };
    case "fundraising":
      return {
        route: "angels", why: "Pre-revenue creative IP suits angels with SEIS.", alternatives: [{ route: "grants", verdict: "UK Global Screen Fund worth checking" }],
        round: { instrument: "SEIS-eligible equity", target: 150000, currency: "GBP", valuation_low: 600000, valuation_high: 900000, valuation_rationale: "Pre-seed UK norms (estimate)", use_of_funds: [{ item: "Production", pct: 70 }, { item: "Distribution", pct: 30 }], milestones: ["3 pilots published", "100k subscribers"] },
        readiness: [{ item: "Pitch deck", status: "todo", note: "" }, { item: "Financial model", status: "done", note: "Built by CFO" }, { item: "Incorporated company", status: "todo", note: "" }],
        data_room: ["Cap table", "IP assignment"], roadmap: [{ phase: "Prove", weeks: 12, goals: ["Pilots"] }], faq: [{ q: "Why now?", a: "AI costs." }],
        memo: "## Memo\nForecast only.", deck: [{ title: "Webster", bullets: ["AI-native studio"], notes: "" }],
      };
    case "investors":
      return {
        investors: [
          { name: "Real Angel Fund", kind: "angel", firm: "Real Angels", geography: ["UK"], stages: ["pre-seed"], sectors: ["media"], cheque_min: 25000, cheque_max: 100000, cheque_currency: "GBP", cheque_stated: true, thesis: "Creator economy", notable: [{ name: "X", url: null }], website: "https://www.ft.com", apply_url: FT, fit_score: 8, fit_reasons: ["Backs kids media"], sources: [src(FT)] },
          { name: "Invented Ventures", kind: "vc", firm: "Invented", geography: ["US"], stages: ["seed"], sectors: ["ai"], cheque_min: 1e6, cheque_max: 2e6, cheque_currency: "USD", cheque_stated: true, thesis: "AI", notable: [], website: "https://invented.example", apply_url: "https://invented.example/apply", fit_score: 9, fit_reasons: ["?"], sources: [src("https://invented.example/about")] },
        ],
      };
    case "operations":
      return { tasks: [{ title: "Publish 6 test shorts", detail: "", phase: "30", owner: "sean", due_days: 21 }, { title: "Draft IP assignment", detail: "", phase: "60", owner: "legal", due_days: 45 }, { title: "Prepare angel list", detail: "", phase: "90", owner: "fundraising", due_days: 80 }], summary: "Validate, build, raise." };
    case "legal":
      return { items: [{ item: "Review Calm employment contract IP clause", note: "", due_days: 7, professional: true }, { item: "Trademark search for Webster", note: "", due_days: 14, professional: false }], conflicts: ["Animated IP is adjacent to Calmlings"], summary: "Resolve IP ownership first." };
    case "chief_of_staff":
      if (text.includes("AI cofounder briefing"))
        return { headline: "Webster is ready to validate; everything else can wait.", attention: [{ title: "Check the Calm IP clause before publishing Webster shorts", venture: "Webster", why: "Blocking" }], actions: [{ title: "Publish the first two Webster test shorts", venture: "Webster", why: "Cheapest real signal" }, { title: "Review Webster's financial model", venture: "Webster", why: "CPM drives everything" }, { title: "Shortlist three angels", venture: "Webster", why: "Readiness" }], challenge: "Park SUMUP until Webster has data." };
      if (text.includes("Answer his latest message"))
        return { reply: "Done. I've lowered CPM and queued investor research.", actions: [
          { type: "update_driver", venture: "Webster", title: "", detail: "Sean's more cautious view", workflow: null, phase: null, driver_key: "cpm", driver_value: 1.8, stage: null },
          { type: "create_venture_task", venture: "Webster", title: "Call two kids' media producers", detail: "", workflow: null, phase: "30", driver_key: null, driver_value: null, stage: null },
          { type: "update_driver", venture: "Webster", title: "", detail: "", workflow: null, phase: null, driver_key: "not_a_driver", driver_value: 1, stage: null },
        ] };
      return { health: 28, reasons: ["No validation yet"], actions: [{ title: "Publish test shorts", why: "Cheapest signal" }, { title: "Check Calm IP clause", why: "Blocking" }, { title: "Trademark search", why: "Name risk" }], summary: "Promising, unproven." };
    default:
      return { title: "t", summary: "s", body: "b", slides: [], image_prompts: [], sources: [] };
  }
}

