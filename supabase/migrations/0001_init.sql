-- SEAN OS schema for Supabase/PostgreSQL. Generated from src/lib/db/types.ts.
-- The app connects server-side with the service-role key. RLS is enabled with no
-- policies, so the anon key can read nothing.

create table if not exists public.profile (
  "id" text primary key,
  "name" text,
  "age" double precision,
  "location" text,
  "role" text,
  "company" text,
  "bio" text,
  "interests" jsonb,
  "personal_interests" jsonb,
  "ambitions" jsonb,
  "writing_voice" text,
  "home_lat" double precision,
  "home_lng" double precision,
  "style" jsonb,
  "speaker" jsonb,
  "updated_at" text
);
alter table public.profile enable row level security;

create table if not exists public.settings (
  "id" text primary key,
  "autopilot" boolean,
  "daily_budget_cents" double precision,
  "monthly_budget_cents" double precision,
  "notify_threshold" double precision,
  "coverage" jsonb,
  "calendar_ics_url" text,
  "default_model" text,
  "fast_model" text,
  "timezone" text,
  "onboarded" boolean,
  "updated_at" text
);
alter table public.settings enable row level security;

create table if not exists public.memories (
  "id" text primary key,
  "category" text,
  "content" text,
  "kind" text,
  "scope" text,
  "source" text,
  "provenance" text,
  "confidence" double precision,
  "pinned" boolean,
  "created_at" text,
  "updated_at" text
);
alter table public.memories enable row level security;

create table if not exists public.agent_overrides (
  "id" text primary key,
  "instructions" text,
  "model" text,
  "enabled" boolean,
  "updated_at" text
);
alter table public.agent_overrides enable row level security;

create table if not exists public.tasks (
  "id" text primary key,
  "title" text,
  "instruction" text,
  "kind" text,
  "params" jsonb,
  "status" text,
  "agent" text,
  "progress" double precision,
  "summary" text,
  "deliverables" jsonb,
  "citations" jsonb,
  "context_ref" jsonb,
  "automation_id" text,
  "attempts" double precision,
  "max_attempts" double precision,
  "scheduled_for" text,
  "lease_until" text,
  "error" text,
  "blocked_on" text,
  "cost_cents" double precision,
  "created_at" text,
  "updated_at" text,
  "started_at" text,
  "completed_at" text
);
alter table public.tasks enable row level security;

create table if not exists public.task_steps (
  "id" text primary key,
  "task_id" text,
  "idx" double precision,
  "agent" text,
  "title" text,
  "status" text,
  "output" jsonb,
  "cost_cents" double precision,
  "started_at" text,
  "finished_at" text,
  "error" text
);
alter table public.task_steps enable row level security;

create table if not exists public.task_logs (
  "id" text primary key,
  "task_id" text,
  "agent" text,
  "level" text,
  "message" text,
  "at" text
);
alter table public.task_logs enable row level security;

create table if not exists public.usage (
  "id" text primary key,
  "task_id" text,
  "agent" text,
  "provider" text,
  "model" text,
  "operation" text,
  "input_tokens" double precision,
  "output_tokens" double precision,
  "web_searches" double precision,
  "images" double precision,
  "cost_cents" double precision,
  "created_at" text
);
alter table public.usage enable row level security;

create table if not exists public.automations (
  "id" text primary key,
  "workflow" text,
  "name" text,
  "description" text,
  "cadence" text,
  "weekday" double precision,
  "hour" double precision,
  "minute" double precision,
  "params" jsonb,
  "enabled" boolean,
  "est_cost_cents" double precision,
  "last_run_at" text,
  "next_run_at" text,
  "last_task_id" text,
  "created_at" text
);
alter table public.automations enable row level security;

create table if not exists public.editions (
  "id" text primary key,
  "date" text,
  "title" text,
  "standfirst" text,
  "big_idea" text,
  "for_me" text,
  "status" text,
  "task_id" text,
  "created_at" text
);
alter table public.editions enable row level security;

create table if not exists public.stories (
  "id" text primary key,
  "edition_id" text,
  "section" text,
  "position" double precision,
  "headline" text,
  "dek" text,
  "what" text,
  "why" text,
  "implications" text,
  "ideas" jsonb,
  "topics" jsonb,
  "sources" jsonb,
  "image_url" text,
  "saved" boolean,
  "created_at" text
);
alter table public.stories enable row level security;

