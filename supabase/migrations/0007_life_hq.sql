-- LIFE HQ (run after 0006). Sean's own numbers, lists, priorities, wins and private journal.

create table if not exists public.life_hq (
  "id" text primary key,
  "vision" text,
  "quote" text,
  "salary" double precision,
  "salary_target" double precision,
  "savings" double precision,
  "savings_target" double precision,
  "revenue_target" double precision,
  "areas" jsonb,
  "images" jsonb,
  "savings_history" jsonb,
  "updated_at" text
);
alter table public.life_hq enable row level security;

create table if not exists public.hq_items (
  "id" text primary key,
  "section" text,
  "title" text,
  "value" text,
  "date" text,
  "done" boolean,
  "position" double precision,
  "created_at" text,
  "updated_at" text
);
alter table public.hq_items enable row level security;

create table if not exists public.week_priorities (
  "id" text primary key,
  "week" text,
  "rank" double precision,
  "title" text,
  "tag" text,
  "done" boolean,
  "created_at" text
);
alter table public.week_priorities enable row level security;

create table if not exists public.work_projects (
  "id" text primary key,
  "name" text,
  "status" text,
  "progress" double precision,
  "next_action" text,
  "image" text,
  "notes" text,
  "created_at" text,
  "updated_at" text
);
alter table public.work_projects enable row level security;

create table if not exists public.wins (
  "id" text primary key,
  "date" text,
  "title" text,
  "area" text,
  "created_at" text
);
alter table public.wins enable row level security;

create table if not exists public.journal (
  "id" text primary key,
  "date" text,
  "mood" double precision,
  "answers" jsonb,
  "created_at" text,
  "updated_at" text
);
alter table public.journal enable row level security;

alter table public.profile add column if not exists "birthday" text;
