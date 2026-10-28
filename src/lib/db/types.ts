/**
 * The SEAN OS data model. Every table has a string `id` primary key.
 * The same shapes back the local JSON store and Supabase/PostgreSQL
 * (see supabase/migrations/0001_init.sql).
 */

export type Scope = "personal" | "work" | "public";
export type Source = { title: string; url: string; publisher?: string | null; date?: string | null };
export type Ref = { type: string; id: string; title: string };
export type Contact = { name: string; role: string; url: string; email?: string | null; source_url: string };

export interface Profile {
  id: "me";
  name: string;
  age: number | null;
  /** YYYY-MM-DD; when set, age is worked out from it. */
  birthday?: string | null;
  location: string;
  role: string;
  company: string;
  bio: string;
  interests: string[];
  personal_interests: string[];
  ambitions: string[];
  writing_voice: string;
  home_lat: number;
  home_lng: number;
  style: { sizes: string; brands: string[]; budget: string; colours: string[]; silhouettes: string; inspirations: string };
  speaker: SpeakerProfile;
  updated_at: string;
}

export interface SpeakerProfile {
  bio_short: string;
  bio_long: string;
  intro_short: string;
  intro_long: string;
  expertise: string[];
  topics: { title: string; description: string }[];
  /** Only achievements Sean has confirmed. Agents never add to this list. */
  achievements: string[];
  past_talks: string[];
  headshot_url: string | null;
}

export interface Settings {
  id: "app";
  /** Master switch for scheduled automations (they spend API credit). */
  autopilot: boolean;
  daily_budget_cents: number;
  monthly_budget_cents: number;
  notify_threshold: 1 | 2 | 3;
  coverage: Record<string, number>;
  calendar_ics_url: string | null;
  default_model: string;
  fast_model: string;
  timezone: string;
  onboarded: boolean;
  /** SEAN ∞ autonomy: 1 observe · 2 prepare · 3 execute internally · 4 external with approval · 5 pre-authorised. */
  autonomy_level: 1 | 2 | 3 | 4 | 5;
  /** Emergency stop: no task runs and no automation fires while true. */
  halted: boolean;
  founder_seeded?: boolean;
  updated_at: string;
}