create table if not exists public.briefings (
  "id" text primary key,
  "date" text,
  "summary" text,
  "priorities" jsonb,
  "reminders" jsonb,
  "plan" jsonb,
  "opportunity_action" text,
  "opportunity_picks" jsonb,
  "task_id" text,
  "created_at" text
);
alter table public.briefings enable row level security;

create table if not exists public.drafts (
  "id" text primary key,
  "platform" text,
  "title" text,
  "hook" text,
  "body" text,
  "slides" jsonb,
  "notes" text,
  "status" text,
  "scheduled_for" text,
  "source_ref" jsonb,
  "agent" text,
  "original_body" text,
  "version" double precision,
  "task_id" text,
  "created_at" text,
  "updated_at" text
);
alter table public.drafts enable row level security;

create table if not exists public.people (
  "id" text primary key,
  "name" text,
  "photo_url" text,
  "role" text,
  "company" text,
  "location" text,
  "category" text,
  "profiles" jsonb,
  "achievements" jsonb,
  "why_get_along" text,
  "why_valuable" text,
  "conversation_starter" text,
  "message" text,
  "sources" jsonb,
  "status" text,
  "origin" text,
  "notes" text,
  "interests" jsonb,
  "remind_at" text,
  "daily_pick_date" text,
  "last_contact_at" text,
  "dedupe_key" text,
  "discovered_at" text,
  "verified_at" text
);
alter table public.people enable row level security;

create table if not exists public.interactions (
  "id" text primary key,
  "person_id" text,
  "kind" text,
  "summary" text,
  "at" text
);
alter table public.interactions enable row level security;

create table if not exists public.partnerships (
  "id" text primary key,
  "brand" text,
  "category" text,
  "what_they_do" text,
  "audience" text,
  "positioning" text,
  "relevance" text,
  "opportunity" text,
  "concept" jsonb,
  "commercial" jsonb,
  "contacts" jsonb,
  "outreach" jsonb,
  "slides" jsonb,
  "images" jsonb,
  "status" text,
  "sources" jsonb,
  "unexpected" boolean,
  "dedupe_key" text,
  "task_id" text,
  "created_at" text,
  "updated_at" text,
  "verified_at" text
);
alter table public.partnerships enable row level security;

create table if not exists public.ideas (
  "id" text primary key,
  "title" text,
  "one_liner" text,
  "insight" text,
  "product" text,
  "audience" text,
  "business_model" text,
  "competition" jsonb,
  "advantage" text,
  "evidence" text,
  "launch" text,
  "verdict" text,
  "costs" text,
  "monetisation" jsonb,
  "challenges" jsonb,
  "scale" text,
  "assumptions" jsonb,
  "scores" jsonb,
  "origin" text,
  "trend_ids" jsonb,
  "links" jsonb,
  "tags" jsonb,
  "notes" text,
  "status" text,
  "sources" jsonb,
  "images" jsonb,
  "dedupe_key" text,
  "task_id" text,
  "created_at" text,
  "updated_at" text
);
alter table public.ideas enable row level security;

create table if not exists public.reports (
  "id" text primary key,
  "kind" text,
  "title" text,
  "summary" text,
  "body" text,
  "slides" jsonb,
  "sources" jsonb,
  "subject_ref" jsonb,
  "scope" text,
  "tags" jsonb,
  "images" jsonb,
  "task_id" text,
  "created_at" text
);
alter table public.reports enable row level security;

create table if not exists public.trends (
  "id" text primary key,
  "title" text,
  "category" text,
  "region" text,
  "what" text,
  "evidence" jsonb,
  "why" text,
  "drivers" jsonb,
  "maturity" text,
  "momentum" double precision,
  "opportunity_score" double precision,
  "prediction" text,
  "relevance" text,
  "opportunities" jsonb,
  "calm_applications" jsonb,
  "sources" jsonb,
  "image_url" text,
  "status" text,
  "dedupe_key" text,
  "seen_count" double precision,
  "discovered_at" text,
  "verified_at" text
);
alter table public.trends enable row level security;

