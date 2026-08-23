# Signalcraft — build notes

> Running log from the first commit. This file becomes the article.
> Undercurrent's notes live in `docs/undercurrent/NOTES.md` — same voice, previous build.

## Sun 2026-08-23 — planning

- **Fork method.** GitHub won't fork a repo into the same account, so Signalcraft is a
  fresh clone of Undercurrent with the remote swapped to `SergioB03/Signalcraft`. Full
  commit history carries over, which is what "forked from" should mean. Undercurrent's
  remote was removed from this clone so nothing can be pushed there by accident.
- **Undercurrent never shipped a scheduler.** EventBridge was Tier 3 there and got cut;
  the report Lambda is triggered by a DynamoDB stream on `ReportRequest`. So the nightly
  tick is genuinely new here and is the first thing to prove, not the last.
- **Where "power" comes from — the decision that makes the rule enforceable.** Undercurrent
  splits every check-in into two rows: `Ping` (score, no author) and `PingReceipt`
  (author + dayKey, no score). Mood lives in one table, participation in the other.
  Scrap's power is computed from `PingReceipt` only — unique `userId`s in the rolling
  window — by a `compute-power` Lambda that never touches `Ping`. It isn't that the code
  *chooses* not to look at scores; the table it reads doesn't contain any. The river
  (mood, from `Ping`) and Scrap (signal, from `PingReceipt`) are two materialized views
  over the same anonymity split.
- **AWS CLI session expired.** `aws login` session from Aug 21 now fails with a cache-key
  error; every account check (budgets, schedules, Amplify apps) is blocked until
  `aws login` is re-run. Step 0 of the plan.
- **Scrap as SVG-in-React, not `<canvas>`.** §6 allows "canvas/SVG". Named `<g>` parts
  with state-driven attributes and CSS-variable fills give theme re-tinting and
  `prefers-reduced-motion` for free via CSS, and the state→attribute mapping is the
  React lesson (declarative rendering). The river canvas stays as the scene behind him.
- **Undercurrent docs moved to `docs/undercurrent/`** (notes, article, architecture,
  demo script, design brief, screenshots, original CLAUDE.md and README) so the new
  docs start clean and the "what carries over" section can cite them.
- **Scheduler construct verified before writing a line.** `aws-cdk-lib@2.266.0` (what
  `npm install` resolved from the lockfile) exports the stable EventBridge Scheduler L2:
  `Schedule` + `ScheduleExpression.cron()/rate()` from `aws-cdk-lib/aws-scheduler` and
  `LambdaInvoke` from `aws-cdk-lib/aws-scheduler-targets`. That's ~15 lines in
  `backend.ts` next to the existing `reportFn` — same stack, same IAM shape. Amplify's
  own `defineFunction({ schedule })` also exists but only for TypeScript functions, and
  the Bedrock path we trust on this account is the Python one, so custom CDK wins this
  once (§10 exception, noted here on purpose). Prove-it plan: `rate(5 minutes)` first,
  watch a real LogEntry land, then switch to the nightly cron.
- **Fresh clone doesn't build until `amplify_outputs.json` exists.** It's gitignored and
  generated — by `npx ampx sandbox` locally or by `ampx pipeline-deploy` in Amplify CI.
  With a stub in place the whole codebase type-checks and `vite build` succeeds, so the
  fork is sound; the first real local run needs `aws login` then `npx ampx sandbox`
  (or `npx ampx generate outputs --app-id <id> --branch main` once the Amplify app exists).
- **Fork verified locally:** with a stub `amplify_outputs.json`, `tsc -b && vite build`
  passes (`✓ built in 1.28s`). Only warning is the pre-existing >500 kB chunk — gsap +
  aws-amplify in one bundle; not worth touching this weekend.
