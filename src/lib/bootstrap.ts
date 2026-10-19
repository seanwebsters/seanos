import "server-only";
import { getDb } from "@/lib/db";
import type { Automation, Memory, Profile, Settings } from "@/lib/db/types";
import { newId, nowIso } from "@/lib/util";
import { nextRunAt } from "@/lib/engine/schedule";

export const DEFAULT_COVERAGE: Record<string, number> = {
  "The World This Morning": 1,
  "AI & Creative Technology": 2,
  "Entertainment & Media": 2,
  "Startups & Business": 1,
  "Design & Culture": 1,
  London: 1,
  "People Worth Knowing": 1,
  "Emerging Trends": 1,
};

function defaultProfile(): Profile {
  return {
    id: "me",
    name: "Sean",
    age: 24,
    location: "Soho, London",
    role: "Creative Technology Director",
    company: "Calm Studios",
    bio: "Creative Technology Director at Calm Studios, working across AI, entertainment, character-driven IP, digital experiences, storytelling, creative technology and emerging media. Works on Calmlings, a character-led entertainment IP with millions of followers and billions of social views. Entrepreneurial; builds his own products, brands and businesses.",
    interests: [
      "AI and autonomous agents", "Creative technology and generative media", "Entertainment, animation and film",
      "IP, licensing and brand partnerships", "Startups and business strategy", "Consumer apps and digital products",
      "Social media, content and personal branding", "Design, fashion and culture", "The future of entertainment and human creativity",
    ],
    personal_interests: ["Fashion", "Fitness", "Travel", "Restaurants", "London experiences", "Meeting interesting people"],
    ambitions: ["Be known as an original thinker at the intersection of creativity, technology and entertainment", "Grow Calmlings", "Build my own products and businesses"],
    writing_voice: "Human, intelligent, curious, creative, conversational and occasionally playful.",
    home_lat: 51.5136,
    home_lng: -0.1365,
    style: { sizes: "", brands: [], budget: "", colours: [], silhouettes: "", inspirations: "" },
    speaker: {
      bio_short: "",
      bio_long: "",
      intro_short: "",
      intro_long: "",
      expertise: ["AI in entertainment", "Creative technology", "Character-led IP", "Digital storytelling", "Startups"],
      topics: [
        { title: "The Future of Entertainment Is Being Rewritten by AI", description: "" },
        { title: "Building Entertainment IP in the Age of Algorithms", description: "" },
        { title: "What Happens When Anyone Can Become a Studio?", description: "" },
        { title: "From Viral Characters to Global Franchises", description: "" },
      ],
      achievements: [
        "Creative Technology Director at Calm Studios",
        "Works on Calmlings, a character-led entertainment IP with millions of followers and billions of social views",
      ],
      past_talks: [],
      headshot_url: null,
    },
    updated_at: nowIso(),
  };
}

function defaultSettings(): Settings {
  return {
    id: "app",
    autopilot: false,
    daily_budget_cents: 500,
    monthly_budget_cents: 6000,
    notify_threshold: 2,
    coverage: DEFAULT_COVERAGE,
    calendar_ics_url: null,
    default_model: "claude-opus-5-5",
    fast_model: "claude-haiku-5-5",
    timezone: "Europe/London",
    onboarded: false,
    autonomy_level: 2,
    halted: false,
    updated_at: nowIso(),
  };
}

type AutoSeed = Pick<Automation, "workflow" | "name" | "description" | "cadence" | "weekday" | "hour" | "minute" | "est_cost_cents">;
export const DEFAULT_AUTOMATIONS: AutoSeed[] = [
  { workflow: "morning", name: "Morning run", description: "The Sean Edition, daily briefing, outfit, Daily Three people and today's opportunities.", cadence: "daily", weekday: null, hour: 5, minute: 30, est_cost_cents: 120 },
  { workflow: "people_weekly", name: "People worth meeting", description: "Ten genuinely interesting people to connect with.", cadence: "weekly", weekday: 1, hour: 4, minute: 50, est_cost_cents: 60 },
  { workflow: "partnerships", name: "Calmlings partnership scan", description: "New brand, licensing and entertainment opportunities for Calmlings.", cadence: "weekly", weekday: 1, hour: 4, minute: 10, est_cost_cents: 90 },
  { workflow: "content_plan", name: "Content plan", description: "A week of drafts in your voice, from what's happening.", cadence: "weekly", weekday: 0, hour: 18, minute: 0, est_cost_cents: 40 },
  { workflow: "intel_briefing", name: "Industry intelligence", description: "A sourced weekly briefing on AI, entertainment and creative technology.", cadence: "weekly", weekday: 6, hour: 8, minute: 0, est_cost_cents: 50 },
  { workflow: "london", name: "London this week", description: "Openings, exhibitions, restaurants and events worth your time.", cadence: "weekly", weekday: 4, hour: 7, minute: 0, est_cost_cents: 30 },
  { workflow: "trend_scan", name: "Trend radar", description: "Weak signals that could matter in 6–24 months.", cadence: "weekly", weekday: 2, hour: 4, minute: 20, est_cost_cents: 70 },
  { workflow: "venture_ideas", name: "Venture ideas", description: "5–10 original business ideas built from this week's trends.", cadence: "weekly", weekday: 3, hour: 4, minute: 20, est_cost_cents: 60 },
  { workflow: "speaking_scan", name: "Speaking scout", description: "Conferences, podcasts and panels with open routes in.", cadence: "weekly", weekday: 2, hour: 5, minute: 0, est_cost_cents: 60 },
  { workflow: "opportunity_engine", name: "Opportunity engine", description: "Connects trends, ideas, people, events and partnerships into actionable opportunities.", cadence: "weekly", weekday: 4, hour: 5, minute: 0, est_cost_cents: 40 },
  { workflow: "opportunity_report", name: "Friday opportunity report", description: "The strongest discoveries of the week.", cadence: "weekly", weekday: 5, hour: 6, minute: 30, est_cost_cents: 30 },
  { workflow: "finance_review", name: "Money check-in", description: "Spending vs budget, upcoming bills, subscriptions and progress on savings goals.", cadence: "weekly", weekday: 0, hour: 9, minute: 30, est_cost_cents: 15 },
  { workflow: "strategy_review", name: "Strategic review", description: "Progress, blockers, new information, what to stop, and the single highest-leverage action for each active ambition.", cadence: "weekly", weekday: 1, hour: 6, minute: 30, est_cost_cents: 25 },
  { workflow: "graph_extract", name: "World model update", description: "Reads new stories, reports, people and notes into your knowledge graph.", cadence: "daily", weekday: null, hour: 3, minute: 40, est_cost_cents: 5 },
  { workflow: "missing", name: "What am I missing?", description: "A weekly scan of your world for blind spots, risks and overlooked opportunities.", cadence: "weekly", weekday: 3, hour: 6, minute: 45, est_cost_cents: 20 },
  { workflow: "founder_briefing", name: "AI Cofounder briefing", description: "What needs your attention across your ventures, and the three highest-value actions for today.", cadence: "daily", weekday: null, hour: 6, minute: 10, est_cost_cents: 8 },
  { workflow: "venture_review", name: "Weekly venture review", description: "Stalled projects, budget variance, investor follow-ups, deadlines and new opportunities across your ventures.", cadence: "weekly", weekday: 1, hour: 7, minute: 0, est_cost_cents: 20 },
  { workflow: "growth_review", name: "Growth results", description: "Scores running growth experiments against your real numbers, closes finished ones, and proposes what to try next.", cadence: "weekly", weekday: 5, hour: 8, minute: 10, est_cost_cents: 15 },
  { workflow: "weekly_review", name: "Weekly review", description: "Projects, goals and what to focus on next week.", cadence: "weekly", weekday: 0, hour: 17, minute: 0, est_cost_cents: 20 },
];

