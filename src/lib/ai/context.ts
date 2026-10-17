import "server-only";
import { getDb } from "@/lib/db";
import { getProfile } from "@/lib/bootstrap";
import { AGENT_BY_KEY, VOICE, type AgentKey } from "./agents";

/**
 * Builds the memory context an agent sees. Scope separation is enforced
 * here: agents only receive memories in scopes they're allowed, so Calm
 * (work) context never reaches personal-brand or public-content agents.
 */
export async function buildContext(agent: AgentKey): Promise<string> {
  const def = AGENT_BY_KEY[agent];
  const db = getDb();
  const profile = await getProfile();
  const memories = (await db.list("memories", { orderBy: { column: "updated_at", ascending: false } })).filter((m) => def.scopes.includes(m.scope));
  const facts = memories.filter((m) => m.kind !== "feedback").slice(0, 80);
  const feedback = memories.filter((m) => m.kind === "feedback").slice(0, 30);
  const lines: string[] = [];
  lines.push(`## About Sean\n${profile.bio}`);
  if (!def.scopes.includes("work")) lines.push("(You work on Sean's personal and public projects. You have no access to Calm Studios confidential material and must not reference internal Calm work.)");
  lines.push(`Professional interests: ${profile.interests.join("; ")}`);
  lines.push(`Personal interests: ${profile.personal_interests.join("; ")}`);
  lines.push(`Ambitions: ${profile.ambitions.join("; ")}`);
  if (["social", "brand", "networking", "bizdev", "speaking", "partnerships"].includes(agent)) lines.push(`\n## Voice\n${VOICE}`);
  if (facts.length) {
    lines.push("\n## Memory (F = stated fact, I = inference; confidence in brackets)");
    for (const m of facts) lines.push(`- [${m.kind === "inference" ? "I" : "F"} ${Math.round(m.confidence * 100)}%] ${m.category}: ${m.content}`);
  }
  if (feedback.length) {
    lines.push("\n## Sean's feedback (follow it)");
    for (const m of feedback) lines.push(`- ${m.content}`);
  }
  if (agent === "social" || agent === "brand") {
    const approved = (await db.list("drafts", { where: { status: ["approved", "scheduled", "published"] }, orderBy: { column: "updated_at", ascending: false }, limit: 4 })).filter((d) => d.body);
    if (approved.length) {
      lines.push("\n## Drafts Sean approved (match this voice)");
      for (const d of approved) lines.push(`---\n[${d.platform}] ${d.body.slice(0, 1200)}`);
    }
    const edited = (await db.list("drafts", { orderBy: { column: "updated_at", ascending: false }, limit: 30 })).filter((d) => d.version > 1 && d.original_body && d.original_body !== d.body).slice(0, 3);
    if (edited.length) {
      lines.push("\n## How Sean edits drafts (learn the pattern)");
      for (const d of edited) lines.push(`BEFORE: ${d.original_body.slice(0, 600)}\nAFTER: ${d.body.slice(0, 600)}`);
    }
  }
  if (agent === "stylist") {
    const s = profile.style;
    lines.push(`\n## Style profile\nSizes: ${s.sizes || "unknown"}. Brands: ${s.brands.join(", ") || "unknown"}. Budget: ${s.budget || "unknown"}. Colours: ${s.colours.join(", ") || "unknown"}. Silhouettes: ${s.silhouettes || "unknown"}. Inspirations: ${s.inspirations || "unknown"}.`);
  }
  if (agent === "speaking") {
    const sp = profile.speaker;
    lines.push(`\n## Verified credentials (use only these)\n${sp.achievements.map((a) => `- ${a}`).join("\n")}\nPast talks: ${sp.past_talks.length ? sp.past_talks.join("; ") : "none recorded. Never claim previous speaking engagements."}`);
  }
  return lines.join("\n");
}
