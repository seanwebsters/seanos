import "server-only";
import { getDb } from "@/lib/db";
import type { NodeType, Provenance, Scope } from "@/lib/db/types";
import { getProfile } from "@/lib/bootstrap";
import { dedupeKey, nowIso } from "@/lib/util";
import { GraphIndex, detectFunctionalConflicts, upsertEdge, upsertNode } from "./store";

export const SELF_ID = "n_self";
export const CALMLINGS_ID = "n_project_calmlings";

const rec = (type: string, id: string): Provenance => ({ kind: "record", ref: `${type}:${id}`, url: null, quote: null, at: nowIso() });
const user = (ref: string): Provenance => ({ kind: "user", ref, url: null, quote: null, at: nowIso() });

/**
 * Mirrors SEAN OS records into the world model. Deterministic, free (no
 * model calls) and idempotent: re-running only refreshes what changed.
 */
export async function projectRecords(): Promise<{ nodes: number; edges: number }> {
  const db = getDb();
  const idx = await GraphIndex.load();
  const touched = new Set<string>();
  let edges = 0;
  const node = async (id: string, type: NodeType, name: string, source: Provenance, extra: { summary?: string; attributes?: Record<string, string>; scope?: Scope; record?: { type: string; id: string; title: string }; aliases?: string[]; confidence?: number } = {}) => {
    if (!name.trim()) return null;
    const { node } = await upsertNode(idx, { id, type, name, source, summary: extra.summary, attributes: extra.attributes, scope: extra.scope, record_ref: extra.record ?? null, aliases: extra.aliases, confidence: extra.confidence });
    touched.add(node.id);
    return node;
  };
  const org = async (name: string, source: Provenance, scope: Scope = "public") => (name.trim() ? node(`n_org_${dedupeKey(name).replace(/[^a-z0-9]+/g, "_").slice(0, 40)}`, "company", name, source, { scope }) : null);
  const link = async (from: string | undefined | null, to: string | undefined | null, type: string, source: Provenance, scope: Scope = "public", confidence?: number) => {
    if (!from || !to) return;
    if (await upsertEdge(idx, { from, to, type, source, scope, confidence })) edges++;
  };

  const p = await getProfile();
  const self = await node(SELF_ID, "self", p.name, user("profile"), { summary: p.bio, scope: "personal", attributes: { role: p.role, location: p.location } });
  const calm = await org(p.company, user("profile"), "public");
  await link(self?.id, calm?.id, "works_at", user("profile"));
  const calmlings = await node(CALMLINGS_ID, "project", "Calmlings", user("profile"), { scope: "work", summary: "Character-led entertainment IP with millions of followers and billions of social views." });
  await link(self?.id, calmlings?.id, "works_on", user("profile"), "work");
  await link(calm?.id, calmlings?.id, "owns", user("profile"));
  for (const [i, a] of p.ambitions.entries()) {
    const g = await node(`n_goal_profile_${i}`, "goal", a, user("profile"), { scope: "personal" });
    await link(self?.id, g?.id, "pursues", user("profile"), "personal");
  }
  for (const s of p.speaker.expertise) {
    const k = await node(`n_skill_${dedupeKey(s).replace(/\W+/g, "_")}`, "skill", s, user("speaker profile"), { scope: "public" });
    await link(self?.id, k?.id, "has_expertise_in", user("speaker profile"));
  }

  for (const m of await db.list("memories", { where: { kind: ["goal", "project", "relationship"] } })) {
    const type: NodeType = m.kind === "goal" ? "goal" : m.kind === "project" ? "project" : "topic";
    if (m.kind === "relationship") continue; // handled by extraction (needs a named person)
    const n = await node(`n_mem_${m.id}`, type, m.content.slice(0, 120), m.source === "user" ? user(`memory:${m.id}`) : rec("memory", m.id), { scope: m.scope, summary: m.content, confidence: m.confidence });
    await link(self?.id, n?.id, m.kind === "goal" ? "pursues" : "works_on", rec("memory", m.id), m.scope);
  }

  for (const a of await db.list("ambitions")) {
    if (a.status === "dropped") continue;
    const g = await node(`n_ambition_${a.id}`, "goal", a.statement, user(`ambition:${a.id}`), { scope: "personal", record: { type: "ambition", id: a.id, title: a.statement }, attributes: { horizon: a.horizon, status: a.status } });
    await link(self?.id, g?.id, "pursues", user(`ambition:${a.id}`), "personal");
  }
  for (const s of await db.list("strategy_items", { where: { level: ["objective", "project"], status: ["approved", "active", "done"] } })) {
    const n = await node(`n_strat_${s.id}`, s.level === "objective" ? "goal" : "project", s.title, user(`strategy:${s.id}`), { scope: "personal", summary: s.description, record: { type: "strategy", id: s.id, title: s.title }, attributes: { status: s.status } });
    await link(n?.id, `n_ambition_${s.ambition_id}`, "advances", user(`strategy:${s.id}`), "personal");
  }

  for (const per of await db.list("people")) {
    if (per.status === "dismissed") continue;
    const src = rec("person", per.id);
    const n = await node(`n_person_${per.id}`, "person", per.name, src, { scope: "personal", summary: [per.why_valuable, ...per.achievements].filter(Boolean).join(" ").slice(0, 600), record: { type: "person", id: per.id, title: per.name }, attributes: { role: per.role, location: per.location, category: per.category, status: per.status } });
    const co = per.company ? await org(per.company, src) : null;
    await link(n?.id, co?.id, "works_at", src);
    if (["contacted", "met", "saved"].includes(per.status)) await link(self?.id, n?.id, per.status === "saved" ? "wants_to_meet" : "knows", src, "personal");
  }

  for (const pt of await db.list("partnerships")) {
    if (pt.status === "passed") continue;
    const src = rec("partnership", pt.id);
    const co = await org(pt.brand, src);
    if (co) {
      await db.update("graph_nodes", co.id, { record_ref: co.record_ref ?? { type: "partnership", id: pt.id, title: pt.brand }, summary: co.summary || pt.what_they_do });
      idx.byId.set(co.id, { ...co, record_ref: co.record_ref ?? { type: "partnership", id: pt.id, title: pt.brand }, summary: co.summary || pt.what_they_do });
    }
    await link(co?.id, CALMLINGS_ID, "potential_partner_of", src, "work");
    for (const c of pt.contacts) {
      const cp = await node(`n_contact_${dedupeKey(c.name).replace(/\W+/g, "_")}`, "person", c.name, { ...src, url: c.source_url }, { scope: "work", attributes: { role: c.role } });
      await link(cp?.id, co?.id, "works_at", { ...src, url: c.source_url }, "public");
    }
  }

  for (const t of await db.list("trends")) {
    if (t.status === "dismissed") continue;
    const src = rec("trend", t.id);
    const n = await node(`n_trend_${t.id}`, "trend", t.title, src, { scope: "public", summary: t.what, record: { type: "trend", id: t.id, title: t.title }, attributes: { maturity: t.maturity, momentum: String(t.momentum), region: t.region } });
    if (t.calm_applications.length) await link(n?.id, CALMLINGS_ID, "relevant_to", src, "work", 0.6);
  }

  for (const i of await db.list("ideas")) {
    if (i.status === "archived") continue;
    const src = rec("idea", i.id);
    const n = await node(`n_idea_${i.id}`, "idea", i.title, src, { scope: "personal", summary: i.one_liner, record: { type: "idea", id: i.id, title: i.title }, attributes: { verdict: i.verdict ?? "", status: i.status } });
    if (i.origin === "user") await link(self?.id, n?.id, "conceived", src, "personal");
    for (const tid of i.trend_ids) await link(n?.id, `n_trend_${tid}`, "builds_on", src);
    for (const l of i.links) await link(n?.id, `n_idea_${l}`, "overlaps_with", src, "personal");
    for (const c of i.competition) {
      const co = await org(c.name, c.url ? { ...src, url: c.url } : src);
      await link(co?.id, n?.id, "competes_with", src, "personal", 0.7);
    }
  }

  for (const s of await db.list("speaking")) {
    if (s.status === "dismissed") continue;
    const src = rec("speaking", s.id);
    const ev = await node(`n_event_${s.id}`, "event", s.name, src, { scope: "public", summary: `${s.kind} · ${s.location}. ${s.audience}`, record: { type: "speaking", id: s.id, title: s.name }, attributes: { kind: s.kind, location: s.location, start_date: s.start_date ?? "", cfp_status: s.cfp_status, deadline: s.deadline ?? "" } });
    const o = s.organiser ? await org(s.organiser, src) : null;
    await link(o?.id, ev?.id, "organises", src);
    await link(ev?.id, self?.id, "speaking_opportunity_for", src, "personal", 0.7);
    if (["applied", "accepted"].includes(s.status)) await link(self?.id, ev?.id, s.status === "accepted" ? "speaks_at" : "applied_to_speak_at", src, "personal");
  }

  for (const g of await db.list("finance_goals")) {
    const n = await node(`n_fgoal_${g.id}`, "goal", g.name, user(`finance_goal:${g.id}`), { scope: "personal", attributes: { target: String(g.target), saved: String(g.saved) } });
    await link(self?.id, n?.id, "pursues", user(`finance_goal:${g.id}`), "personal");
  }
  for (const g of await db.list("life", { where: { kind: "learning_goal" } })) {
    const n = await node(`n_skillgoal_${g.id}`, "skill", g.title, user(`life:${g.id}`), { scope: "personal" });
    await link(self?.id, n?.id, g.done ? "has_expertise_in" : "is_learning", user(`life:${g.id}`), "personal");
  }

  // Records that no longer exist leave hidden nodes behind (kept for provenance, out of views).
  const exists = async (type: string, id: string) => {
    const table = ({ person: "people", partnership: "partnerships", trend: "trends", idea: "ideas", speaking: "speaking", ambition: "ambitions", strategy: "strategy_items" } as const)[type as "person"];
    return table ? Boolean(await db.get(table, id)) : true;
  };
  for (const n of idx.byId.values()) {
    if (n.status === "active" && n.record_ref && !touched.has(n.id) && !(await exists(n.record_ref.type, n.record_ref.id))) await db.update("graph_nodes", n.id, { status: "hidden" });
  }
  await detectFunctionalConflicts(idx, touched);
  return { nodes: touched.size, edges };
}