function seedMemories(): Memory[] {
  const at = nowIso();
  const m = (category: string, content: string, kind: Memory["kind"], scope: Memory["scope"]): Memory => ({
    id: newId("mem"), category, content, kind, scope, source: "user", provenance: "Initial brief from Sean", confidence: 1, pinned: true, created_at: at, updated_at: at,
  });
  return [
    m("Identity", "Sean, 24, lives in Soho, London.", "fact", "personal"),
    m("Work", "Creative Technology Director at Calm Studios, across AI, entertainment, character-driven IP, digital experiences and emerging media.", "fact", "work"),
    m("Work", "Works on Calmlings, a character-led entertainment IP with millions of followers and billions of social views.", "fact", "work"),
    m("Ambition", "Wants to be known as an original thinker at the intersection of creativity, technology and entertainment.", "goal", "personal"),
    m("Ambition", "Entrepreneurial; wants to build his own products, brands and businesses.", "goal", "personal"),
    m("Writing", "Writing should sound human, intelligent, curious, creative, conversational and occasionally playful. Never generic motivational content or corporate tone.", "preference", "personal"),
    m("Networking", "Prefers casual, friendly messages over corporate networking. Prioritise genuine compatibility over status.", "preference", "personal"),
    m("Lifestyle", "Interested in fashion, fitness, travel, restaurants, London experiences and meeting interesting people.", "fact", "personal"),
    m("Style", "Prefers buying fewer, better things over constant consumption.", "preference", "personal"),
    m("Privacy", "Keep Calm Studios confidential information separate from personal projects and public content.", "decision", "work"),
  ];
}

let booted: Promise<void> | null = null;

/** Creates the profile, settings, automations and starter memories once. */
export function ensureBootstrapped(): Promise<void> {
  booted ??= (async () => {
    const db = getDb();
    if (!(await db.get("profile", "me"))) await db.insert("profile", defaultProfile());
    if (!(await db.get("settings", "app"))) await db.insert("settings", defaultSettings());
    if ((await db.count("memories")) === 0) for (const mem of seedMemories()) await db.insert("memories", mem);
    const st = (await db.get("settings", "app"))!;
    if (!st.founder_seeded) {
      const { seedVentures } = await import("@/lib/founder/seed");
      await seedVentures();
      await db.update("settings", "app", { founder_seeded: true });
    }
    const existing = await db.list("automations");
    for (const a of DEFAULT_AUTOMATIONS) {
      if (existing.some((e) => e.workflow === a.workflow)) continue;
      const row: Automation = { id: newId("auto"), ...a, params: {}, enabled: true, last_run_at: null, next_run_at: null, last_task_id: null, created_at: nowIso() };
      row.next_run_at = nextRunAt(row).toISOString();
      await db.insert("automations", row);
    }
  })().catch((e) => {
    booted = null;
    throw e;
  });
  return booted;
}

export async function getSettings(): Promise<Settings> {
  await ensureBootstrapped();
  const s = (await getDb().get("settings", "app")) as Settings;
  // Settings saved before SEAN ∞ lack these fields.
  return { ...s, autonomy_level: s.autonomy_level ?? 2, halted: s.halted ?? false };
}

export async function getProfile(): Promise<Profile> {
  await ensureBootstrapped();
  return (await getDb().get("profile", "me")) as Profile;
}

/** Test hook. */
export function resetBootstrap() {
  booted = null;
}
