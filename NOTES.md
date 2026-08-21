# Undercurrent — Build Notes

Running log of decisions, dead ends, and fixes. This file becomes the challenge article.
Newest entries at the bottom of each session.

---

## Session 1 — Wed Aug 20 (evening)

### Decision: Python for the Bedrock report Lambda only; TypeScript everywhere else

The developer's goal for this project includes getting more fluent in Python. The
tension: Amplify Gen 2's backend is TypeScript-defined, and its native `defineFunction`
path is Node-only — Python enters only through a CDK escape hatch.

Chosen split:

- **TypeScript:** all Amplify backend definitions, the weather aggregation Lambda, and
  the React frontend. The weather Lambda sits on the hot path and must call an AppSync
  mutation via Amplify's IAM-authed data client so the `WeatherState` subscription
  actually fires — hand-signing GraphQL requests from Python the night before deadline
  is how demos die.
- **Python 3.12:** the Bedrock "current report" Lambda. It is off the demo's critical
  path (on-demand button, Tier 2), needs only boto3 (already in the Lambda runtime, so
  zero packaging pain on Windows), and if it slips, Tier 1 is untouched.

Rejected: full-Python backend (would abandon AppSync subscriptions — the heart of the
app), and Python for both Lambdas (~2–4h of extra IAM/wiring on the riskiest wire in
the system).

### Decision: Mermaid for architecture diagrams

Diagrams live in `docs/architecture.md` as Mermaid blocks: GitHub renders them natively,
they're diffable text (good for the article's commit log), and they cost zero
dependencies.

### Environment facts (as found)

- Windows 11, Node v24, npm 11, Python 3.12.5 (via `py` launcher).
- Git repo with GitHub remote already in place (`SergioB03/Undercurrent`).
- AWS account exists but this machine had never used it: no AWS CLI, no credentials.
  CLI installed via winget; credentials + Amplify Hosting connection are the first
  console tasks.

### Bug: first Amplify build failed — lockfile out of sync with npm ci

