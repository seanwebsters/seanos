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
  type: "draft" | "outreach" | "task";
  ref_id: string;
  title: string;
  summary: string;
  agent: string;
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
  notifications: Notification;
  push_subscriptions: PushSubscriptionRow;
  files: FileRow;
}

export type TableName = keyof Tables;
export const TABLE_NAMES: TableName[] = [
  "profile", "settings", "memories", "agent_overrides", "tasks", "task_steps", "task_logs", "usage", "automations",
  "editions", "stories", "briefings", "drafts", "people", "interactions", "partnerships", "ideas", "reports", "trends",
  "speaking", "opportunities", "outreach", "approvals", "wardrobe", "outfits", "events", "experiences", "life",
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
