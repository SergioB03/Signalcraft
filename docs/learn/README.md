# Learn mode — React + system design, one concept per step

**Goal:** come out of this weekend able to explain *why* each piece of Signalcraft is built the
way it is — in React terms and in system-design terms — using the real files.

## How it works (mechanics, not vibes)

1. **CLAUDE.md §11 turns it on.** After each PLAN.md step the session appends a short entry
   to `docs/learn/JOURNAL.md` (React concept, system-design concept, one check question, one
   "at scale" line). Small steps: the main session writes it inline (no extra context cost).
   Steps touching more than ~3 files: spawn the `tutor` agent (cheap model, reads only the diff).
2. **You answer the check question** in the journal, under the entry, in your own words.
3. **Next session opens with a 2-minute review:** "grade my journal answers" — Claude reads
   only `JOURNAL.md`, corrects misconceptions, moves on. That's the whole loop.
4. **On demand:** `use the tutor agent to explain <thing> properly` for a deeper dive.

Rule for the explanations: anchor to a `file:line`, quote ≤5 lines, name the concept the way
the docs name it, no lectures. If a concept was already covered, link back instead of repeating.

## Syllabus (mirrors PLAN.md steps)

| Step | React concept | System-design concept |
|---|---|---|
| 0 · `aws login`, sandbox, outputs | — | **Environments & generated config.** `amplify_outputs.json` is the contract between backend and frontend; sandbox vs pipeline are two deployments of one definition. |
| 1 · New Amplify app, deploy green | — | **Deploy first / pipelines as insurance.** A broken pipeline found at hour 20 is a failed submission. IaC: the backend is TypeScript that *describes* infrastructure. |
| 2 · Rename ping → check-in (UI only) | **Props vs state; copy is not behavior.** Renaming labels without touching the data flow shows where the boundary between presentation and logic sits in `PingForm`. | **API compatibility.** Schema names stay; the UI vocabulary changes. Renaming a model would mean a migration. |
| 3 · `Robot` + `LogEntry` models, `compute-power`, subscription | **Effects with cleanup; derived state.** `observeQuery` in a mount-only `useEffect` with `unsubscribe()`; `powerState` is *derived* from a count, never stored twice on the client. | **Materialized view + event-driven fan-out + least privilege as enforcement.** DynamoDB stream → Lambda → AppSync mutation → subscription. The power Lambda reads only `PingReceipt` (no scores exist there): the rule is enforced by *what the table contains*, not by a comment. |
| 4 · EventBridge Scheduler → log Lambda → Bedrock → `LogEntry` | — | **Scheduled agents, idempotency, cost guards.** Cron vs rate; conditional put (`attribute_not_exists(id)`) makes retries safe; one call per group per night + low `max_tokens` + a budget alarm = bounded blast radius. "Prove the riskiest wire first." |
| 5 · Scrap in SVG, five states, theme-aware | **Declarative rendering: state → attributes.** One `<svg>` with named `<g>` parts; `powerState` maps to classes/attributes; CSS variables carry the theme; `prefers-reduced-motion` handled in CSS, not JS. | **Determinism over generation.** Code-drawn character = same robot every night; image models drift. Cheap state changes, zero inference cost. |
| 6 · Log display + backfill script | **Async data in effects; tri-state loading; keyed lists.** `undefined` (loading) / `null` (none) / value; `key={entry.dayKey}`. | **Date-keyed storage as a long-term hedge; honest seeding.** One row per group per day enables memory features later; the backfill is disclosed, not hidden. |
| 7 · Seed demo, footer disclosure, $5 budget | — | **Operational readiness.** Budgets, teardown date in the README, runbooks. An intentional ending is a feature. |
| 8–10 · Demo, article, submit | — | **Communicating architecture.** One diagram, five load-bearing decisions, what you'd change at scale. |

## Concepts you'll be able to explain by Monday

React: props vs state · derived state · effects + cleanup · refs as mutable mirrors (why the
canvas never re-renders) · StrictMode double-invocation · controlled inputs · conditional
rendering with tri-state · declarative SVG · CSS variables for theming · reduced motion.

System design: materialized views · event-driven fan-out · idempotent writes · least privilege
as a correctness tool · scheduled jobs · cost guards · eventual consistency (poll vs subscribe)
· environments and generated config · IaC · teardown plans.
