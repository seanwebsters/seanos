import "server-only";
import type { TableName } from "@/lib/db/types";
import { newId, nowIso } from "@/lib/util";
import { londonDate } from "@/lib/time";
import { categorise } from "@/lib/finance";

type Spec = { patch: string[]; create?: (input: Record<string, unknown>) => Record<string, unknown>; remove?: boolean; touch?: string };

const str = (v: unknown, d = "") => (typeof v === "string" ? v.slice(0, 20000) : d);
const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 50) : []);

/** Which tables and fields the client may change. Everything else is server-only. */
export const ENTITIES: Partial<Record<TableName, Spec>> = {
  settings: { patch: ["autopilot", "daily_budget_cents", "monthly_budget_cents", "notify_threshold", "coverage", "calendar_ics_url", "default_model", "fast_model", "onboarded", "pa_notifications"], touch: "updated_at" },
  profile: { patch: ["name", "birthday", "location", "role", "company", "bio", "interests", "personal_interests", "ambitions", "writing_voice", "style", "speaker", "home_lat", "home_lng"], touch: "updated_at" },
  memories: {
    patch: ["category", "content", "kind", "scope", "confidence", "pinned"], remove: true, touch: "updated_at",
    create: (i) => ({ id: newId("mem"), category: str(i.category, "General"), content: str(i.content), kind: str(i.kind, "fact"), scope: ["personal", "work", "public"].includes(str(i.scope)) ? i.scope : "personal", source: "user", provenance: "Added by Sean", confidence: 1, pinned: false, created_at: nowIso(), updated_at: nowIso() }),
  },
  agent_overrides: { patch: ["instructions", "model", "enabled"], touch: "updated_at" },
  automations: { patch: ["enabled", "hour", "minute", "weekday", "cadence"], remove: true },
  stories: { patch: ["saved"] },
  drafts: { patch: ["title", "hook", "body", "slides", "notes", "status", "scheduled_for", "platform"], remove: true, touch: "updated_at" },
  people: {
    patch: ["status", "notes", "remind_at", "message", "interests", "last_contact_at", "name", "role", "company", "location", "category"], remove: true,
    create: (i) => ({ id: newId("per"), name: str(i.name), photo_url: null, role: str(i.role), company: str(i.company), location: str(i.location), category: str(i.category, "Met"), profiles: [], achievements: [], why_get_along: "", why_valuable: "", conversation_starter: "", message: "", sources: [], status: "met", origin: "manual", notes: str(i.notes), interests: arr(i.interests), remind_at: null, daily_pick_date: null, last_contact_at: nowIso(), dedupe_key: `${str(i.name).toLowerCase()}|${str(i.company).toLowerCase()}`, discovered_at: nowIso(), verified_at: null }),
  },
  interactions: { patch: ["summary"], remove: true, create: (i) => ({ id: newId("int"), person_id: str(i.person_id), kind: str(i.kind, "note"), summary: str(i.summary), at: str(i.at) || nowIso() }) },
  partnerships: { patch: ["status"], remove: true, touch: "updated_at" },
  ideas: {
    patch: ["title", "one_liner", "notes", "status", "verdict", "tags"], remove: true, touch: "updated_at",
    create: (i) => ({ id: newId("idea"), title: str(i.title, "Untitled idea"), one_liner: str(i.one_liner), insight: "", product: "", audience: "", business_model: "", competition: [], advantage: "", evidence: "", launch: "", verdict: null, costs: "", monetisation: [], challenges: [], scale: "", assumptions: [], scores: null, origin: "user", trend_ids: [], links: [], tags: arr(i.tags), notes: str(i.notes), status: "captured", sources: [], images: [], dedupe_key: str(i.title).toLowerCase(), task_id: null, created_at: nowIso(), updated_at: nowIso() }),
  },
  reports: { patch: ["title"], remove: true },
  trends: { patch: ["status"] },
  speaking: { patch: ["status", "follow_up_at", "applied_at"] },
  opportunities: { patch: ["status", "actions"] },
  outreach: { patch: ["subject", "body", "status", "follow_up_at", "reply_note", "sent_at", "to"], touch: "updated_at" },
  wardrobe: { patch: ["name", "category", "colours", "brand", "material", "formality", "notes", "favourite", "worn_count", "last_worn"], remove: true },
  outfits: { patch: ["status"] },
  events: {
    patch: ["title", "start", "end", "location", "description"], remove: true,
    create: (i) => ({ id: newId("evt"), title: str(i.title, "Untitled"), start: str(i.start) || nowIso(), end: str(i.end) || null, all_day: Boolean(i.all_day), location: str(i.location), description: str(i.description), source: "manual", external_id: null, prep_report_id: null, created_by: "sean" }),
  },
  experiences: { patch: ["status"] },
  life: {
    patch: ["title", "amount", "target", "progress", "notes", "done", "date"], remove: true,
    create: (i) => ({ id: newId("life"), kind: str(i.kind, "workout"), title: str(i.title), amount: typeof i.amount === "number" ? i.amount : null, target: typeof i.target === "number" ? i.target : null, progress: typeof i.progress === "number" ? i.progress : null, date: str(i.date) || londonDate(), notes: str(i.notes), done: false, created_at: nowIso() }),
  },
  notifications: { patch: ["read"], remove: true },
  ambitions: { patch: ["statement", "horizon", "why", "status"], touch: "updated_at" },
  strategy_items: { patch: ["title", "description", "due", "instruction", "owner_agent"], remove: true, touch: "updated_at" },
  insights: { patch: ["status"] },
  ventures: {
    patch: ["name", "tagline", "category", "stage", "thesis", "customer", "market", "competition", "business_model", "validation", "product", "roadmap", "ownership", "ip_notes", "licensing", "confidentiality", "incorporated", "priority", "tags"], touch: "updated_at",
    create: (i) => ({ id: newId("ven"), name: str(i.name, "New venture"), tagline: str(i.tagline), category: str(i.category), stage: "concept", status: "draft", thesis: "", customer: "", market: "", competition: "", business_model: "", validation: "", product: "", roadmap: "", ownership: "unclear", ip_notes: "", licensing: "", confidentiality: "personal", conflicts: [], incorporated: false, priority: 20, health: null, idea_id: null, merged_into: null, tags: [], is_demo: false, created_at: nowIso(), updated_at: nowIso() }),
  },
  venture_docs: { patch: ["title", "body", "checklist", "status"], remove: true, touch: "updated_at" },
  venture_tasks: {
    patch: ["title", "detail", "phase", "owner", "due", "status"], remove: true, touch: "updated_at",
    create: (i) => ({ id: newId("vt"), venture_id: str(i.venture_id), title: str(i.title, "Task"), detail: str(i.detail), phase: ["30", "60", "90", "later"].includes(str(i.phase)) ? i.phase : "30", owner: str(i.owner, "sean"), due: str(i.due) || null, status: "todo", engine_task_id: null, created_at: nowIso(), updated_at: nowIso() }),
  },
  investor_pipeline: { patch: ["next_step", "follow_up_at", "notes"], touch: "updated_at" },
  life_hq: { patch: ["vision", "quote", "salary", "salary_target", "savings", "savings_target", "revenue_target", "areas", "images", "routine"], touch: "updated_at" },
  hq_items: {
    patch: ["title", "value", "date", "done", "position"], remove: true, touch: "updated_at",
    create: (i) => ({ id: newId("hq"), section: ["health", "home", "friends", "travel", "reputation", "tasks", "vision"].includes(str(i.section)) ? i.section : "tasks", title: str(i.title, "Untitled").slice(0, 200), value: str(i.value).slice(0, 80), date: str(i.date) || null, done: false, position: Date.now(), created_at: nowIso(), updated_at: nowIso() }),
  },
  week_priorities: {
    patch: ["title", "tag", "done", "rank"], remove: true,
    create: (i) => ({ id: newId("pri"), week: str(i.week), rank: typeof i.rank === "number" ? i.rank : 1, title: str(i.title, "Priority").slice(0, 160), tag: ["Work", "Personal", "Business"].includes(str(i.tag)) ? i.tag : "Personal", done: false, created_at: nowIso() }),
  },
  work_projects: {
    patch: ["name", "status", "progress", "next_action", "notes", "image"], remove: true, touch: "updated_at",
    create: (i) => ({ id: newId("wp"), name: str(i.name, "New project").slice(0, 120), status: "Not set", progress: null, next_action: "", image: null, notes: str(i.notes), created_at: nowIso(), updated_at: nowIso() }),
  },
  wins: {
    patch: ["title", "date", "area"], remove: true,
    create: (i) => ({ id: newId("win"), date: str(i.date) || londonDate(), title: str(i.title, "A win").slice(0, 200), area: str(i.area, "Life"), created_at: nowIso() }),
  },
  journal: {
    patch: ["answers", "mood"], touch: "updated_at",
    create: (i) => ({ id: newId("jr"), date: str(i.date) || londonDate(), mood: typeof i.mood === "number" ? i.mood : null, answers: typeof i.answers === "object" && i.answers ? i.answers : {}, created_at: nowIso(), updated_at: nowIso() }),
  },
  transactions: {
    patch: ["date", "description", "amount", "category", "notes", "account_id"], remove: true,
    create: (i) => {
      const amount = typeof i.amount === "number" ? i.amount : Number(i.amount);
      const out = i.direction === "in" ? Math.abs(amount) : -Math.abs(amount);
      return { id: newId("txn"), date: str(i.date) || londonDate(), description: str(i.description, "Untitled"), amount: Number.isFinite(out) ? Math.round(out * 100) / 100 : 0, category: str(i.category) || categorise(str(i.description), out), account_id: str(i.account_id) || null, source: "manual", import_hash: null, notes: str(i.notes), created_at: nowIso() };
    },
  },
  accounts: {
    patch: ["name", "kind", "balance", "currency"], remove: true, touch: "updated_at",
    create: (i) => ({ id: newId("acc"), name: str(i.name, "Account"), kind: str(i.kind, "current"), balance: Number(i.balance) || 0, currency: str(i.currency, "GBP"), updated_at: nowIso() }),
  },
  budgets: { patch: ["monthly_limit"], remove: true, touch: "updated_at", create: (i) => ({ id: str(i.category, "Other"), monthly_limit: Math.max(0, Number(i.monthly_limit) || 0), updated_at: nowIso() }) },
  recurring: {
    patch: ["name", "amount", "kind", "cadence", "next_date", "category", "active"], remove: true,
    create: (i) => ({ id: newId("rec"), name: str(i.name, "Bill"), amount: Math.abs(Number(i.amount) || 0), kind: ["bill", "subscription", "income"].includes(str(i.kind)) ? i.kind : "bill", cadence: ["weekly", "monthly", "yearly"].includes(str(i.cadence)) ? i.cadence : "monthly", next_date: str(i.next_date) || londonDate(), category: str(i.category) || (i.kind === "subscription" ? "Subscriptions" : i.kind === "income" ? "Income" : "Rent & bills"), active: true, created_at: nowIso() }),
  },
  finance_goals: {
    patch: ["name", "target", "saved", "deadline"], remove: true,
    create: (i) => ({ id: newId("fg"), name: str(i.name, "Goal"), target: Math.max(0, Number(i.target) || 0), saved: Math.max(0, Number(i.saved) || 0), deadline: str(i.deadline) || null, created_at: nowIso() }),
  },
};

export function pick(input: Record<string, unknown>, fields: string[]) {
  return Object.fromEntries(Object.entries(input).filter(([k]) => fields.includes(k)));
}
