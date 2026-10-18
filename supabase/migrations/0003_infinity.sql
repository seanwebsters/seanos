-- SEAN ∞: world model, strategy engine and trust (run after 0002_finance.sql).

alter table public.settings add column if not exists "autonomy_level" double precision default 2;
alter table public.settings add column if not exists "halted" boolean default false;

create table if not exists public.graph_nodes (
  "id" text primary key,
  "type" text,
  "name" text,
  "aliases" jsonb,
  "summary" text,
  "attributes" jsonb,
  "scope" text,
  "confidence" double precision,
  "sources" jsonb,
  "record_ref" jsonb,
  "dedupe_key" text,
  "status" text,
  "merged_into" text,
  "verified" boolean,
  "embedding" jsonb,
  "embedded_hash" text,
  "first_seen" text,
  "last_seen" text,
  "updated_at" text
);
alter table public.graph_nodes enable row level security;

create table if not exists public.graph_edges (
  "id" text primary key,
  "from" text,
  "to" text,
  "type" text,
  "label" text,
  "confidence" double precision,
  "sources" jsonb,
  "scope" text,
  "valid_from" text,
  "valid_to" text,
  "status" text,
  "first_seen" text,
  "last_seen" text
);
alter table public.graph_edges enable row level security;

create table if not exists public.graph_conflicts (
  "id" text primary key,
  "kind" text,
  "node_id" text,
  "edge_ids" jsonb,
  "attribute" text,
  "description" text,
  "options" jsonb,
  "status" text,
  "resolution" text,
  "created_at" text,
  "resolved_at" text
);
alter table public.graph_conflicts enable row level security;

create table if not exists public.graph_ingest (
  "id" text primary key,
  "hash" text,
  "extracted_at" text,
  "entities" double precision,
  "relations" double precision
);
alter table public.graph_ingest enable row level security;

create table if not exists public.ambitions (
  "id" text primary key,
  "statement" text,
  "horizon" text,
  "why" text,
  "success" jsonb,
  "assumptions" jsonb,
  "risks" jsonb,
  "status" text,
  "task_id" text,
  "created_at" text,
  "updated_at" text
);
alter table public.ambitions enable row level security;

create table if not exists public.strategy_items (
  "id" text primary key,
  "ambition_id" text,
  "parent_id" text,
  "level" text,
  "title" text,
  "description" text,
  "rationale" text,
  "metrics" jsonb,
  "status" text,
  "owner_agent" text,
  "instruction" text,
  "task_ids" jsonb,
  "evidence" jsonb,
  "due" text,
  "position" double precision,
  "created_at" text,
  "updated_at" text
);
alter table public.strategy_items enable row level security;

create table if not exists public.strategy_reviews (
  "id" text primary key,
  "ambition_id" text,
  "date" text,
  "progress" text,
  "blockers" jsonb,
  "new_information" jsonb,
  "stop_doing" jsonb,
  "highest_leverage" jsonb,
  "adjustments" jsonb,
  "task_id" text,
  "created_at" text
);
alter table public.strategy_reviews enable row level security;

create table if not exists public.insights (
  "id" text primary key,
  "run_id" text,
  "kind" text,
  "title" text,
  "insight" text,
  "recommendation" jsonb,
  "evidence" jsonb,
  "impact" double precision,
  "confidence" double precision,
  "status" text,
  "next_best_move" boolean,
  "task_id" text,
  "created_at" text
);
alter table public.insights enable row level security;

create table if not exists public.audit_log (
  "id" text primary key,
  "at" text,
  "actor" text,
  "action" text,
  "target" text,
  "detail" text
);
alter table public.audit_log enable row level security;

create index if not exists graph_edges_from_idx on public.graph_edges ("from");
create index if not exists graph_edges_to_idx on public.graph_edges ("to");
create index if not exists strategy_items_ambition_idx on public.strategy_items (ambition_id);
create index if not exists insights_run_idx on public.insights (run_id);
