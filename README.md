# SEAN OS

A private, mobile-first AI organisation for one person. A team of nineteen specialist agents researches, writes, plans and prepares work around the clock, and presents everything for approval. It's an installable PWA with a desktop layout.

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

## LIFE HQ: the home page

Home is **LIFE HQ**, the control centre for your whole life, on one page:
* **Snapshot:** date, weather, role, age and your quote.
* **This week:** your top three priorities and what's coming up today and tomorrow, from your calendar and dated tasks.
* **Life overview:** eight areas with progress bars. Career, Business and Money are worked out from your real numbers:
  * Career: salary against target.
  * Business: revenue recorded in Founder OS, annualised.
  * Money: savings accounts against your goal.

  Health, Home, Friends, Travel and Reputation show your own rating, and say "not rated" until you set one.
* **Calm projects:** photo cards with status and progress, plus a warning when too many are live at once.
* **Founder HQ:** the journey to £100k, which ticks itself off from your ventures.
* **Money & wealth:** savings goal, savings history with a labelled projection, income, expenses and net worth. Personal money only.
* **Life sections:** Health, Home, Friends & family, Travel, Reputation and Journal. Each has its own photo and checklist.
* **The year ahead, quick capture and recent wins.**

Every photo can be replaced with your own. The journal is private: agents don't read it. The old team-focused home is still there as **Team briefing** (`/today`). Run `supabase/migrations/0007_life_hq.sql` on Supabase.

On a phone the tab bar is Life HQ, Founder, Inbox, Agents and More. More groups every other workspace into Build, Create & work, You, Intelligence and System.

## SEAN ∞: the personal intelligence layer

∞ Mode (the **∞** button on Home, or `/infinity`) sits on top of everything above. See [`docs/SEAN_INFINITY_PLAN.md`](docs/SEAN_INFINITY_PLAN.md) for the full eight-phase plan. Built so far:

* **Personal world model**: a persistent knowledge graph of you, your goals, people, companies, projects, ideas, trends, technologies and events.
  * Every SEAN OS record is mirrored into it for free, with no model calls.
  * The World Model Curator extracts entities and relationships from your edition, reports, people, notes and memories. A relationship is only kept when the source contains a verbatim quote supporting it.
  * Every fact carries provenance, confidence and dates. Contradictions (say, two current employers) are flagged for you to settle.
  * You can correct anything: edit, merge, verify, mark as past, mark as wrong, forget, or change privacy scope.
  * Search is BM25, plus Voyage embeddings if `VOYAGE_API_KEY` is set. There's an interactive graph explorer.
  * **Ask your world** answers "What connections am I missing?", "Which of my ideas overlap?", "Who in my network could help with this?" and "What has changed since last month?", citing the entities it used.
* **Convergence detection**: finds the company or technology where your threads meet. For example, a founder who worked with someone you know, a company exhibiting at an event that's taking speakers, and a tool relevant to Calmlings. One tap turns it into a coordinated opportunity.
* **Strategy engine**: give it an ambition ("here's where I want to be in five years").
  * The strategist researches and decomposes it: strategies → objectives (with metrics that can track real counters automatically) → initiatives → projects → actions.
  * A sceptic pass challenges its assumptions. Nothing starts until you approve.
  * Progress rolls up from metrics, sub-items and linked tasks.
  * A weekly strategic review asks what progress you've made, what's blocking you, what's changed, what to stop, and the single highest-leverage action.
* **What am I missing?**: builds an evidence pack from your graph, strategy, work patterns, deadlines, stale approvals and opportunities. Findings must cite that evidence, uncited ones are dropped, and "nothing important enough" is a valid result. Each finding comes with one action you can delegate. It also produces the **Next Best Move**.
* **Intelligence Council**: put an important decision to it.
  * It first researches the three unknowns that matter most, with sources checked.
  * Seven lenses then critique the decision independently, without seeing each other's views: Visionary, Investor, Operator, Creative Director, Researcher, Sceptic and Personal Strategist.
  * A synthesis names the disagreements and trade-offs, gives a recommendation with a confidence level, and says exactly what evidence would change it.
  * When you record your decision, especially one that differs from the council's, it becomes memory, so your strategic twin learns how you weigh things.
