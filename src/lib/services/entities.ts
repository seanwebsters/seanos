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
  settings: { patch: ["autopilot", "daily_budget_cents", "monthly_budget_cents", "notify_threshold", "coverage", "calendar_ics_url", "default_model", "fast_model", "onboarded"], touch: "updated_at" },
  profile: { patch: ["name", "location", "role", "company", "bio", "interests", "personal_interests", "ambitions", "writing_voice", "style", "speaker", "home_lat", "home_lng"], touch: "updated_at" },
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
    create: (i) => ({ id: newId("evt"), title: str(i.title, "Untitled"), start: str(i.start) || nowIso(), end: str(i.end) || null, all_day: Boolean(i.all_day), location: str(i.location), description: str(i.description), source: "manual", external_id: null, prep_report_id: null }),
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
