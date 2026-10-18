-- Founder OS (run after 0004). Credentials hold AES-256-GCM ciphertext only.

create table if not exists public.ventures (
  "id" text primary key,
  "name" text,
  "tagline" text,
  "category" text,
  "stage" text,
  "status" text,
  "thesis" text,
  "customer" text,
  "market" text,
  "competition" text,
  "business_model" text,
  "validation" text,
  "product" text,
  "roadmap" text,
  "ownership" text,
  "ip_notes" text,
  "licensing" text,
  "confidentiality" text,
  "conflicts" jsonb,
  "incorporated" boolean,
  "priority" double precision,
  "health" jsonb,
  "idea_id" text,
  "merged_into" text,
  "tags" jsonb,
  "is_demo" boolean,
  "created_at" text,
  "updated_at" text
);
alter table public.ventures enable row level security;

create table if not exists public.venture_docs (
  "id" text primary key,
  "venture_id" text,
  "kind" text,
  "title" text,
  "body" text,
  "data" jsonb,
  "checklist" jsonb,
  "slides" jsonb,
  "sources" jsonb,
  "basis" text,
  "status" text,
  "version" double precision,
  "agent" text,
  "task_id" text,
  "created_at" text,
  "updated_at" text
);
alter table public.venture_docs enable row level security;

create table if not exists public.venture_tasks (
  "id" text primary key,
  "venture_id" text,
  "title" text,
  "detail" text,
  "phase" text,
  "owner" text,
  "due" text,
  "status" text,
  "engine_task_id" text,
  "created_at" text,
  "updated_at" text
);
alter table public.venture_tasks enable row level security;

create table if not exists public.fin_models (
  "id" text primary key,
  "venture_id" text,
  "version" double precision,
  "currency" text,
  "fx" jsonb,
  "start" text,
  "months" double precision,
  "starting_cash" double precision,
  "streams" jsonb,
  "drivers" jsonb,
  "opex" jsonb,
  "team" jsonb,
  "funding" jsonb,
  "scenarios" jsonb,
  "actuals" jsonb,
  "startup_costs" jsonb,
  "change_note" text,
  "updated_by" text,
  "created_at" text,
  "updated_at" text
);
alter table public.fin_models enable row level security;

create table if not exists public.fin_model_versions (
  "id" text primary key,
  "model_id" text,
  "venture_id" text,
  "version" double precision,
  "snapshot" jsonb,
  "change_note" text,
  "changed" jsonb,
  "by" text,
  "at" text
);
alter table public.fin_model_versions enable row level security;

create table if not exists public.cap_tables (
  "id" text primary key,
  "venture_id" text,
  "holders" jsonb,
  "rounds" jsonb,
  "currency" text,
  "basis" text,
  "updated_at" text
);
alter table public.cap_tables enable row level security;

create table if not exists public.investors (
  "id" text primary key,
  "name" text,
  "kind" text,
  "firm" text,
  "geography" jsonb,
  "stages" jsonb,
  "sectors" jsonb,
  "cheque" jsonb,
  "thesis" text,
  "notable" jsonb,
  "website" text,
  "apply_url" text,
  "sources" jsonb,
  "last_verified" text,
  "dedupe_key" text,
  "created_at" text
);
alter table public.investors enable row level security;

create table if not exists public.investor_pipeline (
  "id" text primary key,
  "venture_id" text,
  "investor_id" text,
  "stage" text,
  "fit_score" double precision,
  "fit_reasons" jsonb,
  "warm_intro" jsonb,
  "next_step" text,
  "follow_up_at" text,
  "notes" text,
  "history" jsonb,
  "created_at" text,
  "updated_at" text
);
alter table public.investor_pipeline enable row level security;

create table if not exists public.copilot_messages (
  "id" text primary key,
  "thread" text,
  "role" text,
  "text" text,
  "actions" jsonb,
  "task_id" text,
  "status" text,
  "created_at" text
);
alter table public.copilot_messages enable row level security;

create table if not exists public.credentials (
  "id" text primary key,
  "provider" text,
  "ciphertext" text,
  "iv" text,
  "tag" text,
  "hint" text,
  "updated_at" text
);
alter table public.credentials enable row level security;

alter table public.settings add column if not exists "founder_seeded" boolean;
create index if not exists venture_docs_venture on public.venture_docs ("venture_id", "kind");
create index if not exists venture_tasks_venture on public.venture_tasks ("venture_id");
create index if not exists investor_pipeline_venture on public.investor_pipeline ("venture_id");
create index if not exists copilot_thread on public.copilot_messages ("thread");