* **Future Engine**: ask a "what if" and get conservative, base, optimistic and alternative paths.
  * The numbers come from a transparent monthly cash-flow and time model, never from the model guessing totals.
  * Every input is marked as sourced (with a checked URL), an estimate, or your own value.
  * You can drag any assumption and every path recomputes live. A sensitivity ranking shows which assumptions matter most, and non-financial outcomes are scored separately as labelled judgements.
  * Every view is labelled "model of estimates, not a prediction". One tap sends a scenario to the council.
* **Trust & autonomy**: five autonomy levels (default 2, Prepare), an emergency stop that halts the queue and the scheduler, an audit trail of every consequential change, and graph export and erase.

## Founder OS: your AI cofounder

`/founder` (Workspaces → Founder OS) is the business side of building. See [`docs/FOUNDER_OS.md`](docs/FOUNDER_OS.md).

* **A portfolio of your 16 proposed ventures**: Webster, SleepStories, VoysNote, Moonwilders and others.
  * They're seeded as concepts with ownership "unclear". Possible Calm conflicts are flagged.
  * You can merge, archive, rename and reclassify them.
* **Build the business** (one tap, or from a raw idea): the team runs the whole pipeline. Every result is saved and editable:
  * Strategist: strategy and market research.
  * CFO: a driver-based 36-month model with downside/base/upside cases and funding requirements.
  * Fundraising: a route recommendation, round sizing, readiness checklist, data room, memo, deck and FAQ.
  * Investor Research: a shortlist of investors, each with a verified source.
  * Operations: a 30/60/90-day plan.
  * Legal: an IP and compliance checklist, with ⚖ marking items that need a professional.
  * Chief of Staff: a health score and the three next actions.
* **Financial models are formula-driven and auditable**: every driver is labelled verified, estimate or yours. Every save is a version you can restore, and models export to CSV. GBP and USD use a dated ECB rate. Revenue, valuation and personal wealth are kept apart.
* **The round simulator** covers option-pool shuffle, dilution, price per share and "what does selling 15% mean?". **The investor CRM** tracks stage history. A warm intro shows only when you record one. Outreach is drafts only.
* **The Copilot** is a cofounder you can talk to. It takes only whitelisted internal actions: add a task, change a model driver, start agent work, record a decision or set a stage. It never sends, spends or signs anything.
* **Growth: push an app**: record real installs, sign-ups and revenue, or import a CSV.
  * The Growth Lead writes a launch plan and cheap experiments, with the posts, ads and store listing already drafted.
  * Each experiment starts only when you approve it, under a monthly spend cap you set.
  * Results are scored from your numbers, never by the model.
* **The office**: a 3D black office of your agents at their desks, driven by real task state, so nobody is shown working unless a task is actually running. Tap anyone to see or assign their work.
* **Scheduled work**: a daily founder briefing and a weekly venture review that flags stalled ventures, follow-ups and costs above plan.

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
2. **Use Supabase for data.** Vercel's disk is temporary. Create a Supabase project, run `supabase/migrations/0001_init.sql` and then `0002_finance.sql`, `0003_infinity.sql`, `0004_council_future.sql`, `0005_founder_os.sql` and `0006_growth.sql` in the SQL editor, then set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
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
| Voyage AI | `VOYAGE_API_KEY` (`VOYAGE_MODEL`, default `voyage-3.5-lite`) | Optional semantic search in the world model (BM25 works without it) |
| Exchange rates | none (Frankfurter / ECB) | Dated GBP↔USD rate for Founder OS models |
| Companies House | `COMPANIES_HOUSE_API_KEY`, or add it in a venture's Risks & legal tab (stored encrypted) | Live UK company-name checks |
| Credential vault | `CREDENTIALS_KEY` (optional; otherwise derived from `SESSION_SECRET`) | AES-256-GCM encryption for keys you add in the app |
| Gmail / Contacts | not built yet | Needs a Google OAuth app (`GOOGLE_CLIENT_ID`/`SECRET`). For now, reconnection suggestions use your CRM and calendar |

## Cost

All agents default to Claude Opus 5.5, with Haiku 5.5 for quick styling and tagging calls. You can change models per agent or globally in Settings. Default caps are **$5/day and $60/month**. When a cap is hit, tasks pause as blocked instead of overspending. Each automation shows a rough per-run estimate, and every model call is recorded with its cost against its task and agent.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it fits together.
