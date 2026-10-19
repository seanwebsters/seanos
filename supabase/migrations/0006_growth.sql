-- Founder OS growth engine (run after 0005). Metrics are real numbers only; experiments start only when Sean approves.

create table if not exists public.growth_metrics (
  "id" text primary key,
  "venture_id" text,
  "date" text,
  "metric" text,
  "value" double precision,
  "source" text,
  "note" text,
  "created_at" text
);
alter table public.growth_metrics enable row level security;

create table if not exists public.experiments (
  "id" text primary key,
  "venture_id" text,
  "title" text,
  "hypothesis" text,
  "channel" text,
  "steps" jsonb,
  "assets" jsonb,
  "budget" double precision,
  "metric" text,
  "baseline" double precision,
  "target" double precision,
  "duration_days" double precision,
  "status" text,
  "started_at" text,
  "ends_at" text,
  "spent" double precision,
  "result" jsonb,
  "approval_id" text,
  "agent" text,
  "task_id" text,
  "created_at" text,
  "updated_at" text
);
alter table public.experiments enable row level security;

alter table public.ventures add column if not exists "growth_cap" double precision;
create index if not exists growth_metrics_venture on public.growth_metrics ("venture_id", "date");
create index if not exists experiments_venture on public.experiments ("venture_id", "status");
