# Signalcraft — Build Plan

**Now:** Sun 2026-08-23 ≈ 1:30 AM ET · **Deadline:** Mon Aug 24 1:00 PM PT / 4:00 PM ET · **Target submit:** Sun night (Mon morning = verification + buffer) · First 101 qualifying submissions win; no judging.

## Context

You uploaded `CLAUDE-signalcraft.md`: a weekend concept build for the AWS Builder Center *Weekend Creative Agent Challenge*. Scrap, a salvaged robot, is powered by honest check-ins (not mood), and a nightly agent writes his log. It forks Undercurrent and reuses its Amplify Gen 2 backend, Cognito groups, the Ping/PingReceipt anonymity split, and the Python Bedrock Lambda. You asked for: a token-efficient plan, a staff-engineer agent and a marketing agent, AWS services per the spec, a GitHub repo, and a learn mode for React + system design.

**The rule (verbatim from the spec):** *Scrap is powered by honesty, not by happiness.* A terrible day powers him exactly as much as a great one. He only runs low when nobody says anything at all. He never dies — with no signal he powers down and sleeps, and wakes the moment someone checks in.

## State of the repo (do not redo any of this)

- `C:\Users\sergi\Desktop\Signalcraft` = Undercurrent cloned with full history; remote swapped to `https://github.com/SergioB03/Signalcraft.git` (Undercurrent remote removed). `npm install` done; `tsc -b && vite build` passes with a stub outputs file.
- Committed locally: `7b964ff` (fork, `CLAUDE.md` + §11 workflow, `docs/MAP.md`, `PLAN.md`, learn syllabus + journal, `.claude/agents/{staff-engineer,marketing,tutor}.md`, `NOTES.md`), `3825c0c` (`docs/marketing/*`, `docs/article.md` skeleton, `docs/demo-script.md`, `README.md`), `ee4f1da` (this plan after the design review). **Not pushed — the GitHub repo does not exist yet.**
- Verified: `aws-cdk-lib@2.266.0` ships the stable `Schedule` L2 + `ScheduleExpression.cron/rate` + `LambdaInvoke` target.
- **Needs you:** `gh repo create` was denied by the permission classifier. The `aws login` session is expired (every CLI call fails). `aws.exe` is at `C:\Program Files\Amazon\AWSCLIV2\aws.exe`, not on the Git Bash PATH.

## Strategy

Prove the riskiest wire first (EventBridge Scheduler → Lambda → Bedrock → date-keyed `LogEntry`) before any art; art last, because Scrap has the cleanest cut-if-late. **Additive only:** nothing in Undercurrent is deleted — the river, WeatherState, ReportPanel, and simulation mode stay (sim hidden behind an explicit opt-in), so the app keeps working at every commit and the river gives a free demo beat (it can storm while Scrap stays bright: mood ≠ power). Power derives from `PingReceipt` only — the table that physically has no scores — enforced three ways: a pure `powerStateFor(uniqueMembers)` with one parameter, a unit test, and a grep guard. An hourly tick recomputes power so Scrap actually powers down when nobody checks in. Scrap is SVG-in-React: named `<g>` parts, `[data-power]` attribute rules, CSS-variable fills, reduced motion in CSS. One step per Claude Code session, paste-ready prompts, reviews by a cheap subagent, Steve once with two yes/no questions.

## Schedule (relative to your start; clock column assumes 9:30 AM ET)

