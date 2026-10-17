# SEAN OS

A private, mobile-first AI organisation for one person. A team of sixteen specialist agents researches, writes, plans and prepares work around the clock, and presents everything for approval. It's an installable PWA with a desktop layout.

**What it does**

* **Home**: a personal HQ that changes through the day. Morning shows the briefing, the edition, three priorities, opportunities, people, the outfit and the calendar. Daytime shows meetings and active work. Evening shows progress, reading and tomorrow.
* **The Edition**: *The Sean Edition*, a daily newspaper researched with live web search. Every story has sources, why it matters, implications and ideas, plus one-tap actions ("Write a LinkedIn post about this", "Find the founder", "How could Calm use this?"). It has a searchable archive and per-section coverage controls.
* **Studio**: drafts in your voice (LinkedIn, X, Instagram carousels, essays, scripts). You can review, edit, approve, reject, schedule and export them. The team learns from your edits and approvals. Nothing is ever posted for you.
* **Calmlings**: partnership discovery. Research, creative concept, commercial models (illustrative vs verified), verified contacts only, outreach, an 8-slide deck and visual mockups. Everything here is kept private as work material.
* **Opportunities**: Trend Radar (weak signals with measured vs anecdotal evidence and capped momentum), the Venture Studio (5–10 ideas a week, fewer if fewer are good), the Speaking Scout (verified dates, deadlines and submission routes; passed deadlines dropped) and the Opportunity Engine, which links trends, ideas, people, events and partnerships into actionable bundles. There's a daily picks rail on Home and a Friday report.
* **People**: ten verified people a week, a Daily Three, casual messages and a private CRM (notes, interactions, reminders, contacted status).
* **Tasks**: delegate anything by typing or speaking. The Chief of Staff plans, assigns specialists and runs them as persistent background jobs, with retries, step logs, citations and cost. You can pause, resume, cancel, retry, repeat and reschedule. Saying "every Monday…" creates an automation.
* **Finance**: a private financial planner and tracker. Import CSV statements from any UK bank (Monzo, Starling, Revolut, HSBC, Barclays, Amex…), with duplicates skipped and transactions auto-categorised by rules and then by the Financial Planner agent. You get monthly budgets with pace warnings, bills and subscriptions (with an audit), savings goals with the monthly amount needed, net worth from your accounts, a six-month cashflow chart and a weekly Money check-in. Upcoming bills appear in your morning briefing. It's general guidance, not regulated advice, and there's no bank connection.
* **Life**: London picks, calendar with meeting prep, fitness log, trips and learning goals.
* **Wardrobe**: photograph your clothes and the stylist catalogues them. A daily outfit is built from live weather, your calendar and what you own. Shopping research uses real links, on a "fewer, better" basis.
* **Agents**: an activity centre derived entirely from real task, step and approval rows. Each agent's instructions, model and on/off switch are editable.
* **Memory**: facts vs inferences, with provenance, confidence and scope (personal / work / public). You can edit, delete and export it. Feedback buttons across the app ("too corporate", "more like this", "don't recommend again") feed back into it.
* **Automations**: real scheduled jobs (morning run, weekly scans, Friday report). Everything is behind an **Autopilot** switch, which is off by default because it spends API credit, and capped by daily and monthly budgets.

## Principles built into the code

* **No fabrication.** Agents must cite URLs that actually appeared in their web-search results for that task. `SourceVerifier` drops anything else: stories, people, trends, events, contacts and competitor links. Deadlines must come from official pages. Estimates are labelled illustrative unless a verified source is attached.
* **No fake activity.** If a key is missing, a task shows as **Blocked** with the exact variable it needs. Agent status, the activity feed and home cards only ever show real rows.
* **No external actions.** Nothing is sent, posted, booked, bought or submitted. "Approve" marks something ready; you copy it, open it in Mail, or submit it yourself.
* **Confidentiality.** Work-scope (Calm Studios) memory only reaches agents that handle work. The personal-brand and content agents never receive it, and content drafted from sources excludes work reports and partnerships.

## Run it locally

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY at minimum
npm run dev                  # http://localhost:3000
```

In development the app is open (no passcode). Data lives in `.data/sean-os.json`.

```bash
npm test          # engine, workflows, privacy, approvals, API whitelist, sessions
npm run typecheck
npm run build
```

## Deploy

### Railway (recommended)

The built-in worker runs every 30 seconds, so scheduled jobs and delegated tasks run continuously.

1. New project → Deploy from GitHub → `seanwebsters/seanos`. It uses the `Dockerfile`.
2. Add a **Volume** (any mount path). Railway exposes it as `RAILWAY_VOLUME_MOUNT_PATH` and the app stores data there.
3. Set the variables `OWNER_PASSCODE`, `SESSION_SECRET` and `ANTHROPIC_API_KEY`, plus any optional ones from `.env.example`.

### Vercel

Vercel works, but it's serverless:

1. Import the repo. The framework is detected as Next.js.
2. **Use Supabase for data.** Vercel's disk is temporary. Create a Supabase project, run `supabase/migrations/0001_init.sql` and then `0002_finance.sql` in the SQL editor, then set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Set `OWNER_PASSCODE`, `SESSION_SECRET`, `ANTHROPIC_API_KEY` and `CRON_SECRET`.
4. Delegated tasks run right after you create them (via `after()`, up to 5 minutes). Scheduled automations run from Vercel Cron, which `vercel.json` sets to once a day at 04:15 UTC (the Hobby plan limit). On Pro you can make it more frequent, e.g. `*/10 * * * *`.

## Integrations

| Integration | Variable(s) | What it enables |
| --- | --- | --- |
| Claude | `ANTHROPIC_API_KEY` | All agents: research with web search, writing, planning, vision tagging |
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | PostgreSQL + private storage bucket (`sean-os`) |
| fal.ai | `FAL_KEY` (`FAL_IMAGE_MODEL`, default `fal-ai/nano-banana`) | Product mockups, campaign visuals, brand boards |
| Web Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Notifications on your phone (on iPhone, add to Home Screen first) |
| Calendar | Settings → private iCal address | Read-only meetings, briefings and meeting prep |
| Weather | none (Open-Meteo) | Outfit and briefing context |
| Gmail / Contacts | not built yet | Needs a Google OAuth app (`GOOGLE_CLIENT_ID`/`SECRET`). For now, reconnection suggestions use your CRM and calendar |

## Cost

All agents default to Claude Opus 5.5, with Haiku 5.5 for quick styling and tagging calls. You can change models per agent or globally in Settings. Default caps are **$5/day and $60/month**. When a cap is hit, tasks pause as blocked instead of overspending. Each automation shows a rough per-run estimate, and every model call is recorded with its cost against its task and agent.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it fits together.