First CI build failed in ~60s: `npm ci` rejected `package-lock.json` ("Missing:
@opentelemetry/core@2.0.0 from lock file"). Regenerating the lockfile from a clean
slate (`rm package-lock.json node_modules; npm install`) did NOT fix it — `npm ci`
then reported ~60 missing entries, all transitive deps of the AWS CDK toolchain.
Root cause: a known npm bug where the lockfile omits *bundled dependencies'*
subtrees, so `npm ci`'s strict sync check fails on a lockfile npm itself just wrote.
Reproduced identically on Windows-local and Amazon-Linux-CI, ruling out an
environment mismatch.

Fix: `amplify.yml` at repo root overrides the build to use `npm install` instead of
`npm ci`. Tradeoff accepted and logged: slightly weaker build reproducibility in
exchange for an unblocked pipeline, per the "simpler version after 30 minutes" rule.
Lesson: `npm install` resolves and may update the lockfile; `npm ci` installs exactly
the lockfile or refuses — CI uses the strict one so builds can't drift.

### Milestone: pipeline green

Build #2 succeeded after the amplify.yml fix; the live URL serves the app. Per the
spec's gate, feature work started only after this point.

### Backend implemented: schema, weather Lambda, stream wiring

- **One-ping-per-day via deterministic id.** PingReceipt's id is
  `${userId}#${dayKey}`. Amplify's create mutation carries a built-in
  `attribute_not_exists(id)` condition, so the second receipt of a day is rejected
  by DynamoDB itself — uniqueness enforcement with zero custom resolver code.
- **Known gap, logged honestly:** the receipt+ping pair is orchestrated by the
  client, so a hand-crafted API call could create a Ping without a receipt. Full
  enforcement needs a custom mutation doing both writes server-side — Tier 2
  hardening if time allows; the article should mention it either way.
- **Weather trigger = DynamoDB stream → Lambda**, the documented Gen 2 pattern
  (EventSourceMapping + stream-read policy in backend.ts). The Lambda then updates
  WeatherState **through an AppSync mutation with IAM auth** — never a direct
  table write, because subscriptions only fire on mutations through AppSync.
- **Circular-dependency gotcha:** a function that both reads the data API and is
  triggered by a data-stack table stream must live in the data stack —
  `resourceGroupName: 'data'` on defineFunction. Without it, CDK stack A needs B
  and B needs A, and the deploy fails.
- **Anonymity floor server-side:** below 5 pings the Lambda publishes scene
  `gathering` with the ping count but a null average — a 2-ping average is close
  to an individual answer, so it never leaves the server.
- **Realtime proof as a script, not an eyeball test:** scripts/prove-realtime.ts
  signs in, subscribes to WeatherState, submits a ping, and fails loudly if no
  subscription event lands within 30s. Repeatable evidence for the riskiest wire.

### Hardening: pings are now create-only for humans

Came out of a design-review discussion: no client code ever reads raw pings (the UI
reads WeatherState; the weather Lambda reads pings via its IAM resource grant), so
member read access on Ping was unnecessary. Tightened to `create` only — least
privilege. Anonymity never depended on this (Ping stores no userId), but unused
permissions are the kind that bite later. Revisit if the Tier-3 history sparkline
ever needs client-side ping reads.

### Session 2 (started same night, hours ahead): the river renders

- Canvas river: six scenes driven by one severity scalar (0–1) — wave amplitude,
  water speed, cloud cover, rain, lightning, and avatar bobbing all read the same
  number, so the scene feels connected instead of six unrelated animations. Scene
  changes tween over 2s from wherever the current tween is (never snap, never
  restart). Reduced motion: still frames with a crossfade, no rain or lightning.
- Avatars: fixed slots ordered by membership creation; six poses drawn as canvas
  primitives (no assets). Membership auto-created on first sign-in with a
  deterministic id (`teamId#userId`) — the same conditional-create trick as
  receipts, this time defusing React StrictMode's double-effect race.
- Theme toggle: CSS custom properties as *roles* (--silt is "ground", --foam is
  "text"); light theme is one data-theme attribute flip. Canvas colors stay
  absolute — a storm is dark in either theme; the chrome themes around the river.
- Verified with headless Edge (Playwright, --no-save): screenshots of both themes,
  and the two-window pose-sync proof — demo1 switched to coconut mode in window A,
  window B rendered it via the Membership subscription. Weather + poses both
  proven live end-to-end.
- Watch item: an occasional stray HTTP 400 in the console during first sign-in
  (membership-creation race absorbed by the conditional create; benign but worth
  a look before submission).

### The Bedrock report — Python slice, and an account-verification ambush

- **Blocker found early (spec §10 vindicated):** every Bedrock invoke returns
  AccessDenied — not model access, but *new-AWS-account verification* ("normally
  takes less than 2 hours"). Nothing to fix; only to wait. Found it with a
  10-second CLI test *before* writing the Lambda, so the feature gets built now
  and lights up when AWS finishes verifying. If this had been discovered through
  the app tomorrow it would have looked like a mysterious Lambda bug.
- **Architecture: the button is a database row.** Lead presses "generate" → the
  client creates a ReportRequest → that table's stream triggers the Python 3.12
  Lambda → it aggregates pings (counts, daily averages, deduped + shuffled
  notes — never authors, which don't exist), calls Claude via Bedrock's Converse
  API (boto3-native, zero pip dependencies), and writes the Report row straight
  to DynamoDB. The lead's browser *polls* for it — a deliberate exception to our
  realtime religion, because direct DynamoDB writes don't fire subscriptions and
  hand-signing AppSync calls from Python wasn't worth it for a lead-only,
  once-a-week surface. Tradeoff logged, demo unaffected.
- **Model: Claude Opus 5** (`us.anthropic.claude-opus-5` inference profile) per
  current guidance — at ~one 500-token report on demand, model cost is noise.
- Seed script added (Tier 2 #12) — and it works through exactly the
  client-orchestration gap we logged earlier (pings without receipts), which is
  both convenient tonight and exhibit A for the article's honesty section.

### Decision: scaffold = Vite template + `create-amplify` on top

`npm create vite@latest` (react-ts template) into a temp dir merged into the repo root
(the root wasn't empty — LICENSE, .gitignore), then `npm create amplify@latest` to add
the `amplify/` backend folder. Kept the repo's existing comprehensive Node .gitignore
and appended Amplify-specific entries instead of taking Vite's smaller one.