| # | Slot | Task | Files | Done when | Cut if late |
|---|---|---|---|---|---|
| 0 | T+0:00–0:30 (9:30) | **You:** `aws login`; `gh repo create`; push; new Amplify app in the console. **Claude:** Bedrock smoke test; **$5 budget**; rename | `package.json`, `index.html`, `scripts/budget/*.json` | identity works; `describe-budgets` shows the budget (pasted in NOTES); one CLI `converse` returns text; Amplify build running | — |
| 1 | T+0:30–1:30 (10:00) | Demo cast in the new Cognito pool by CLI; `checkin-as.ts`; emails → `@signalcraft.local` | `scripts/create-cast.sh`, `scripts/checkin-as.ts`, `scripts/seed-members.ts`, `App.tsx:75` | live URL shows login; `demo1..5` + `dev` sign in; `checkin-as.ts demo2 2` succeeds | 3 demo users |
| 2 | T+1:30–2:00 (11:00) | UI rename ping → check-in; sim opt-in only; confirm the flow end to end | `App.tsx` copy strings + one condition | check-in as demo2 works; second attempt says "already" | — |
| 3 | T+2:00–4:00 (11:30) | `Robot` + `LogEntry` models; pure `power.ts` + test + grep guard; `compute-power` on the **PingReceipt** stream (also accepts `{source:'scheduler'}`); `Robot.observeQuery` | `amplify/data/resource.ts`, `amplify/functions/compute-power/*`, `amplify/backend.ts`, `package.json`, `scripts/check-power-is-mood-free.sh`, `scripts/show-robot.ts`, `App.tsx` | `npm test` + `npm run check:power` green; a check-in flips `powerState` in the browser within ~5 s | poll instead of subscribe |
| 4 | T+4:00–6:30 (13:30) | `log-py` Lambda + Bedrock; `NightlyLog` + `HourlyPowerTick` schedules in an `agent` stack; **prove with `rate(5 minutes)`** then cron; `prove-log.ts` | `amplify/functions/log-py/handler.py`, `amplify/backend.ts`, `scripts/prove-log.ts` | today's `LogEntry` lands from `source=scheduler`; the next tick logs `skip: exists` with 0 Bedrock calls; `get-schedule` shows the cron | `CfnSchedule` L1 with an explicit invoke role; drop the hourly tick and say so in NOTES |
| — | after 4 | **Steve** (`/initiate-steve`), two yes/no questions | — | answers in NOTES.md | skip if >20 min behind |
| 5 | T+6:30–8:00 (16:00) | Log panel (newest + date + `seeded` badge; previous days) + `backfill-log.ts` (Aug 18–22, incl. an asleep day) + footer disclosure | `App.tsx` (`LogPanel`, footer), `scripts/backfill-log.ts` | 6 dated entries on the sandbox; asleep body contains neither "alone" nor "nobody"; rerun adds nothing | newest only |
| — | T+8:00–8:30 (17:30) | **Break, no Claude.** Answer the journal's check questions; write 3 NOTES.md bullets yourself | `docs/learn/JOURNAL.md`, `NOTES.md` | — | — |
| 6 | T+8:30–10:15 (18:00) | Scrap SVG, five states, theme re-tint, reduced motion; wired to `Robot`; captions | `src/scrap/Scrap.tsx`, `src/scrap/scrap.css`, `App.tsx` | five states distinct in both themes; reduced motion → no idle animation | three states, static |
| 7 | T+10:15–11:00 (19:45) | Production bring-up: cast + backfill against prod; `ampx sandbox delete`; verify schedules + budget; push → green | `backend.ts` (cron confirmed) | `list-schedules` = exactly `NightlyLog` + `HourlyPowerTick`, ENABLED; budget listed; raw output in NOTES; live URL shows Scrap steady, log, footer | — |
| — | **T+11:00 — STOP BUILDING** (~8:30 PM) | buffer 15 min; optional Steve #2 | | | |
| 8 | T+11:15–12:00 (20:45) | Record the 75 s demo (`docs/demo-script.md`) | — | MP4: the rule, a 2 and a 5 power him the same, the dated log with "seeded" said on camera | one window |
| 9 | T+12:00–13:00 (21:30) | Article from NOTES.md (`marketing` agent) while you review the video; README TODOs | `docs/article.md`, `README.md`, `docs/marketing/posts.md` | exact title, `#agents`, 700+ words, 5 sections, live URL + public repo | posts later |
| 10 | T+13:00–13:30 (22:30) | Submit on Builder Center; final checklist; NOTES entry "submitted <time>"; **do not touch the schedule afterwards** | — | submission confirmation | — |
| M | Mon 8:30 AM ET | **Verification only:** confirm `dayKey` 2026-08-23 was written by `source=scheduler` at 00:30 ET; paste the body into NOTES/README; update the article's `[TODO: first real night]` | `NOTES.md`, `README.md`, `docs/article.md` | the autonomous entry is on the live URL | — |

### Paste-ready prompts (one session each; start every session with `/clear`)

