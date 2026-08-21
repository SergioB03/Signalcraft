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
- **Model: Claude Haiku 4.5** (`us.anthropic.claude-haiku-4-5-20251001-v1:0`).
  We wanted Opus 5, but an empirical sweep showed the Opus/Sonnet 5 tiers are
  sales-gated on a brand-new AWS account ("not available for this account,
  contact AWS Sales"). Haiku 4.5 is the most capable Anthropic model the
  account can invoke — and honestly right-sized for a 4-sentence weekly
  summary. Availability constraint, not a cost decision.
- Seed script added (Tier 2 #12) — and it works through exactly the
  client-orchestration gap we logged earlier (pings without receipts), which is
  both convenient tonight and exhibit A for the article's honesty section.

### Pre-submission review: 32 agents, 28 findings, 23 confirmed

Ran a multi-agent adversarial review (four dimension reviewers, every claim
handed to a verifier instructed to refute it). The keepers, all fixed the same
night:

- **Unconfirmed sign-in trap**: Amplify v6's `signIn` *resolves* (doesn't
  throw) for unconfirmed accounts; ignoring `nextStep` mounted the app with no
  session — a permanently dead screen for any judge who abandoned the confirm
  code and came back. Now routed back to the confirm step.
- **Unbounded scores**: nothing stopped a crafted `score: 9999` from pinning
  the weather at "clear". Added schema validation (1–5, note ≤ 140) plus
  defensive clamps in both Lambdas.
- **The 24h TTL ate the weekly report**: pings expired daily, so the 7-day
  report window could never see more than a day. TTL is now 8 days; the
  weather window was always enforced by `createdAt`, so nothing else moved.
- **Report path lacked the anonymity floor**: it would happily summarize 2
  pings — close to individual answers. Now mirrors the weather floor (no
  report under 5 pings; daily averages withheld under 3).
- **Bedrock failure = silent 60s timeout**: now writes a plain-numbers
  fallback report so the lead's button always resolves.
- **UTC day-key**: the ping day rolled at 8 PM ET, so an evening rehearsal
  ping would have blocked the live 3 PM demo ping. Now local-midnight.
- **Light theme swallowed --sun**: focus ring and ping confirmation were
  ~1.3:1 contrast on pale background. Light theme now darkens the accent.
- Smaller: canvas garbling on browser-zoom (stale devicePixelRatio), honest
  error copy in the ping form (transient failures no longer read as "already
  pinged"), weather recompute on TTL expiry so the caption can't go stale,
  the spec's display typeface (Fraunces) actually applied, README replaced,
  docs corrected (report model, function paths, what Bedrock receives).

**Accepted, documented, not fixed** (hackathon scope, honest-article
material): the receipt→ping pair is client-orchestrated, so a hand-crafted
API call can create pings without a receipt (bounded now by score
validation); a hostile signed-up account could pre-create another user's
receipt id or fake Membership rows. Real enforcement means a custom mutation
doing both writes server-side — first item on the post-challenge list.

### Milestone: everything proven in production (Fri ~12:30 AM)

Build #7 deployed the review fixes; both proof scripts then passed against the
production backend itself — realtime (ping → stream → Lambda → subscription in
~1s) and the full report pipeline (button-as-a-row → Python Lambda → Bedrock
Haiku 4.5 → report readable by the lead). Production is seeded past the
anonymity floor and has demo accounts. Every Tier 1 and Tier 2 feature works
on the public URL. Remaining: video, article, submission form.

### Late-night scope round: test environment, team page, five-member cast, design pass

The developer asked for a fuller "shipped app" feel the night before deadline.
Costed each ask against the remaining hours and held the spec's lines
(multi-team / invites stay Tier 3):

- **Tabs without a router.** river / team / report / dev, role-filtered, keyed
  on the URL hash so refresh, back button, and deep links just work. The river
  stays mounted as the hero on every tab — it's the app's thesis, and keeping
  the canvas mounted means tab-switching can't disturb subscriptions or the
  tween.
- **Team page for leads**: roster with poses and join dates, participation in
  the last 24h (a count, never who), and a two-step remove-member action.
  One auth-rule addition: `allow.group('lead').to(['delete'])` on Membership.
- **Test environment**: a `dev` Cognito group and a `resetDemoDay` custom
  mutation backed by a TypeScript Lambda with IAM data access — forget today's
  receipts, wipe the river, or wipe-and-reseed. The in-app dev tab and
  `scripts/reset-demo.ts` call the same mutation. Because Ping deletes flow
  through the table stream (and the weather Lambda now handles REMOVE),
  wiping the river makes the weather recompute itself — no special-casing.
- **Five-member cast** with names and poses (ana the lead, kai, mira, theo,
  june) seeded by signing in as each so Membership rows stay owner-correct.
- **Design pass**: Fraunces display face, pill tabs, card panels on a gradient
  ground, vignette behind the scene name, two-column pose/ping layout, honest
  empty and loading states, light theme with white cards.
- **"Clicking between pages, nothing breaks" as a script**: headless Edge signs
  in as member, lead, and dev; visits every tab forward and back; deep-links
  and refreshes on a non-default tab; toggles theme both ways; round-trips a
  pose change; signs out and back in; and a stranger walks the sign-up form.
  Any console or page error fails the run.

### Milestone: production at parity (Fri ~1 AM)

Build #9 deployed the scope round. Production now has the six accounts (five
cast + dev), their groups, seeded memberships and pings, and every proof
passing against it: realtime, report, reset. The long-running stray console
400 turned out to be Cognito throttling an identity-pool credential exchange
the browser never needed — dropping the identity pool from the client config
removed the call path entirely; the click-through now runs with zero console
errors. Remaining: record the video from docs/demo-script.md, write the
article from this file, submit.

### Decision: scaffold = Vite template + `create-amplify` on top

`npm create vite@latest` (react-ts template) into a temp dir merged into the repo root
(the root wasn't empty — LICENSE, .gitignore), then `npm create amplify@latest` to add
the `amplify/` backend folder. Kept the repo's existing comprehensive Node .gitignore
and appended Amplify-specific entries instead of taking Vite's smaller one.