-- Life HQ assistant (run after 0007): diary suggestions that wait for Sean's approval, routine and notification settings.

create table if not exists public.pa_proposals (
  "id" text primary key,
  "message_id" text,
  "kind" text,
  "title" text,
  "start" text,
  "end" text,
  "event_id" text,
  "reason" text,
  "request" jsonb,
  "status" text,
  "result" text,
  "created_at" text,
  "decided_at" text
);
alter table public.pa_proposals enable row level security;
create index if not exists pa_proposals_message on public.pa_proposals ("message_id");
create index if not exists pa_proposals_status on public.pa_proposals ("status");

alter table public.events add column if not exists "created_by" text;
alter table public.life_hq add column if not exists "routine" jsonb;
alter table public.settings add column if not exists "pa_notifications" boolean;
alter table public.settings add column if not exists "calendar_synced_at" text;