**Step 0 — you (terminal), then Claude:**
```
aws login
aws sts get-caller-identity
cd ~/Desktop/Signalcraft
gh repo create SergioB03/Signalcraft --public --description "Scrap is a salvaged robot powered by honesty, not happiness. A nightly EventBridge->Lambda->Bedrock agent writes his log. AWS Weekend Creative Agent Challenge 2026, concept build."
git push -u origin main
```
Console: Amplify → New app → GitHub → Signalcraft → `main` → it picks up `amplify.yml` → reuse Undercurrent's service role → Save and deploy (~10 min).
```
Step 0 of PLAN.md. Use AWS='C:/Program Files/Amazon/AWSCLIV2/aws.exe' (not on PATH), account 174516978581, region us-east-1. (1) Run one bedrock-runtime converse call against us.anthropic.claude-haiku-4-5-20251001-v1:0 with maxTokens 20 and paste the one-line result into NOTES.md. (2) Write scripts/budget/budget.json + notifications.json and create an AWS Budget "signalcraft-5usd", $5 monthly, email to sergiobanuelos03@gmail.com at 80% and 100%; verify with describe-budgets and paste the raw output into NOTES.md. (3) Rename the package to signalcraft and the <title>/brand strings to Signalcraft (grep 'Undercurrent' in src/, index.html, package.json; leave amplify/ and docs/undercurrent/ alone). npm run build, commit, push. Done when all three are in NOTES.md. The budget must exist before any schedule is created anywhere.
```

