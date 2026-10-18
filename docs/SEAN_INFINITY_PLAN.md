# SEAN ∞: implementation plan

SEAN ∞ is a layer on top of SEAN OS, not a new product. It reuses the existing pieces:

* **Engine** (`lib/engine/jobs.ts`): durable tasks, resumable steps, retries, cost tracking, approvals and notifications.
* **Agents and memory** (`lib/ai/*`): scope-separated context, budget caps.
* **Data layer** (`lib/db`): the local JSON store or Supabase, behind one interface.
* **Design system** (`components/ui.tsx`, `components/client.tsx`).

Every phase below adds tables, workflows and screens that plug into those. Nothing is simulated: an empty graph shows as empty, and a run with nothing worth saying says so.

## Architecture

```
Existing records ──projection──▶ ┌──────────────────────────┐ ◀──extraction── stories, reports, notes, memories
(people, partnerships, ideas,    │  World Model (graph)     │   (Curator agent, provenance + confidence)
 trends, speaking, goals, …)     │  graph_nodes / graph_edges│
                                 │  graph_conflicts / ingest │──▶ search (BM25 + optional embeddings)
                                 └────────────┬─────────────┘──▶ queries: neighbourhood, paths, overlaps,
                                              │                   helpers, changes, convergences
                     ┌────────────────────────┼─────────────────────────┐
                     ▼                        ▼                         ▼
             Strategy Engine          What am I missing?          Ask your world
   ambition → strategy → objective   signals + evidence pack     retrieval → grounded answer
   → initiative → project → tasks    → findings (or none)        with node citations
                     │                        │
                     └──────▶ Next Best Move ◀┘   (all gated by autonomy level, halt switch, audit log)
```

## Phases

| # | Phase | Status |
| --- | --- | --- |
| 1 | **Personal World Model**: persistent graph, projection of existing records, LLM entity and relationship extraction with provenance and confidence, entity resolution, contradiction detection, corrections (edit, merge, verify, retract, hide), privacy scopes, temporal fields, hybrid search, graph queries, visual explorer, "Ask your world" | **This slice** |
| 2 | **Goals, Missions and Strategy Engine**: ambitions decomposed into strategies, objectives with metrics, initiatives, projects and actions (tasks); approval before work starts; autonomy-gated execution; progress roll-up; weekly strategic review (progress, blockers, new information, stop doing, highest-leverage action) | **This slice** |
| 2b | **What am I missing?** and **Next Best Move**: deterministic signals (convergences, idea overlaps, neglected objectives, goal-vs-action contradictions, approaching deadlines, conflicts) plus an evidence pack. The model may return zero findings. | **This slice** |
| 2c | **Trust**: autonomy levels 1–5, emergency stop, audit log, graph export and delete | **This slice** |
| 3 | **Intelligence Council**: research the unknowns, run 7 independent structured critiques, find the disagreements, synthesise, say what would change our mind; decisions teach the strategic twin. **Future Engine**: four scenario paths over a transparent monthly cash-flow and time model, with sourced or estimated assumptions, sensitivity and live sliders | **Done** |
| 4 | Continuous opportunity discovery: discovery workflows write straight into the graph, convergence scoring by evidence, fit, feasibility, timing and impact; synthesis packs (idea, Calmlings angle, collaborator, article, pitch, prototype) | Next |
| 5 | Parallel Venture Lab: experiments with their own budgets, stages from discovery to launch or rejection, landing-page and prototype generation (publishing gated), evidence tracking with no invented validation | Later |
| 6 | Organisation Generator: dynamic teams with roles, workstreams and a coordinator, built on the existing task engine, with pause, redirect and terminate | Later |
| 7 | Ambient intelligence (calendar exists; email, notes and documents via OAuth connectors) and the Capability Accelerator (skill plans, pitch simulations) | Later |
| 8 | Full ∞ Mode: Future Paths, Venture Lab, Council and Compounding panels added to the command centre built in this slice | Grows with each phase |

## This slice in detail

**Data** (migration `0003_infinity.sql`)
* `graph_nodes`: type, name, aliases, summary, attributes, scope, confidence, sources (provenance), record_ref (link to the SEAN OS record it mirrors), first and last seen, status (active, hidden, merged), verified, embedding (optional).
* `graph_edges`: from, to, type, label, confidence, sources, valid_from and valid_to, first and last seen, status (active, retracted).
* `graph_conflicts`: contradictions and their resolution.
* `graph_ingest`: which source records have been extracted, and at which content hash.
* `ambitions`, `strategy_items` (hierarchy with metrics), `strategy_reviews`.
* `insights`: What am I missing? findings and Next Best Move, with evidence and status.
* `audit_log`: every consequential change, with who made it.
* `settings.autonomy_level`, `settings.halted`.

**Truthfulness rules**
* Extracted facts must quote the source text that supports them. Facts without a quote are discarded.
* An edge's confidence is the extractor's confidence, capped by source type: user-stated 1.0, structured record 0.9, extracted from a cited article ≤ 0.8.
* Findings may only cite evidence IDs from the evidence pack; any other citation is removed, and a finding left with no evidence is dropped.
* Forecasts and estimates are labelled as such and never shown as facts.

**Autonomy levels**
1. **Observe**: research and suggest. No tasks start automatically.
2. **Prepare** (default): approved strategy actions show a "Start" button; drafts need approval.
3. **Execute internally**: approving a project queues its first actions as internal tasks automatically.
4. **External with approval**: as 3. Every outbound item still goes through the approval queue, which is always the case in SEAN OS.
5. **Pre-authorised**: no pre-authorised external operations exist yet, so this behaves like 4. The UI says so.

The emergency stop halts the queue and the scheduler immediately, and running tasks stop at their next step.
