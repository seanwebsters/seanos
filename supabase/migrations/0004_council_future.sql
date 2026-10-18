-- SEAN ∞ phase 3: Intelligence Council and Future Engine (run after 0003).

create table if not exists public.decisions (
  "id" text primary key,
  "question" text,
  "context" text,
  "options" jsonb,
  "status" text,
  "evidence" jsonb,
  "unknowns" jsonb,
  "views" jsonb,
  "disagreements" jsonb,
  "tradeoffs" jsonb,
  "recommendation" jsonb,
  "would_change" jsonb,
  "next_steps" jsonb,
  "scenario_id" text,
  "decided_option" text,
  "decision_note" text,
  "context_ref" jsonb,
  "task_id" text,
  "created_at" text,
  "updated_at" text
);
alter table public.decisions enable row level security;

create table if not exists public.scenarios (
  "id" text primary key,
  "question" text,
  "summary" text,
  "model_fit" text,
  "assumptions" jsonb,
  "paths" jsonb,
  "qualitative" jsonb,
  "capabilities" jsonb,
  "market" text,
  "sources" jsonb,
  "decision_id" text,
  "status" text,
  "task_id" text,
  "created_at" text,
  "updated_at" text
);
alter table public.scenarios enable row level security;
