# Founder OS: how it fits into SEAN OS

Founder OS is a new section of SEAN OS (`/founder`), not a separate app. It adds tables, agents, workflows and screens, and reuses everything that already exists:

| SEAN OS piece | How Founder OS uses it |
| --- | --- |
| **Auth & middleware** (`middleware.ts`) | Same single-owner session. Every `/founder` page and `/api/founder/*` route sits behind it. |
| **Data layer** (`lib/db`) | New tables in the same `Tables` map, so they work with the local JSON store and Supabase (`supabase/migrations/0005_founder_os.sql`). |
| **Task engine** (`lib/engine/jobs.ts`) | Every agent job is a durable task: leased, resumable steps, retries with backoff, cost tracking, logs, statuses, emergency stop. |
| **Agents & memory** (`lib/ai`) | Seven new specialists join the roster. They're coordinated by the existing Chief of Staff and share memory scopes. Venture work stays separate from Calm work. |
| **Source verification** (`SourceVerifier`) | Investors, competitors and market claims must cite URLs found in that task's web search. Otherwise they're dropped or downgraded to "estimate". |
| **Approvals, audit log, autonomy** | Investor outreach is drafted as a document for you to review and send yourself; nothing is ever sent. Model edits, cap-table changes, pipeline moves, merges and stage changes are written to the audit trail. |
| **Automations & heartbeat** | Founder briefing (daily 06:10) and venture review (weekly, Monday 07:00) are real scheduled jobs behind Autopilot. The review flags stalled ventures, due investor follow-ups and costs running above the model. |
| **Council & Future Engine** | The Copilot can put a venture decision to the Intelligence Council or model a what-if in the Future Engine. Ideas-to-venture linking and knowledge-graph projection of ventures are planned (phase 2). |
| **Design system** | Same tokens, typography, cards, sheets and tab patterns; charts follow the validated palette. |

## What's new

* **Tables**:
  * `ventures` (proposed records, never presented as incorporated companies)
  * `venture_docs` (strategy, funding plan, memo, deck, checklists, with versions)
  * `venture_tasks` (30/60/90-day plan)
  * `fin_models` and `fin_model_versions`
  * `cap_tables`
  * `investors` and `investor_pipeline`
  * `copilot_messages`
  * `credentials` (encrypted)
* **Financial engine** (`lib/founder/finmodel.ts`): a driver-based monthly model with stated formulas covering subscriptions, advertising, licensing, merchandise, B2B, cost of goods, AI and infrastructure costs, team, operating costs and marketing. It produces burn, runway, break-even, funding need, LTV, CAC and payback, with base, upside and downside scenarios. It's GBP or USD with a dated exchange rate, versioned, and exportable to CSV.
* **Cap table** (`lib/founder/captable.ts`): round simulator covering pre-money, raise amount, option-pool top-up, price per share, dilution per holder, and the "sell 15%" maths. It always separates valuation, paper value and personal wealth.
* **Integrations**:
  * Frankfurter for ECB exchange rates (no key needed).
  * Companies House for checking UK company names. It needs an API key, which is stored encrypted with AES-256-GCM.
* **Workflows**:
  * `venture_build`, the end-to-end business build (also used by idea-to-business)
  * `cfo_model`, `investor_research` and `fundraising_plan`
  * `founder_briefing` and `venture_review`
  * `commercial_analysis`
  * `copilot`, a conversational partner that can create real records through a whitelist of internal actions

## Guarantees

* Venture records start as **proposed concepts**. Ownership, IP, licensing and confidentiality are tracked, and possible conflicts with Calm are flagged for professional review.
* Every number carries a basis: **verified** (sourced or entered actuals), **estimate**, **forecast** (model output) or **scenario**.
* Investors are kept only with a verified source. Cheque sizes are shown only when a source states them. A warm intro is shown only when one is recorded.
* Generated legal, tax and investment guidance is labelled as needing qualified review.
* Nothing external happens without approval: no emails sent, money committed, agreements signed or filings made.

## Screens

* `/founder`: the AI Cofounder dashboard. It has the briefing, forecast revenue (labelled), active ventures, cash from your actuals, the next funding target, meetings from your calendar, ventures by stage, financial overview by stream, the fundraising pipeline, upcoming tasks, the Copilot, real agent activity, investor opportunities and Calmlings partnerships. Calmlings partnerships are labelled as Calm work.
* `/founder/v/:id`: the venture workspace. Tabs are Overview, Strategy (every field editable), Finance (live model editor), Funding, Investors, Tasks, Risks & legal, Docs and History.
  * Finance: drivers by basis, base/downside/upside overrides, opex, team, startup costs, funding, actuals, formulas, versions with restore, and CSV export.
  * Funding: plan, readiness, data room, round simulator, cap table, deck, memo and FAQ.
  * Tasks: the 30/60/90-day plan, with Delegate.
  * Risks & legal: ownership, IP, conflicts, the legal checklist and a Companies House name check.
* `/founder/investors`: investor CRM across ventures.
* `/founder/copilot`: full-screen Copilot.
* `/founder/new`: idea to business.

## Phases

1. **Done, vertical slice**: data model, financial engine, cap table, the end-to-end Webster build, Copilot, dashboard, workspace and CRM. Tested in `tests/founder.test.ts`.
2. **Next**:
   * Term-sheet comparison and negotiation prep, built on the cap-table maths.
   * Meeting prep for investor meetings, reusing calendar prep.
   * Follow-up reminders from `follow_up_at`.
3. Growth and BD agents: launch experiments with tracked metrics, partner discovery for independent ventures (Calmlings stays in its own workspace).
4. Funding-opportunity discovery (grants, accelerators, competitions) with deadline tracking, and a monthly forecast-vs-actuals refresh.
5. Optional integrations, each only with your authorisation:
   * Stripe or bank feeds for actuals.
   * A Google Sheets export.
   * Gmail, used for drafts only.
