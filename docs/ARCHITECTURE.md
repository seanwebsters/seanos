# Architecture

```
src/
  app/                 Next.js App Router: screens (server components) + API routes
  components/          Design system (ui.tsx, server), interactions (client.tsx), Deck, Icon
  lib/
    db/                Table types, local JSON store, Supabase adapter (same interface)
    ai/                Agents (15), Claude transport + cost + budget, memory context with scope rules
    engine/
      jobs.ts          Task queue: leases, resumable steps, retries with backoff, logs, approvals, notifications
      schedule.ts      London-time schedules for automations
      workflows/       Newsroom, People, Calmlings, Studio, Opportunities, Life, General (delegation)
    integrations/      Weather (Open-Meteo), ICS calendar, Web Push, fal.ai images, og:image, file storage
    services/          Home aggregation, agent state, notifications, editable-entity whitelist
  middleware.ts        Single-owner passcode session (HMAC cookie)
  instrumentation*.ts  30-second background worker on long-running servers
supabase/migrations/   PostgreSQL schema (RLS on, no anon policies)
public/                Manifest, icons, service worker (offline + push)
```

## The engine

A **task** has a `kind` (a registered workflow), parameters, an optional `context_ref` (the story, person, idea… it's about), status, progress, deliverables, citations and cost.

* `createTask` queues it and wakes the worker. `tick()` claims due tasks (2 at a time) with a 15-minute lease.
* A workflow calls `ctx.step(agent, title, fn)` for each unit of work. Finished steps are stored, so a retry **resumes** instead of re-paying for them.
* `BlockedError` (missing key, budget hit, agent switched off) parks the task as **blocked** and notifies you. `RetryableError` and network errors retry after 1, 5 and 20 minutes. Anything else fails with the message.
* Outbound-capable output (drafts, outreach) creates an **approval**. The task stays `awaiting_approval` until every approval it created is decided.
* Every Claude call writes a `usage` row: model, tokens, searches and cost. Budgets are checked before each call.

**Delegation** (`freeform`): the Chief of Staff turns your sentence into a plan of 1–4 steps across capabilities (research, find people, partner discovery, partnership pack, content, London, trends, ideas, speaking, shopping, write, deck). Each step runs the matching workflow or writes a document, with earlier results passed forward. Recurring phrasing creates an automation.

**Multi-agent collaboration** examples:
* Calmlings: Partnership Director (discovery, web) → Creative Director (concepts) → Business Strategist (commercials) → BD Agent (contacts + outreach, web) → Creative Director (deck) → images.
* Morning: Editor-in-Chief (3 research passes + front page) → Networking (Daily Three) → Stylist (weather + calendar + wardrobe) → Chief of Staff (priorities + opportunity picks).
* Opportunity Engine: the Chief of Staff receives a coded inventory of recent trends, ideas, people, events and partnerships, and can only link real item codes. Bundles need at least two item types, and each action becomes a real task when you tap Delegate.

## Truthfulness

`SourceVerifier` collects every URL from the `web_search_tool_result` blocks of the current task. Citations must match a found page (normalised). Profiles, contacts and submission links must match a page or a host seen in results. Items left without sources are dropped and the drop is logged. Trend momentum is capped at 3/5 without measured evidence. Speaking events in the past, or with passed deadlines and no rolling route, are removed. "Verified" commercial estimates without a matching source are downgraded to illustrative.

## Privacy

Memory has a `scope`. `buildContext(agent)` filters memories by the agent's allowed scopes, so the content and personal-brand agents never see `work`. Reports inherit the subject's scope. The Studio's source material excludes work reports and partnerships. All data access goes through the server: Supabase is used with the service-role key server-side and RLS blocks the anon key.

## Native iOS later

The UI talks to plain JSON routes (`/api/tasks`, `/api/entity/:table/:id`, `/api/approvals/:id`, `/api/feedback`, `/api/live`) and the engine is UI-agnostic, so a SwiftUI client can reuse the same backend with a token in place of the cookie.