create table if not exists public.speaking (
  "id" text primary key,
  "name" text,
  "kind" text,
  "image_url" text,
  "location" text,
  "start_date" text,
  "end_date" text,
  "organiser" text,
  "audience" text,
  "size" text,
  "fit" text,
  "talk_titles" jsonb,
  "cfp_status" jsonb,
  "deadline" text,
  "deadline_verified" boolean,
  "submission_url" text,
  "contacts" jsonb,
  "networking" text,
  "next_action" text,
  "pitch" jsonb,
  "status" text,
  "follow_up_at" text,
  "applied_at" text,
  "sources" jsonb,
  "dedupe_key" text,
  "discovered_at" text,
  "verified_at" text
);
alter table public.speaking enable row level security;

create table if not exists public.opportunities (
  "id" text primary key,
  "title" text,
  "thesis" text,
  "why_now" text,
  "items" jsonb,
  "actions" jsonb,
  "score" double precision,
  "status" text,
  "dedupe_key" text,
  "task_id" text,
  "created_at" text
);
alter table public.opportunities enable row level security;

create table if not exists public.outreach (
  "id" text primary key,
  "target_type" text,
  "target_id" text,
  "target_name" text,
  "channel" text,
  "to" text,
  "subject" text,
  "body" text,
  "status" text,
  "follow_up_at" text,
  "reply_note" text,
  "approved_at" text,
  "sent_at" text,
  "created_at" text,
  "updated_at" text
);
alter table public.outreach enable row level security;

create table if not exists public.approvals (
  "id" text primary key,
  "type" text,
  "ref_id" text,
  "title" text,
  "summary" text,
  "agent" text,
  "task_id" text,
  "status" text,
  "created_at" text,
  "decided_at" text
);
alter table public.approvals enable row level security;

create table if not exists public.wardrobe (
  "id" text primary key,
  "image" text,
  "name" text,
  "category" text,
  "colours" jsonb,
  "brand" text,
  "material" text,
  "formality" double precision,
  "seasons" jsonb,
  "notes" text,
  "favourite" boolean,
  "worn_count" double precision,
  "last_worn" text,
  "tagged_by" text,
  "created_at" text
);
alter table public.wardrobe enable row level security;

create table if not exists public.outfits (
  "id" text primary key,
  "date" text,
  "title" text,
  "item_ids" jsonb,
  "rationale" text,
  "occasion" text,
  "weather" jsonb,
  "missing" jsonb,
  "shopping" jsonb,
  "status" text,
  "task_id" text,
  "created_at" text
);
alter table public.outfits enable row level security;

create table if not exists public.events (
  "id" text primary key,
  "title" text,
  "start" text,
  "end" text,
  "all_day" boolean,
  "location" text,
  "description" text,
  "source" text,
  "external_id" text,
  "prep_report_id" text
);
alter table public.events enable row level security;

create table if not exists public.experiences (
  "id" text primary key,
  "title" text,
  "kind" text,
  "venue" text,
  "area" text,
  "dates" text,
  "description" text,
  "why" text,
  "price" text,
  "url" text,
  "image_url" text,
  "sources" jsonb,
  "status" text,
  "dedupe_key" text,
  "discovered_at" text
);
alter table public.experiences enable row level security;

create table if not exists public.life (
  "id" text primary key,
  "kind" text,
  "title" text,
  "amount" double precision,
  "target" double precision,
  "progress" double precision,
  "date" text,
  "notes" text,
  "done" boolean,
  "created_at" text
);
alter table public.life enable row level security;

create table if not exists public.notifications (
  "id" text primary key,
  "title" text,
  "body" text,
  "href" text,
  "importance" double precision,
  "read" boolean,
  "pushed" boolean,
  "created_at" text
);
alter table public.notifications enable row level security;

create table if not exists public.push_subscriptions (
  "id" text primary key,
  "endpoint" text,
  "p256dh" text,
  "auth" text,
  "created_at" text
);
alter table public.push_subscriptions enable row level security;

create table if not exists public.files (
  "id" text primary key,
  "mime" text,
  "size" double precision,
  "data" text,
  "storage_path" text,
  "created_at" text
);
alter table public.files enable row level security;

create index if not exists tasks_status_idx on public.tasks (status, scheduled_for);
create index if not exists steps_task_idx on public.task_steps (task_id);
create index if not exists logs_task_idx on public.task_logs (task_id, at);
create index if not exists usage_created_idx on public.usage (created_at);
create index if not exists stories_edition_idx on public.stories (edition_id);

-- Private bucket for wardrobe photos and generated images.
insert into storage.buckets (id, name, public) values ('sean-os', 'sean-os', false) on conflict (id) do nothing;