export type MemoryKind = "fact" | "inference" | "preference" | "feedback" | "decision" | "goal" | "relationship" | "project";
export interface Memory {
  id: string;
  category: string;
  content: string;
  kind: MemoryKind;
  scope: Scope;
  source: string;
  provenance: string | null;
  confidence: number;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentOverride {
  id: string;
  instructions: string | null;
  model: string | null;
  enabled: boolean;
  updated_at: string;
}

export type TaskStatus = "queued" | "running" | "awaiting_approval" | "completed" | "failed" | "blocked" | "paused" | "cancelled";
export interface Deliverable { type: string; id: string; title: string }
export interface Task {
  id: string;
  title: string;
  instruction: string;
  kind: string;
  params: Record<string, unknown>;
  status: TaskStatus;
  agent: string;
  progress: number;
  summary: string | null;
  deliverables: Deliverable[];
  citations: Source[];
  context_ref: Ref | null;
  automation_id: string | null;
  attempts: number;
  max_attempts: number;
  scheduled_for: string;
  lease_until: string | null;
  error: string | null;
  blocked_on: string | null;
  cost_cents: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";
export interface TaskStep {
  id: string;
  task_id: string;
  idx: number;
  agent: string;
  title: string;
  status: StepStatus;
  output: unknown;
  cost_cents: number;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
}

export interface TaskLog {
  id: string;
  task_id: string;
  agent: string | null;
  level: "info" | "warn" | "error";
  message: string;
  at: string;
}

export interface Usage {
  id: string;
  task_id: string | null;
  agent: string;
  provider: string;
  model: string;
  operation: string;
  input_tokens: number;
  output_tokens: number;
  web_searches: number;
  images: number;
  cost_cents: number;
  created_at: string;
}

export interface Automation {
  id: string;
  workflow: string;
  name: string;
  description: string;
  cadence: "daily" | "weekly";
  weekday: number | null;
  hour: number;
  minute: number;
  params: Record<string, unknown>;
  enabled: boolean;
  est_cost_cents: number;
  last_run_at: string | null;
  next_run_at: string | null;
  last_task_id: string | null;
  created_at: string;
}

export interface Edition {
  id: string;
  date: string;
  title: string;
  standfirst: string;
  big_idea: string | null;
  for_me: string | null;
  status: "generating" | "ready" | "failed";
  task_id: string | null;
  created_at: string;
}

export interface Story {
  id: string;
  edition_id: string;
  section: string;
  position: number;
  headline: string;
  dek: string;
  what: string;
  why: string;
  implications: string;
  ideas: string[];
  topics: string[];
  sources: Source[];
  image_url: string | null;
  saved: boolean;
  created_at: string;
}

export interface Briefing {
  id: string;
  date: string;
  summary: string;
  priorities: { title: string; why: string; href: string | null }[];
  reminders: string[];
  plan: { time: string; title: string }[];
  opportunity_action: string | null;
  opportunity_picks: { trend_id: string | null; idea_id: string | null; person_id: string | null; speaking_id: string | null; partnership_id: string | null };
  task_id: string | null;
  created_at: string;
}

export type DraftStatus = "draft" | "awaiting_approval" | "approved" | "scheduled" | "rejected" | "published";
export interface Draft {
  id: string;
  platform: string;
  title: string;
  hook: string;
  body: string;
  slides: { title: string; body: string }[];
  notes: string;
  status: DraftStatus;
  scheduled_for: string | null;
  source_ref: Ref | null;
  agent: string;
  original_body: string;
  version: number;
  task_id: string | null;
  created_at: string;
  updated_at: string;
}

export type PersonStatus = "suggested" | "saved" | "contacted" | "met" | "dismissed";
export interface Person {
  id: string;
  name: string;
  photo_url: string | null;
  role: string;
  company: string;
  location: string;
  category: string;
  profiles: { label: string; url: string }[];
  achievements: string[];
  why_get_along: string;
  why_valuable: string;
  conversation_starter: string;
  message: string;
  sources: Source[];
  status: PersonStatus;
  origin: "agent" | "manual";
  notes: string;
  interests: string[];
  remind_at: string | null;
  daily_pick_date: string | null;
  last_contact_at: string | null;
  dedupe_key: string;
  discovered_at: string;
  verified_at: string | null;
}

export interface Interaction {
  id: string;
  person_id: string;
  kind: "note" | "message" | "meeting" | "call" | "email";
  summary: string;
  at: string;
}

export interface Partnership {
  id: string;
  brand: string;
  category: string;
  what_they_do: string;
  audience: string;
  positioning: string;
  relevance: string;
  opportunity: string;
  concept: { title: string; summary: string; products: string[]; experiences: string[]; campaign: string };
  commercial: {
    models: string[];
    estimates: { label: string; value: string; basis: "illustrative" | "verified"; source_url: string | null }[];
    strategic_benefits: string[];
  };
  contacts: Contact[];
  outreach: { subject: string; body: string } | null;
  slides: { title: string; bullets: string[] }[];
  images: string[];
  status: "discovered" | "shortlisted" | "in_development" | "outreach_ready" | "contacted" | "in_talks" | "passed";
  sources: Source[];
  unexpected: boolean;
  dedupe_key: string;
  task_id: string | null;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
}

export interface Idea {
  id: string;
  title: string;
  one_liner: string;
  insight: string;
  product: string;
  audience: string;
  business_model: string;
  competition: { name: string; url: string | null; note: string }[];
  advantage: string;
  evidence: string;
  launch: string;
  verdict: "explore" | "monitor" | "discard" | null;
  costs: string;
  monetisation: string[];
  challenges: string[];
  scale: string;
  assumptions: string[];
  scores: { market: number; fit: number; effort: number; novelty: number } | null;
  origin: "user" | "agent";
  trend_ids: string[];
  links: string[];
  tags: string[];
  notes: string;
  status: "captured" | "developing" | "validated" | "parked" | "archived";
  sources: Source[];
  images: string[];
  dedupe_key: string;
  task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: string;
  kind: string;
  title: string;
  summary: string;
  body: string;
  slides: { title: string; bullets: string[]; notes?: string }[];
  sources: Source[];
  subject_ref: Ref | null;
  scope: Scope;
  tags: string[];
  images: string[];
  task_id: string | null;
  created_at: string;
}

export interface Trend {
  id: string;
  title: string;
  category: string;
  region: string;
  what: string;
  evidence: { claim: string; kind: "measured" | "anecdotal"; source_url: string; date: string | null }[];
  why: string;
  drivers: string[];
  maturity: "weak_signal" | "emerging" | "accelerating" | "mainstream";
  momentum: number;
  opportunity_score: number;
  prediction: string;
  relevance: string;
  opportunities: string[];
  calm_applications: string[];
  sources: Source[];
  image_url: string | null;
  status: "new" | "saved" | "dismissed";
  dedupe_key: string;
  seen_count: number;
  discovered_at: string;
  verified_at: string;
}

export type SpeakingStatus = "discovered" | "saved" | "drafting" | "applied" | "accepted" | "declined" | "contacted" | "dismissed";
export interface Speaking {
  id: string;
  name: string;
  kind: string;
  image_url: string | null;
  location: string;
  start_date: string | null;
  end_date: string | null;
  organiser: string;
  audience: string;
  size: string | null;
  fit: string;
  talk_titles: string[];
  cfp_status: "open" | "rolling" | "closed" | "invite_only" | "unknown";
  deadline: string | null;
  deadline_verified: boolean;
  submission_url: string | null;
  contacts: Contact[];
  networking: string;
  next_action: string;
  pitch: { subject: string; body: string } | null;
  status: SpeakingStatus;
  follow_up_at: string | null;
  applied_at: string | null;
  sources: Source[];
  dedupe_key: string;
  discovered_at: string;
  verified_at: string;
}

export interface Opportunity {
  id: string;
  title: string;
  thesis: string;
  why_now: string;
  items: { type: string; id: string; title: string; role: string }[];
  actions: { label: string; instruction: string; done: boolean }[];
  score: number;
  status: "new" | "active" | "done" | "dismissed";
  dedupe_key: string;
  task_id: string | null;
  created_at: string;
}

export interface Outreach {
  id: string;
  target_type: "person" | "partnership" | "speaking";
  target_id: string;
  target_name: string;
  channel: "email" | "linkedin" | "dm" | "form";
  to: string | null;
  subject: string;
  body: string;
  status: "draft" | "approved" | "sent" | "replied" | "no_reply" | "declined";
  follow_up_at: string | null;
  reply_note: string;
  approved_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Approval {
  id: string;
  type: "draft" | "outreach" | "task" | "strategy" | "experiment";
  ref_id: string;
  title: string;
  summary: string;
  agent: string;
  task_id: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
}

export interface WardrobeItem {
  id: string;
  image: string | null;
  name: string;
  category: string;
  colours: string[];
  brand: string;
  material: string;
  formality: number;
  seasons: string[];
  notes: string;
  favourite: boolean;
  worn_count: number;
  last_worn: string | null;
  tagged_by: "user" | "agent";
  created_at: string;
}

export interface Outfit {
  id: string;
  date: string;
  title: string;
  item_ids: string[];
  rationale: string;
  occasion: string;
  weather: { temp_c: number; summary: string } | null;
  missing: string[];
  shopping: { name: string; brand: string; url: string; price: string | null; note: string }[];
  status: "suggested" | "worn" | "skipped";
  task_id: string | null;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string | null;
  all_day: boolean;
  location: string;
  description: string;
  source: "manual" | "ics";
  external_id: string | null;
  prep_report_id: string | null;
}

export interface Experience {
  id: string;
  title: string;
  kind: string;
  venue: string;
  area: string;
  dates: string;
  description: string;
  why: string;
  price: string | null;
  url: string | null;
  image_url: string | null;
  sources: Source[];
  status: "new" | "saved" | "planned" | "dismissed";
  dedupe_key: string;
  discovered_at: string;
}

export interface LifeEntry {
  id: string;
  kind: "workout" | "spend" | "savings_goal" | "learning_goal" | "reading" | "trip";
  title: string;
  amount: number | null;
  target: number | null;
  progress: number | null;
  date: string;
  notes: string;
  done: boolean;
  created_at: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  /** Negative = money out, positive = money in. GBP unless account says otherwise. */
  amount: number;
  category: string;
  account_id: string | null;
  source: "manual" | "csv";
  import_hash: string | null;
  notes: string;
  created_at: string;
}

export interface Account {
  id: string;
  name: string;
  kind: "current" | "savings" | "investment" | "pension" | "credit" | "loan" | "cash" | "other";
  balance: number;
  currency: string;
  updated_at: string;
}

export interface Budget {
  /** The category name is the id. */
  id: string;
  monthly_limit: number;
  updated_at: string;
}

export interface Recurring {
  id: string;
  name: string;
  amount: number;
  kind: "bill" | "subscription" | "income";
  cadence: "weekly" | "monthly" | "yearly";
  next_date: string;
  category: string;
  active: boolean;
  created_at: string;
}

export interface FinanceGoal {
  id: string;
  name: string;
  target: number;
  saved: number;
  deadline: string | null;
  created_at: string;
}

/* ----------------------------- SEAN ∞ ----------------------------- */

export type NodeType =
  | "self" | "person" | "company" | "organisation" | "project" | "idea" | "trend" | "technology" | "market"
  | "event" | "goal" | "document" | "decision" | "skill" | "product" | "place" | "topic";

/** Where a node or edge came from. */
export interface Provenance {
  kind: "user" | "record" | "extraction" | "url";
  ref: string | null;
  url: string | null;
  quote: string | null;
  at: string;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  aliases: string[];
  summary: string;
  attributes: Record<string, string>;
  scope: Scope;
  confidence: number;
  sources: Provenance[];
  record_ref: Ref | null;
  dedupe_key: string;
  status: "active" | "hidden" | "merged";
  merged_into: string | null;
  verified: boolean;
  embedding: number[] | null;
  embedded_hash: string | null;
  first_seen: string;
  last_seen: string;
  updated_at: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: string;
  label: string;
  confidence: number;
  sources: Provenance[];
  scope: Scope;
  valid_from: string | null;
  valid_to: string | null;
  status: "active" | "retracted";
  first_seen: string;
  last_seen: string;
}

export interface GraphConflict {
  id: string;
  kind: "functional" | "attribute";
  node_id: string;
  edge_ids: string[];
  attribute: string | null;
  description: string;
  options: string[];
  status: "open" | "resolved" | "dismissed";
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface GraphIngest {
  /** Source key, e.g. "story:st_123". */
  id: string;
  hash: string;
  extracted_at: string;
  entities: number;
  relations: number;
}

export interface Ambition {
  id: string;
  statement: string;
  horizon: string;
  why: string;
  success: string[];
  assumptions: string[];
  risks: string[];
  status: "drafting" | "proposed" | "active" | "paused" | "achieved" | "dropped";
  task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Metric {
  name: string;
  target: number;
  current: number;
  unit: string;
  /** "manual" or a built-in counter key. */
  source: string;
}

export interface StrategyItem {
  id: string;
  ambition_id: string;
  parent_id: string | null;
  level: "strategy" | "objective" | "initiative" | "project" | "action";
  title: string;
  description: string;
  rationale: string;
  metrics: Metric[];
  status: "proposed" | "approved" | "active" | "paused" | "done" | "dropped";
  owner_agent: string;
  instruction: string | null;
  task_ids: string[];
  evidence: string[];
  due: string | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface StrategyReview {
  id: string;
  ambition_id: string;
  date: string;
  progress: string;
  blockers: string[];
  new_information: string[];
  stop_doing: string[];
  highest_leverage: { title: string; why: string; instruction: string } | null;
  adjustments: string[];
  task_id: string | null;
  created_at: string;
}

export interface Insight {
  id: string;
  run_id: string;
  kind: string;
  title: string;
  insight: string;
  recommendation: { label: string; instruction: string } | null;
  evidence: { id: string; label: string; href: string | null }[];
  impact: number;
  confidence: number;
  status: "new" | "acted" | "dismissed";
  next_best_move: boolean;
  task_id: string | null;
  created_at: string;
}

export type Lens = "visionary" | "investor" | "operator" | "creative" | "researcher" | "sceptic" | "strategist";

export interface CouncilView {
  lens: Lens;
  stance: "support" | "oppose" | "conditional";
  score: number;
  summary: string;
  points: string[];
  risks: string[];
  assumptions: string[];
  questions: string[];
  preferred_option: string | null;
}

export interface Decision {
  id: string;
  question: string;
  context: string;
  options: string[];
  status: "deliberating" | "ready" | "decided" | "archived";
  evidence: { claim: string; source_url: string | null; kind: "sourced" | "graph" | "record" }[];
  unknowns: { question: string; finding: string }[];
  views: CouncilView[];
  disagreements: { topic: string; positions: string[] }[];
  tradeoffs: string[];
  recommendation: { option: string; confidence: number; rationale: string } | null;
  would_change: string[];
  next_steps: { label: string; instruction: string }[];
  scenario_id: string | null;
  decided_option: string | null;
  decision_note: string;
  context_ref: Ref | null;
  task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScenarioAssumption {
  key: string;
  value: number;
  basis: "estimate" | "sourced" | "user";
  note: string;
  source_url: string | null;
  low: number;
  high: number;
}

export interface Scenario {
  id: string;
  question: string;
  summary: string;
  model_fit: string;
  assumptions: ScenarioAssumption[];
  paths: { name: "conservative" | "base" | "optimistic" | "alternative"; title: string; narrative: string; overrides: Record<string, number>; milestones: string[]; risks: string[]; dependencies: string[] }[];
  qualitative: { dimension: string; conservative: number; base: number; optimistic: number; alternative: number; note: string }[];
  capabilities: string[];
  market: string;
  sources: Source[];
  decision_id: string | null;
  status: "modelling" | "ready" | "failed";
  task_id: string | null;
  created_at: string;
  updated_at: string;
}

/* ---------------------------- Founder OS ---------------------------- */

export type Basis = "verified" | "estimate" | "forecast" | "scenario" | "user";

export interface Venture {
  id: string;
  name: string;
  tagline: string;
  category: string;
  stage: "concept" | "researching" | "validating" | "building" | "launched" | "paused" | "archived";
  status: "draft" | "researching" | "awaiting_approval" | "running" | "completed" | "failed";
  thesis: string;
  customer: string;
  market: string;
  competition: string;
  business_model: string;
  validation: string;
  product: string;
  roadmap: string;
  ownership: "independent" | "calm" | "joint" | "unclear";
  ip_notes: string;
  licensing: string;
  confidentiality: Scope;
  conflicts: string[];
  incorporated: boolean;
  priority: number;
  health: { score: number; reasons: string[] } | null;
  idea_id: string | null;
  merged_into: string | null;
  tags: string[];
  is_demo: boolean;
  /** Monthly cap on growth-experiment spend, in GBP. Nothing paid can be approved until it's set. */
  growth_cap?: number | null;
  created_at: string;
  updated_at: string;
}

export interface VentureDoc {
  id: string;
  venture_id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  checklist: { item: string; status: "todo" | "doing" | "done" | "na"; note: string; due: string | null }[];
  slides: { title: string; bullets: string[]; notes?: string }[];
  sources: Source[];
  basis: Basis;
  status: "draft" | "awaiting_approval" | "final";
  version: number;
  agent: string;
  task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface VentureTask {
  id: string;
  venture_id: string;
  title: string;
  detail: string;
  phase: "30" | "60" | "90" | "later";
  owner: string;
  due: string | null;
  status: "todo" | "doing" | "done" | "blocked";
  engine_task_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Driver { key: string; label: string; value: number; unit: string; basis: Basis; note: string; source_url: string | null }
export interface FinModel {
  id: string;
  venture_id: string;
  version: number;
  currency: "GBP" | "USD";
  fx: { gbp_usd: number; as_of: string; source: string };
  start: string;
  months: number;
  starting_cash: number;
  streams: Record<string, boolean>;
  drivers: Driver[];
  opex: { name: string; monthly: number; start_month: number; growth_pct: number }[];
  team: { role: string; monthly_cost: number; start_month: number }[];
  funding: { month: number; amount: number; kind: "equity" | "grant" | "loan" | "revenue_based" | "founder"; note: string }[];
  scenarios: { upside: Record<string, number>; downside: Record<string, number> };
  actuals: { month: string; revenue: number; costs: number; cash: number }[];
  startup_costs: { item: string; amount: number; basis: Basis }[];
  change_note: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

export interface FinModelVersion {
  id: string;
  model_id: string;
  venture_id: string;
  version: number;
  snapshot: Omit<FinModel, "id">;
  change_note: string;
  changed: string[];
  by: string;
  at: string;
}

export interface CapTable {
  id: string;
  venture_id: string;
  holders: { name: string; kind: "founder" | "investor" | "pool" | "other"; shares: number }[];
  rounds: { name: string; pre_money: number; amount: number; pool_top_up_pct: number; status: "modelled" | "closed"; date: string | null }[];
  currency: "GBP" | "USD";
  basis: Basis;
  updated_at: string;
}

export interface Investor {
  id: string;
  name: string;
  kind: "angel" | "vc" | "accelerator" | "grant" | "strategic" | "syndicate" | "other";
  firm: string;
  geography: string[];
  stages: string[];
  sectors: string[];
  cheque: { min: number | null; max: number | null; currency: string; stated: boolean };
  thesis: string;
  notable: { name: string; url: string | null }[];
  website: string | null;
  apply_url: string | null;
  sources: Source[];
  last_verified: string;
  dedupe_key: string;
  created_at: string;
}

export interface PipelineEntry {
  id: string;
  venture_id: string;
  investor_id: string;
  stage: "researching" | "shortlisted" | "contacted" | "meeting" | "diligence" | "term_sheet" | "committed" | "passed";
  fit_score: number;
  fit_reasons: string[];
  warm_intro: { via: string; note: string } | null;
  next_step: string;
  follow_up_at: string | null;
  notes: string;
  history: { at: string; stage: string; note: string }[];
  created_at: string;
  updated_at: string;
}

export interface CopilotMessage {
  id: string;
  thread: string;
  role: "sean" | "cofounder";
  text: string;
  actions: { type: string; label: string; ref: string | null; ok: boolean }[];
  task_id: string | null;
  status: "pending" | "done" | "failed";
  created_at: string;
}

export type GrowthMetricKey = "installs" | "signups" | "active_users" | "paid_users" | "revenue" | "spend" | "impressions" | "clicks" | "waitlist";
/** Real numbers only: entered by Sean, imported from a file, or pulled from a connected provider. */
export interface GrowthMetric {
  id: string;
  venture_id: string;
  date: string;
  metric: GrowthMetricKey;
  value: number;
  source: "manual" | "csv" | "provider";
  note: string;
  created_at: string;
}

export interface Experiment {
  id: string;
  venture_id: string;
  title: string;
  hypothesis: string;
  channel: string;
  steps: string[];
  assets: { kind: string; title: string; body: string }[];
  budget: number;
  metric: GrowthMetricKey;
  baseline: number | null;
  target: number;
  duration_days: number;
  status: "proposed" | "running" | "done" | "rejected" | "killed";
  started_at: string | null;
  ends_at: string | null;
  spent: number;
  result: { value: number | null; verdict: "win" | "loss" | "inconclusive" | "no_data"; note: string } | null;
  approval_id: string | null;
  agent: string;
  task_id: string | null;
  created_at: string;
  updated_at: string;
}

/* ------------------------------ LIFE HQ ------------------------------ */

export type LifeAreaKey = "career" | "business" | "money" | "health" | "home" | "friends" | "travel" | "reputation";

/** Sean's own numbers and words. Progress is computed from real data where it exists, otherwise Sean sets it. */
export interface LifeHQ {
  id: "me";
  vision: string;
  quote: string;
  salary: number;
  salary_target: number;
  /** Used only when no savings accounts are recorded in Money. */
  savings: number;
  savings_target: number;
  revenue_target: number;
  areas: Record<string, { statement: string; progress: number | null }>;
  images: Record<string, string | null>;
  /** Savings balance at the end of each month (YYYY-MM), recorded as it happens. */
  savings_history: Record<string, number>;
  updated_at: string;
}

export interface HQItem {
  id: string;
  section: "health" | "home" | "friends" | "travel" | "reputation" | "tasks" | "vision";
  title: string;
  value: string;
  date: string | null;
  done: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface WeekPriority {
  id: string;
  week: string;
  rank: number;
  title: string;
  tag: "Work" | "Personal" | "Business";
  done: boolean;
  created_at: string;
}

/** Calm work projects. Kept apart from Founder OS ventures. */
export interface WorkProject {
  id: string;
  name: string;
  status: "Not set" | "Planning" | "Development" | "Testing" | "Active" | "Blocked" | "Complete";
  progress: number | null;
  next_action: string;
  image: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Win {
  id: string;
  date: string;
  title: string;
  area: string;
  created_at: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  mood: number | null;
  answers: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface CredentialRow {
  id: string;
  provider: string;
  ciphertext: string;
  iv: string;
  tag: string;
  hint: string;
  updated_at: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  href: string | null;
  importance: 1 | 2 | 3;
  read: boolean;
  pushed: boolean;
  created_at: string;
}

export interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export interface FileRow {
  id: string;
  mime: string;
  size: number;
  /** base64 for the local store; Supabase uses Storage and leaves this null. */
  data: string | null;
  storage_path: string | null;
  created_at: string;
}

export interface Tables {
  profile: Profile;
  settings: Settings;
  memories: Memory;
  agent_overrides: AgentOverride;
  tasks: Task;
  task_steps: TaskStep;
  task_logs: TaskLog;
  usage: Usage;
  automations: Automation;
  editions: Edition;
  stories: Story;
  briefings: Briefing;
  drafts: Draft;
  people: Person;
  interactions: Interaction;
  partnerships: Partnership;
  ideas: Idea;
  reports: Report;
  trends: Trend;
  speaking: Speaking;
  opportunities: Opportunity;
  outreach: Outreach;
  approvals: Approval;
  wardrobe: WardrobeItem;
  outfits: Outfit;
  events: CalendarEvent;
  experiences: Experience;
  life: LifeEntry;
  transactions: Transaction;
  accounts: Account;
  budgets: Budget;
  recurring: Recurring;
  finance_goals: FinanceGoal;
  graph_nodes: GraphNode;
  graph_edges: GraphEdge;
  graph_conflicts: GraphConflict;
  graph_ingest: GraphIngest;
  ambitions: Ambition;
  strategy_items: StrategyItem;
  strategy_reviews: StrategyReview;
  insights: Insight;
  audit_log: AuditEntry;
  decisions: Decision;
  scenarios: Scenario;
  ventures: Venture;
  venture_docs: VentureDoc;
  venture_tasks: VentureTask;
  fin_models: FinModel;
  fin_model_versions: FinModelVersion;
  cap_tables: CapTable;
  investors: Investor;
  investor_pipeline: PipelineEntry;
  copilot_messages: CopilotMessage;
  growth_metrics: GrowthMetric;
  experiments: Experiment;
  life_hq: LifeHQ;
  hq_items: HQItem;
  week_priorities: WeekPriority;
  work_projects: WorkProject;
  wins: Win;
  journal: JournalEntry;
  credentials: CredentialRow;
  notifications: Notification;
  push_subscriptions: PushSubscriptionRow;
  files: FileRow;
}

export type TableName = keyof Tables;
export const TABLE_NAMES: TableName[] = [
  "profile", "settings", "memories", "agent_overrides", "tasks", "task_steps", "task_logs", "usage", "automations",
  "editions", "stories", "briefings", "drafts", "people", "interactions", "partnerships", "ideas", "reports", "trends",
  "speaking", "opportunities", "outreach", "approvals", "wardrobe", "outfits", "events", "experiences", "life",
  "transactions", "accounts", "budgets", "recurring", "finance_goals",
  "graph_nodes", "graph_edges", "graph_conflicts", "graph_ingest", "ambitions", "strategy_items", "strategy_reviews", "insights", "audit_log", "decisions", "scenarios",
  "ventures", "venture_docs", "venture_tasks", "fin_models", "fin_model_versions", "cap_tables", "investors", "investor_pipeline", "copilot_messages", "growth_metrics", "experiments", "life_hq", "hq_items", "week_priorities", "work_projects", "wins", "journal", "credentials",
  "notifications", "push_subscriptions", "files",
];

export type Where<T> = { [K in keyof T]?: T[K] | T[K][] | null };
export interface ListOptions<T> {
  where?: Where<T>;
  orderBy?: { column: keyof T & string; ascending?: boolean };
  limit?: number;
}

export interface Database {
  readonly backend: "local" | "supabase";
  list<K extends TableName>(table: K, opts?: ListOptions<Tables[K]>): Promise<Tables[K][]>;
  get<K extends TableName>(table: K, id: string): Promise<Tables[K] | null>;
  insert<K extends TableName>(table: K, row: Tables[K]): Promise<Tables[K]>;
  upsert<K extends TableName>(table: K, row: Tables[K]): Promise<Tables[K]>;
  update<K extends TableName>(table: K, id: string, patch: Partial<Tables[K]>): Promise<Tables[K]>;
  remove<K extends TableName>(table: K, id: string): Promise<void>;
  count<K extends TableName>(table: K, where?: Where<Tables[K]>): Promise<number>;
}

export function matches<T>(row: T, where?: Where<T>): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where) as [keyof T, unknown][]) {
    if (v === undefined) continue;
    const actual = row[k] as unknown;
    if (Array.isArray(v)) {
      if (!v.includes(actual)) return false;
    } else if (v === null) {
      if (actual !== null && actual !== undefined) return false;
    } else if (actual !== v) return false;
  }
  return true;
}