**Step 1 (cheap model):**
```
Step 1 of PLAN.md. (1) scripts/create-cast.sh (bash; AWS='C:/Program Files/Amazon/AWSCLIV2/aws.exe'): for demo1..demo5@signalcraft.local and dev@signalcraft.local run admin-create-user, admin-set-user-password --permanent, admin-add-user-to-group (demo1 -> lead, dev -> dev, the rest member); idempotent on UsernameExistsException; USER_POOL_ID and DEMO_PASSWORD from env. (2) Change the demo emails in scripts/seed-members.ts and isDemoEmail in src/App.tsx (around line 75) to @signalcraft.local. (3) scripts/checkin-as.ts EMAIL SCORE [NOTE]: the shared scripts preamble, signIn as EMAIL, PingReceipt.create with id `${userId}#${localDayKey}` (ignore a 'condition' error), then Ping.create — it is how we reach "bright" on camera with five accounts. npm run build. I'll paste the new user pool id from `npx ampx generate outputs --app-id <id> --branch main` once the Amplify build is green; then run the cast script and seed-members against it. Learn entry: environments & generated config.
```

**Step 2 (cheap model):**
```
Step 2 of PLAN.md. In src/App.tsx only, rename user-facing copy from "ping" to "check-in" (tab label, button, status messages, captions) using docs/marketing/ui-copy.md where it has a line. Do not rename models, types, ids, or CSS classes. Mood labels stay. Make simulation mode opt-in only: `sim` true only when simPref === 'on' (around line 572) — hide, do not delete. npm run build. Learn entry: props vs state / API compatibility. Done when build passes and git diff touches only string literals plus that one condition.
```

**Step 3 (strong model):**
```
Step 3 of PLAN.md. Read docs/MAP.md "Where Signalcraft's changes land". (1) amplify/data/resource.ts: add Robot (id = teamId; name, powerState enum asleep|waking|low|steady|bright, signalCount, uniqueMembers; allow.authenticated().to(['read'])) and LogEntry (id = `${teamId}#${dayKey}`; teamId, dayKey, body, powerState, signalCount, uniqueMembers, seeded boolean; allow.authenticated().to(['read'])); add allow.resource(computePower). (2) amplify/functions/compute-power/power.ts: pure `powerStateFor(uniqueMembers: number): PowerState` with ONE parameter — thresholds 0 asleep, 1 waking, 2 low, 3-4 steady, 5+ bright (lowered from the spec's 7+ for a 5-person cast; say so in NOTES.md) — plus power.test.ts using node:test, and "test": "tsx --test \"amplify/functions/**/*.test.ts\"" in package.json. (3) compute-power/{resource.ts,handler.ts} cloned from compute-weather: resourceGroupName 'data'; accepts a DynamoDB stream event OR {source:'scheduler'} (then Team.list, cap 10 teams); lists PingReceipt with createdAt > now-24h, counts unique userId, calls powerStateFor, upserts Robot via AppSync. It must never import or list Ping. (4) backend.ts: a second Policy + EventSourceMapping block on backend.data.resources.tables['PingReceipt'], copied from the Ping block. (5) scripts/check-power-is-mood-free.sh greps compute-power/handler.ts for \bPing\b|score and fails if found; wire as "check:power" in package.json. (6) scripts/show-robot.ts prints the Robot row. (7) Home: add a Robot.observeQuery effect mirroring WeatherState's (App.tsx ~639) and show the power state as text for now. Run npm test, npm run check:power, npx tsc -p amplify/tsconfig.json, npm run build, then `npx ampx sandbox --once` (never watch mode), `npx tsx scripts/checkin-as.ts demo2@signalcraft.local 2` and confirm Robot flips in the browser. Spawn staff-engineer on the diff before committing. Learn entry: effects+cleanup+derived state / materialized view + least privilege.
```

**Step 4 (strong model):**
```
Step 4 of PLAN.md. (1) amplify/functions/log-py/handler.py cloned from report-py, boto3 only, no zoneinfo. Event contract: {source:'scheduler'} -> for each team in env GROUP_IDS (hard cap 5); {teamId, dayKey, aggregates} -> backfill path (seeded=true, createdAt = dayKey+'T23:30:00Z', skips the reads). dayKey for the scheduler path = (now_utc - 4h - 6h).date() as a fixed-offset concept-build shortcut (EDT through Aug 30; the -6h keys a 00:30 run to the day just ended) — comment it. Aggregates: receipts by exact dayKey from PingReceipt (unique userIds), check-in count and notes (deduped + shuffled, max 20) from Ping — scores are never read. Power via the same thresholds as power.ts (duplicate the table with a comment pointing at the TS source). get_item on `${teamId}#${dayKey}` BEFORE any Bedrock call and print 'skip: exists'. bedrock.converse maxTokens 300 with a prompt built from docs/marketing/scrap-voice.md (read it; the tone rules and the five forbidden patterns go into the prompt verbatim): 3-5 sentences, first person, about what he noticed, what he did while it was quiet, how his power held up; never guilt-trip; never "nobody came, I waited alone"; never count who was missing. Fallback one-sentence in-voice body on Bedrock failure (must obey the never-line). put_item with ConditionExpression attribute_not_exists(id) and __typename/createdAt/updatedAt; count and print Bedrock calls per invocation. (2) backend.ts: a new 'agent' stack with the Python LambdaFunction (same IAM shape as reportFn: bedrock:InvokeModel on foundation-model/anthropic.* AND inference-profile/us.anthropic.*; grantReadData on Ping, PingReceipt, Team; grantWriteData on LogEntry; env GROUP_IDS=demo-team, table names), a `NightlyLog` aws-scheduler Schedule with ScheduleExpression.rate(Duration.minutes(5)) for now and a LambdaInvoke target with input {source:'scheduler'}, and an `HourlyPowerTick` Schedule rate(1 hour) -> LambdaInvoke(backend.computePower.resources.lambda, {source:'scheduler'}) — this is what makes "he powers down when nobody says anything" true. (3) scripts/prove-log.ts: wait up to 7 min for today's LogEntry. Deploy with `npx ampx sandbox --once`; `aws logs tail /aws/lambda/<LogPyFn> --since 15m` with a 12-minute hard stop. Done when today's entry exists AND the next run logs 'skip: exists' with 0 Bedrock calls. Then switch NightlyLog to ScheduleExpression.cron({ minute:'30', hour:'0', timeZone: TimeZone.AMERICA_NEW_YORK }), redeploy, confirm with `aws scheduler get-schedule`, record the first scheduler-written entry's UTC timestamp and the skip line in NOTES.md. Spawn staff-engineer before committing. Learn entry: scheduled agents + idempotent writes + cost guards.
```
Then Steve, two yes/no questions: `/initiate-steve Signalcraft backend review, answer two things yes/no with file:line evidence: (1) is there any path where log-py makes more than one Bedrock call per team per run, or runs for more teams than GROUP_IDS? (2) is there any path that overwrites an existing LogEntry dayKey, or where compute-power can read a Ping score?`

**Step 5 (cheap model):**
```
Step 5 of PLAN.md. (1) LogPanel in App.tsx as a new island tab "log" (add 'log' to the View union ~36 and the tabs ~541), modeled on ReportPanel (~1160): LogEntry.list({ filter: { teamId } }) sorted client-side by dayKey desc; newest entry as the hero with a long date from dayKey and a "seeded" badge when seeded; "previous days" list below; tri-state loading; header, empty states, and the seeded/real subheader text from docs/marketing/ui-copy.md. (2) Add the footer disclosure from docs/marketing/ui-copy.md ("concept build — running through Sun Aug 30, 2026 …") near the theme toggle. (3) scripts/backfill-log.ts modeled on seed-demo.ts but invoking the log Lambda through the AWS CLI (node:child_process execFile of `aws lambda invoke --cli-binary-format raw-in-base64-out --payload file://<tmp>`; LOG_FN from env) for Aug 18–22 with synthetic aggregates: include one asleep day (0 members) and one bright day; today is left to the scheduler on purpose. Ids are `${teamId}#${dayKey}` so reruns are no-ops. Run against the sandbox; done when 6 dated entries show and the asleep body contains neither "alone" nor "nobody". npm run build. Learn entry: async data + keyed lists / date-keyed storage + honest seeding.
```

**Step 6 (cheap model; strong if the SVG fights back):**
```
Step 6 of PLAN.md. Create src/scrap/Scrap.tsx: one inline <svg viewBox="0 0 200 240" data-power={power}> with named <g> parts — body, head, faceplate, eye, antenna, chest-light, arm-left, arm-right, glow — every fill a CSS variable mapped from --stone, --foam, --sun, --reed, --silt-deep so he re-tints with data-theme. Props: { power: PowerState (import the type from amplify/functions/compute-power/power.ts); expression?: 'calm'|'concerned' }. src/scrap/scrap.css: per-state rules keyed ONLY on [data-power] — asleep (eye dark, slumped transform, slow breathing glow), waking (eye flicker), low (dim eye, antenna drooped), steady (lit, upright, small idle bob), bright (panels lit, antenna up, animated chest light); 0.9s transitions as the crossfade; `@media (prefers-reduced-motion: reduce) { .scrap * { animation: none !important } }`. [data-expression] may only tilt the head — comment that expression never touches eye, glow, or power. Mount Scrap in Home above the island, fed by the Robot subscription; show the per-state caption and the always-visible rule line from docs/marketing/ui-copy.md under him; add a dev-only power preview selector in DevPanel (~1232) for the recording. npm run build. Learn entry: declarative rendering state->attributes / determinism over generation.
```

**Step 7 (cheap model):**
```
Step 7 of PLAN.md. Production bring-up. (1) With OUTPUTS=prod/amplify_outputs.json (gitignored): run create-cast.sh against the prod pool, seed-members.ts, then checkin-as.ts for demo2 (2), demo3 (4), demo4 (5) so Scrap reads steady. (2) Run backfill-log.ts against prod (LOG_FN = the prod Lambda name) — this doubles as the production IAM + Bedrock proof. (3) `npx ampx sandbox delete` so only production fires tonight. (4) Verify and paste raw output into NOTES.md: `aws scheduler list-schedules` shows exactly NightlyLog (cron 0:30 America/New_York) and HourlyPowerTick, both ENABLED; `aws budgets describe-budgets` lists signalcraft-5usd. Commit, push, wait for the build, verify the live URL in both themes. Update NOTES.md with the live URL and timings. STOP BUILDING after this step.
```

**Step 9 (marketing agent):**
```
Step 9 of PLAN.md. Spawn the marketing agent: rewrite docs/article.md from NOTES.md — title exactly "Weekend Creative Agent Challenge: Signalcraft", tag #agents, 700+ words, sections vision / how I built it / AWS services + architecture / what I learned / link; every number traceable to NOTES.md; state explicitly: power from PingReceipt which has no score column; history Aug 18–22 seeded through the same generator; teardown Sun Aug 30; the anonymity split kept and why; the first autonomous entry lands 00:30 ET Aug 24. Fill the README.md TODOs (live URL) and docs/marketing/posts.md. Done when the word count and sections check out.
```

**Step 10 — final check:**
```
Final check for submission: repo is PUBLIC (gh repo view --json visibility); git status clean and pushed; docs/article.md title exact, #agents present, word count >= 700; `aws scheduler get-schedule --name <NightlyLog>` State ENABLED; live URL returns 200. Append "submitted <time>" to NOTES.md. Do not touch the schedule afterwards.
```

## AWS services

| Service | Role | Status | How wired |
|---|---|---|---|
| Amplify Hosting + Gen 2 | CI/CD, backend definition | reused | new app on the Signalcraft repo; `amplify.yml` as is |
| Cognito | auth, groups lead/member/dev | reused | new pool → `create-cast.sh` |
| AppSync + DynamoDB | data, streams, subscriptions | reused + 2 models | `Robot`, `LogEntry` (with `seeded`) |
| Lambda (Node) | `compute-power` | new | PingReceipt stream **and** hourly tick → AppSync upsert of `Robot` |
| Lambda (Python 3.12) | `log-py` nightly writer | new | CDK `LambdaFunction` in an `agent` stack, boto3 only, fixed-offset dayKey |
| **EventBridge Scheduler** | `NightlyLog` (cron 00:30 America/New_York) + `HourlyPowerTick` (rate 1 h) | new | `aws-scheduler` `Schedule` + `LambdaInvoke`; `rate(5m)` to prove first |
| Bedrock (Converse, Haiku 4.5) | Scrap's log | reused | `us.anthropic.claude-haiku-4-5-20251001-v1:0`, maxTokens 300, one call per team per night, `get_item` before calling |
| AWS Budgets | $5 alarm | new | step 0, before any schedule exists |
| S3 + Nova Canvas | accessory images | tier 3 | not this weekend |

## Token strategy

1. Session start = `PLAN.md` (current step) → `docs/MAP.md` → last `NOTES.md` entry. No exploring.
2. Never read `App.tsx` / `RiverCanvas.tsx` whole — grep the symbol, Read with offset/limit; prompts carry line anchors from MAP.md.
3. One step per session, `/clear` between; each prompt above is self-contained.
4. `npx ampx sandbox --once` from Claude, never watch mode (it streams context). You may run watch mode in your own second terminal.
5. CLI output with limits: `--query`, `--since 15m`, `tail -30`. Deploy checks via `aws amplify list-jobs`, not screenshots.
6. Reviews through the `staff-engineer` subagent (fresh, small context) after steps 3 and 4; Steve once, two yes/no questions. No `/code-review` passes.
7. Model tiers: strong model for steps 3 and 4 (and 6 if the SVG fights back); cheap model for steps 1, 2, 5, 6, 7, README, article draft.
8. Learn entries during deploy waits (zero-token time); `tutor` (Sonnet) after steps 3, 4, 5, 6.
9. Deploy waits are for you: answer journal questions, write NOTES bullets yourself — the cheapest article draft there is.
10. `NOTES.md` is the memory: point Claude at an entry instead of re-explaining a decision. Never grow `CLAUDE.md`.

## Agent roster

| Agent | Role | When | Model |
|---|---|---|---|
| `staff-engineer` (`.claude/agents/`) | correctness → spec compliance (rule enforced in code, date-keyed never overwritten, cost guards) → over-engineering | end of steps 3 and 4 before commit (6 optional) | inherit |
| `marketing` | README, article, posts, demo script, microcopy; keeps the article qualifying and honest | step 9 (while you review the recording) | inherit |
| `tutor` | learn-mode journal entries | after steps 3, 4, 5, 6 — during deploy waits | sonnet |
| **Steve** (`/initiate-steve`, hosted Managed Agent, real API cost) | two yes/no questions with file:line evidence: Bedrock call cap, dayKey overwrite / score leak | once after step 4; optional second in the T+11:00 buffer; skip if >20 min behind | — |

## Learn mode

Mechanism: CLAUDE.md §11 + `docs/learn/README.md`. After each step an entry lands in `docs/learn/JOURNAL.md`; you answer the check question (the T+8:00 break is for this); the next session opens by grading it. Concept per step:

| Step | React | System design |
|---|---|---|
| 0–1 | — | environments & generated config; deploy-first; IaC |
| 2 | props vs state; copy ≠ behavior | API compatibility; hide vs delete |
| 3 | effects + cleanup; derived state | materialized view; event-driven fan-out; least privilege as enforcement; a test and a grep as guarantees |
| 4 | — | scheduled agents; idempotent conditional writes; cost guards; why a decay tick is needed when nothing expires |
| 5 | async data in effects; tri-state; keyed lists | date-keyed storage; honest seeding |
| 6 | declarative rendering: state → attributes; CSS vars; reduced motion | determinism over generation |
| 7 | — | operational readiness: budgets, one environment firing, teardown |
| 8–10 | — | communicating architecture |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Scrap never powers down (receipts have no TTL, stream-only recompute) | certain without it | `HourlyPowerTick` schedule; cut-if-late = say so in NOTES |
| `zoneinfo` crashes the boto3-only Lambda (no tzdata) | high if used | fixed −4 h offset through Aug 30; Scheduler's own `timeZone` for the cron |
| Scheduler construct fails to deploy through Amplify's CDK (service role lacks `scheduler:*`) | low–med | constructs verified; fallback `CfnSchedule` or a CLI-created schedule to the Lambda ARN |
| Log Lambda gets Bedrock AccessDenied | low–med | same IAM ARNs as `reportFn`; step 0 smoke test |
| Sandbox schedule fires alongside production (two Bedrock calls a night) | med | `ampx sandbox delete` in step 7; `list-schedules` must show exactly two |
| New Cognito pool → demo accounts missing | high | `create-cast.sh` in step 1 |
| Backend edit breaks the pipeline (root `tsc -b` skips `amplify/`) | med | `npx tsc -p amplify/tsconfig.json` before every push |
| `aws login` session expires mid-day | med | re-login at the start of step 4 |
| 5-minute proof schedule left running | med | 12-minute hard stop, then the cron switch; budget alarm |
| App.tsx white-screen from a TDZ edit | med | `npm run build` is the gate; the dev server doesn't type-check |
| Scope creep into tier 2/3 | high | scope guard in CLAUDE.md §11; the stop line at T+11:00 |

## Assumptions to verify in step 0

- [ ] `aws login` restores a working session for account `174516978581`, region `us-east-1`
- [ ] Bedrock `converse` on Haiku 4.5 works from the CLI (account gates carry over)
- [ ] Undercurrent's Amplify service role can be reused and can create EventBridge schedules
- [ ] No existing EventBridge schedules or budgets in the account (`list-schedules`, `describe-budgets`)
- [ ] `gh repo create` run by you; push succeeds; Amplify app created from the repo

## Teardown (in README)

Concept build running through **Sun Aug 30, 2026**. On **Mon Aug 31**: disable/delete both schedules, delete the Amplify app (removes the backend stack), confirm zero `bedrock-runtime` invocations in CloudWatch for 24 h, delete the budget and any leftover sandbox stacks, keep the repo public with a "retired" line in the README.

## Verification (end to end)

1. Live URL loads; sign in as `demo2`; check in → Scrap changes state within ~5 s without reload; a second check-in says "already".
2. `npm test` and `npm run check:power` pass; `compute-power/handler.ts` contains no `Ping` or `score`.
3. `aws scheduler list-schedules` = exactly `NightlyLog` (cron 0:30 America/New_York) + `HourlyPowerTick`, both ENABLED; `log-py` logs show one Bedrock call per team per tick and `skip: exists` on re-runs; `LogEntry` has one row per day.
4. Log tab shows today's entry with its date plus Aug 18–22 seeded entries with the badge; rerunning `backfill-log.ts` adds nothing.
5. Theme toggle re-tints Scrap; OS reduced-motion → no idle animation.
6. Footer disclosure visible; `describe-budgets` lists the $5 budget.
7. Article: exact title, `#agents`, ≥700 words, five sections, live URL + public repo link; seeded history and end date disclosed.
8. Monday 8:30 AM: `dayKey` 2026-08-23 entry exists with `source=scheduler`, written 00:30 ET — the autonomous entry the challenge is about.