- **Hidden cost found in the docs: a new Amplify app means a new Cognito user pool.** The six
  Undercurrent demo accounts (`demo1..demo5@undercurrent.local`, `dev@undercurrent.local`)
  and their group assignments don't carry over. Recreating them by hand in the console is
  20 minutes of clicking; scripting it with `aws cognito-idp admin-create-user` +
  `admin-set-user-password --permanent` + `admin-add-user-to-group` against the new pool
  id (from `amplify_outputs.json`) is 5 minutes and repeatable. Goes into step 1.
- **Bedrock gates carry over.** Account verification and the Anthropic use-case form are
  account-level, not app-level, so Signalcraft skips both waits — still confirm with one
  10-second CLI `converse` call before writing the log Lambda, as Undercurrent's notes advise.
- **Marketing package drafted before a line of feature code.** `docs/marketing/` holds
  positioning, Scrap's voice guide (goes verbatim into the Bedrock prompt), UI microcopy,
  and the posts; `docs/article.md` is the qualifying-article skeleton with `[TODO]`s for
  facts only the build can supply; `docs/demo-script.md` is the 75-second shot list.
  The point of doing it first: the copy now constrains the build (captions per power
  state, seeded-entry label, footer line) instead of being reverse-engineered Sunday night.
- **Plan review (three independent designs, one judge) changed four things.** (1) Power was
  only recomputed on `PingReceipt` stream events and receipts have no TTL, so Scrap would
  never have powered down — the rolling window didn't roll. Fix: an `HourlyPowerTick`
  EventBridge schedule invokes `compute-power` with `{source:'scheduler'}`. That tick is
  the code that makes "he only runs low when nobody says anything" true. (2) `zoneinfo`
  isn't available in the boto3-only Python 3.12 runtime (no tzdata, no pip), so `dayKey`
  uses a fixed -4h offset (EDT holds through Aug 30) plus -6h so the 00:30 ET run keys to
  the day that just ended; the Scheduler's own `timeZone` handles the cron. Concept-build
  shortcut, stated as such. (3) Nightly cron moves to 00:30 ET so the first autonomous
  entry lands before Monday's deadline and can be shown. (4) Delete the sandbox after
  production verification so exactly one `NightlyLog` fires. Also adopted: a `seeded`
  flag on `LogEntry` with a badge in the UI, `powerStateFor()` with one parameter + a unit
  test + a grep guard (`npm run check:power`) so "power never sees a score" is a command,
  thresholds lowered to 0/1/2/3-4/5+ for a five-person cast, and `checkin-as.ts` because
  five browsers is not a demo plan.
- **Undercurrent stays intact.** Nothing deleted — river, WeatherState, ReportPanel, sim
  mode (hidden behind an explicit opt-in). Additive delta only; the river doubles as the
  on-screen proof that mood and power are different things.
- **Completeness critic, second pass.** Transferred: (1) the ping → check-in rename now
  lists every rendered string by line, with `grep "ping" src/App.tsx` as the done-when;
  (2) a human submits a check-in from the real form on the live URL before the recording
  — scripts had been the only proof; (3) push after steps 3 and 4 and confirm the Amplify
  job succeeds, so a service-role problem with the scheduler surfaces at 1 PM, not 8 PM;
  (4) budget notifications spelled out (ACTUAL 80, ACTUAL 100, FORECASTED 100 — forecast
  alerts are inert on a new account, so the ACTUAL ones are the real guard);
  (5) the backfill path refuses any dayKey at or after today so it can never pre-empt the
  scheduler's entry, and Steve gets that as a third question; (6) Scrap's `expression`
  is wired from the river's weather (rough/storm → concerned) — mood reaches his face,
  never his power, which is exactly what §6 allows and gives the article a line;
  (7) copy honesty: "one sort key" → one composite id and a conditional write; "exactly
  three things" → four; "Sunday afternoon" → evening; the first autonomous entry is
  *scheduled* until Monday's paste proves it; teardown names both schedules.
- **Cut, stated:** §7's "power state history" is not in the nightly aggregates — the
  entry carries the day's final power state only. The article must not claim more.
