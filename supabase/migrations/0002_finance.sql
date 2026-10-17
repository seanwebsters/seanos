-- Finance tables (run after 0001_init.sql).

create table if not exists public.transactions (
  "id" text primary key,
  "date" text,
  "description" text,
  "amount" double precision,
  "category" text,
  "account_id" text,
  "source" text,
  "import_hash" text,
  "notes" text,
  "created_at" text
);
alter table public.transactions enable row level security;

create table if not exists public.accounts (
  "id" text primary key,
  "name" text,
  "kind" text,
  "balance" double precision,
  "currency" text,
  "updated_at" text
);
alter table public.accounts enable row level security;

create table if not exists public.budgets (
  "id" text primary key,
  "monthly_limit" double precision,
  "updated_at" text
);
alter table public.budgets enable row level security;

create table if not exists public.recurring (
  "id" text primary key,
  "name" text,
  "amount" double precision,
  "kind" text,
  "cadence" text,
  "next_date" text,
  "category" text,
  "active" boolean,
  "created_at" text
);
alter table public.recurring enable row level security;

create table if not exists public.finance_goals (
  "id" text primary key,
  "name" text,
  "target" double precision,
  "saved" double precision,
  "deadline" text,
  "created_at" text
);
alter table public.finance_goals enable row level security;

create index if not exists transactions_date_idx on public.transactions (date);
