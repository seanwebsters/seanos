import "server-only";
import { getDb } from "@/lib/db";
import type { Venture } from "@/lib/db/types";
import { newId, nowIso } from "@/lib/util";

const CALM_SLEEP = "Overlaps with Calm's core category (sleep and relaxation audio). Check your employment contract's IP, non-compete and moonlighting clauses before building, and get it reviewed by an employment lawyer.";
const CALM_AUDIO = "Adjacent to Calm's wellbeing-audio space. Confirm with your employment contract and a lawyer that it doesn't compete with or use Calm IP or resources.";
const CALM_IP = "Character-led IP and AI content overlap with your Calm role. Keep it strictly separate (own time, own equipment, no Calm materials) and confirm the IP clauses with a lawyer.";

/** Sean's proposed ventures, as he listed them. Concepts, not companies. */
const SEEDS: [string, string, string, string[]][] = [
  ["Webster", "An autonomous entertainment company", "Entertainment / AI", [CALM_IP]],
  ["SleepStories", "Sleep entertainment platform, including Goodnight, Internet", "Audio / Sleep", [CALM_SLEEP]],
  ["VoysNote", "Motivational and inspirational audio platform", "Audio / Wellbeing", [CALM_AUDIO]],
  ["Moonwilders", "Original fantasy IP", "IP / Entertainment", []],
  ["BandApp", "Artist fan-engagement platform", "Music / Consumer app", []],
  ["CareerU", "Gamified career development", "Edtech / Consumer app", []],
  ["Grounded", "Real-world objects becoming collectible characters", "IP / Collectibles", []],
  ["Pick a Human", "Global voting and community concept", "Community / Consumer app", []],
  ["Educational audio platform", "Learning through audio", "Audio / Education", [CALM_AUDIO]],
  ["Digital trading card universe", "A collectible digital card world", "Gaming / Collectibles", []],
  ["Comics and webtoon platform", "Original comics and webtoons", "Publishing / IP", []],
  ["SUMUP", "Functional drinks", "Food & drink / CPG", ["Name may clash with SumUp (payments) trademarks; check before investing in branding."]],
  ["3PM", "Snack brand", "Food & drink / CPG", []],
  ["Automated clothing brand", "AI-driven fashion label", "Fashion / DTC", []],
  ["AI IP creation platform", "Tools for creating original IP with AI", "AI / Creator tools", [CALM_IP]],
  ["Webster Robots", "Physical entertainment and robotics concepts", "Hardware / Entertainment", []],
];

export async function seedVentures() {
  const db = getDb();
  if ((await db.count("ventures")) > 0) return;
  let priority = SEEDS.length;
  for (const [name, tagline, category, conflicts] of SEEDS) {
    const v: Venture = {
      id: newId("ven"), name, tagline, category, stage: "concept", status: "draft", thesis: "", customer: "", market: "", competition: "", business_model: "", validation: "", product: "", roadmap: "",
      ownership: "unclear", ip_notes: "Ownership not yet confirmed. Record who owns the IP and whether anything was created using Calm time or resources.", licensing: "", confidentiality: "personal",
      conflicts, incorporated: false, priority: priority--, health: null, idea_id: null, merged_into: null, tags: [], is_demo: false, created_at: nowIso(), updated_at: nowIso(),
    };
    await db.insert("ventures", v);
  }
}
