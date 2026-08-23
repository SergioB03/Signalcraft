# Signalcraft — Build Plan

**Now:** Sun 2026-08-23 ≈ 1 AM ET · **Deadline:** Mon Aug 24 1:00 PM PT / 4:00 PM ET · **Target submit:** Sun night (Mon morning = buffer) · First 101 qualifying submissions win; no judging.

## Context

You uploaded `CLAUDE-signalcraft.md`: a weekend concept build for the AWS Builder Center *Weekend Creative Agent Challenge*. Scrap, a salvaged robot, is powered by honest check-ins (not mood), and a nightly agent writes his log. It forks your Undercurrent repo and reuses its Amplify Gen 2 backend, Cognito groups, the Ping/PingReceipt anonymity split, and the Python Bedrock Lambda. You asked for: a token-efficient plan, a staff-engineer agent and a marketing agent, AWS services per the spec, a GitHub repo, and a learn mode for React + system design.

**The rule (verbatim from the spec):** *Scrap is powered by honesty, not by happiness.* A terrible day powers him exactly as much as a great one. He only runs low when nobody says anything at all. He never dies — with no signal he powers down and sleeps, and wakes the moment someone checks in.

## Already done this session (in `C:\Users\sergi\Desktop\Signalcraft`)

- Cloned Undercurrent with full history; remote swapped to `https://github.com/SergioB03/Signalcraft.git` (Undercurrent remote removed so nothing can be pushed there). `npm install` done; `tsc -b && vite build` passes with a stub outputs file, so the fork is sound.
- Spec installed as `CLAUDE.md` + new **§11 Claude Code workflow** (read order, agents, learn mode, model tiers).
- `docs/MAP.md` — codebase map with file:line refs (replaces exploring 3,000 lines per session).
- `.claude/agents/staff-engineer.md`, `marketing.md`, `tutor.md` — project-local subagents.
- `docs/learn/README.md` (syllabus) + `docs/learn/JOURNAL.md` (empty).
- `NOTES.md` restarted with today's decisions; Undercurrent's docs moved to `docs/undercurrent/`.
- Verified: `aws-cdk-lib@2.266.0` has the stable `Schedule` L2 + `ScheduleExpression.cron/rate` + `LambdaInvoke` target → the nightly tick is ~15 lines in `backend.ts`.
- **Blocked (needs you):** `gh repo create` was denied by the permission classifier. Your `aws login` session has expired (every CLI call fails), so budgets/schedules/Amplify apps could not be verified.

First commit: this plan, the agents, MAP.md, learn syllabus, and NOTES.md.

## Strategy

Prove the riskiest wire first (EventBridge Scheduler → Lambda → Bedrock → date-keyed `LogEntry`) before any art. Reuse the check-in flow untouched. Derive power from `PingReceipt` only — the table that physically has no scores — so the rule is enforced by what the Lambda can read, not by a comment. Draw Scrap as SVG-in-React (the spec's §6 allows "canvas/SVG"): named `<g>` parts, state → attributes, CSS variables for theme, `prefers-reduced-motion` in CSS. Keep the river canvas as the scene behind him (zero work, and it visibly demonstrates mood ≠ power: the water can storm while Scrap stays bright). One step per Claude Code session, paste-ready prompts, reviews by a cheap subagent, Steve twice.

## Schedule (relative to your start; clock column assumes 9:30 AM ET)

| # | Slot | Task | Files | Done when | Cut if late |
|---|---|---|---|---|---|
| 0 | T+0:00–0:30 (9:30) | `aws login`; commit + push; **$5 budget**; Bedrock smoke test | — | `aws sts get-caller-identity` works; budget listed; one CLI `converse` returns text | — |
| 1 | T+0:30–1:30 (10:00) | New Amplify app on the repo, deploy green; recreate demo Cognito users by CLI | `package.json` name, `index.html` title, `scripts/create-demo-users.sh` | New URL shows the login screen; `demo1..5` + `dev` can sign in | Skip `dev`; 3 demo users |
| 2 | T+1:30–2:00 (11:00) | UI rename ping → check-in; confirm flow end to end | `App.tsx` copy strings only | Check-in as demo2 succeeds; second attempt says "already" | — |
| 3 | T+2:00–4:00 (11:30) | `Robot` + `LogEntry` models; `compute-power` Lambda on the **PingReceipt** stream; `Robot.observeQuery` in Home | `amplify/data/resource.ts`, `amplify/functions/compute-power/*`, `amplify/backend.ts`, `src/scrap/power.ts`, `App.tsx` | A check-in flips `Robot.powerState` in the browser within ~5 s, no reload | Poll instead of subscribe |
| 4 | T+4:00–6:30 (13:30) | Scheduler + `log-py` Lambda + Bedrock; **prove with `rate(5 minutes)`**, then nightly cron; `prove-log.ts` | `amplify/functions/log-py/handler.py`, `amplify/backend.ts`, `scripts/prove-log.ts` | A real `LogEntry` row lands with `dayKey` = today; second tick does **not** overwrite it | `CfnSchedule` or CLI `aws scheduler create-schedule` to the Lambda ARN |
| — | after 4 | **Steve review #1** (backend) | — | Findings logged in NOTES.md | skip |
| 5 | T+6:30–8:30 (16:00) | Scrap SVG, five states, theme re-tint, reduced motion; wired to `Robot` | `src/scrap/Scrap.tsx`, `src/scrap/scrap.css`, `App.tsx` | Five states visibly distinct in both themes; `prefers-reduced-motion` → no idle animation | Static poses only, 5 CSS classes |
| 6 | T+8:30–9:30 (18:00) | Log panel (latest entry + date; archive list if free) + `backfill-log.ts` (5 days, deterministic ids) | `App.tsx` (`LogPanel`), `scripts/backfill-log.ts`, `log-py/handler.py` (backfill event) | Morning log shows 6 dated entries; rerunning backfill adds nothing | Latest entry only |
| 7 | T+9:30–10:15 (19:00) | Seed demo cast + check-ins; footer "concept build — running through Sun Aug 30, 2026"; rate → nightly cron; push → green | `scripts/seed-members.ts`, `App.tsx` footer, `backend.ts` | Live URL: Scrap `steady`/`bright`, log visible, footer present; schedule = cron, enabled | — |
| — | **T+10:15 — STOP BUILDING** | Steve review #2 (optional, 15 min) | | | |
| 8 | T+10:15–11:00 (19:45) | Record 60–90 s demo | `docs/demo-script.md` | MP4 saved; shows the rule, a check-in changing Scrap, the dated log | One window |
| 9 | T+11:00–12:00 (20:30) | Article from NOTES.md (`marketing` agent), README, posts | `docs/article.md`, `README.md`, `docs/marketing/*` | Title exact, `#agents`, 500+ words, 5 sections, live URL + repo | Posts later |
| 10 | T+12:00–12:30 (21:30) | Submit on Builder Center; confirm repo public; NOTES entry | — | Submission confirmation; Monday morning: check the real nightly entry landed | — |

### Paste-ready prompts (one session each; start every session with `/clear`)

**Step 0 — you, not Claude (terminal):**
```
aws login                      # refresh the expired session
aws sts get-caller-identity
gh repo create SergioB03/Signalcraft --public --description "Scrap is a salvaged robot powered by honesty, not happiness. A nightly EventBridge->Lambda->Bedrock agent writes his log. AWS Weekend Creative Agent Challenge 2026, concept build."
```
Then in Claude Code:
```
Step 0 of PLAN.md. Commit everything as "Signalcraft: fork of Undercurrent, plan, agents, notes" and push -u origin main. Then: (1) create an AWS Budget named signalcraft-5usd, $5 monthly, email notification at 80% and 100% to sergiobanuelos03@gmail.com via the AWS CLI (C:\Program Files\Amazon\AWSCLIV2\aws.exe), account 174516978581, region us-east-1; (2) run one bedrock-runtime converse call against us.anthropic.claude-haiku-4-5-20251001-v1:0 with max 20 tokens and paste the one-line result into NOTES.md. Done when both are in NOTES.md.
```

**Step 1:**
```
Step 1 of PLAN.md. Rename the package to signalcraft and the <title>/brand strings to Signalcraft (grep 'Undercurrent' in src/, index.html, package.json — do not touch amplify/ or docs/undercurrent/). Write scripts/create-demo-users.sh that uses the AWS CLI to admin-create-user, admin-set-user-password --permanent, and admin-add-user-to-group for demo1..demo5@undercurrent.local (demo1 -> lead) and dev@undercurrent.local (dev), taking USER_POOL_ID and DEMO_PASSWORD from env. I will create the Amplify app in the console from the GitHub repo while you work; once it's green I'll paste the user pool id from amplify_outputs.json. Done when npm run build passes and the script runs clean.
```
(Console: Amplify → New app → GitHub → Signalcraft → `main` → it picks up `amplify.yml` → reuse Undercurrent's service role → Save and deploy, ~10 min. Then `npx ampx generate outputs --app-id <new id> --branch main` for a local `amplify_outputs.json`.)

**Step 2:**
```
Step 2 of PLAN.md. In src/App.tsx only, rename user-facing copy from "ping" to "check-in" (tab label, button, status messages, captions). Do not rename models, types, ids, or CSS classes. Mood labels stay. Then run npm run build. Learn entry: props vs state / API compatibility. Done when build passes and git diff touches only string literals.
```

**Step 3 (strong model):**
```
Step 3 of PLAN.md. Read docs/MAP.md "Where Signalcraft's changes land". Add Robot and LogEntry models to amplify/data/resource.ts (Robot: id = teamId, name, powerState enum asleep|waking|low|steady|bright, signalCount, uniqueMembers, read for authenticated; LogEntry: id = `${teamId}#${dayKey}`, teamId, dayKey, body, powerState, signalCount, uniqueMembers, read for authenticated) and allow.resource(computePower). Create amplify/functions/compute-power/{resource.ts,handler.ts} by cloning compute-weather: resourceGroupName 'data'; triggered by the PingReceipt table stream (wire in backend.ts exactly like the Ping stream block); lists PingReceipt with createdAt > now-24h, counts unique userId, maps through powerStateFor() from src/scrap/power.ts (thresholds 0 asleep, 1 waking, 2 low, 3-4 steady, 5+ bright — tuned for a 6-person demo cast), upserts Robot via AppSync. It must never import or list Ping. In Home, add a Robot.observeQuery effect mirroring WeatherState's and show the power state as text for now. Run npx tsc -p amplify/tsconfig.json and npm run build, then npx ampx sandbox and check in as a demo user to confirm Robot updates live. Spawn staff-engineer on the diff before committing. Learn entry: effects+cleanup+derived state / materialized view + least privilege.
```

**Step 4 (strong model):**
```
Step 4 of PLAN.md. Create amplify/functions/log-py/handler.py by cloning report-py: for each team id in env TEAM_IDS, read today's aggregates (count from Ping scan by createdAt >= local midnight; unique members from PingReceipt scan by dayKey; notes deduped+shuffled, max 20), compute power via the same thresholds as src/scrap/power.ts (duplicate the table in Python with a comment pointing at the TS source), call bedrock.converse with maxTokens 220 asking for 3-5 sentences in Scrap's voice (warm, a little dented, what he noticed, what he did while it was quiet, how his power held up; never guilt-trip; never "nobody came, I waited alone"; never count who was missing), and put_item a LogEntry with id `${teamId}#${dayKey}` and ConditionExpression attribute_not_exists(id); on ConditionalCheckFailedException log and skip. Also accept a backfill event {teamId, dayKey, signalCount, uniqueMembers, notes} that skips the reads. In backend.ts add the Lambda in a 'log' stack with the same IAM as reportFn plus reads on Ping and PingReceipt and writes on LogEntry, env TEAM_IDS=demo-team, and an aws-scheduler Schedule with ScheduleExpression.rate(Duration.minutes(5)) and a LambdaInvoke target. Write scripts/prove-log.ts (clone prove-report: wait up to 7 min for a LogEntry with today's dayKey). Deploy to sandbox, prove it, then change to ScheduleExpression.cron({minute:'0', hour:'4', timeZone: TimeZone.AMERICA_NEW_YORK}) and note both in NOTES.md. Spawn staff-engineer before committing. Learn entry: scheduled agents + idempotent writes + cost guards.
```
Then: `/initiate-steve review the backend wiring for Signalcraft: compute-power, log-py, the scheduler, and whether power can ever see a mood score`.

**Step 5 (strong model):**
```
Step 5 of PLAN.md. Create src/scrap/Scrap.tsx: one inline <svg viewBox> with named <g id> parts — body, head, facePlate, eye, antenna, chestLight, armL, armR — fills from CSS variables (--stone, --foam, --reed, --sun, --silt-deep) so it re-tints with data-theme. Props: { power: PowerState; mood?: 'calm'|'rough' }. Map power to a data-power attribute on the root <g>; src/scrap/scrap.css styles each state: asleep (eye dark, slumped transform, slow breathing glow), waking (eye flicker), low (dim eye, antenna drooped), steady (lit, upright, small idle bob), bright (panels lit, antenna up, animated chest light). mood only changes eye shape — never power — put a comment saying so and keep mood out of any power logic. All animations inside @media (prefers-reduced-motion: no-preference); otherwise static with a 300ms opacity crossfade. Mount Scrap in Home above the island, fed by the Robot subscription; add a dev-only state picker (reuse DevPanel) to cycle the five states. Run npm run build. Spawn staff-engineer. Learn entry: declarative rendering state->attributes / determinism over generation.
```

**Step 6:**
```
Step 6 of PLAN.md. Add LogPanel to App.tsx as a new island tab "log": LogEntry.list filtered by teamId, sorted by dayKey desc, latest entry large with its date, earlier entries as a short list (archive = tier 2, keep if under 20 lines). Tri-state loading like ReportPanel. Then write scripts/backfill-log.ts modeled on seed-demo.ts but invoking the log Lambda through the AWS CLI (child_process execFile of aws lambda invoke with a backfill payload) for the 5 days before today with synthetic aggregates (vary count 2-6, unique 1-5, a few notes), against TEAM_ID demo-team; ids are `${teamId}#${dayKey}` so reruns are no-ops. Run it against the sandbox, confirm 6 dated entries. Learn entry: async data + keyed lists / date-keyed storage + honest seeding.
```

**Step 7:**
```
Step 7 of PLAN.md. Run seed-members.ts against production outputs (OUTPUTS=...), then check in as demo2, demo3, demo4 so Scrap reads steady. Add the footer line "concept build — running through Sun Aug 30, 2026" near the theme toggle. Confirm backend.ts schedule is the 04:00 America/New_York cron and enabled. Run backfill-log.ts against production. Commit, push, wait for the build, verify on the live URL in both themes. Update NOTES.md with the live URL and timings. STOP BUILDING after this step.
```

**Step 9 (marketing agent):**
```
Step 9 of PLAN.md. Spawn the marketing agent: write docs/article.md from NOTES.md (title exactly "Weekend Creative Agent Challenge: Signalcraft", tag #agents, 500+ words, sections vision / how I built it / AWS services + architecture / what I learned / link; disclose the seeded history and the Aug 30 end date), rewrite README.md (hero, the rule, architecture one-liner, run, teardown date), and docs/marketing/{submission-post,linkedin,x-thread}.md. I'll paste the live URL. Done when the word count and sections check out.
```

## AWS services

| Service | Role | Status | How wired |
|---|---|---|---|
| Amplify Hosting + Gen 2 | CI/CD, backend definition | reused | New app on the Signalcraft repo; `amplify.yml` as is |
| Cognito | auth, groups lead/member/dev | reused | New pool → recreate demo users by CLI |
| AppSync + DynamoDB | data, streams, subscriptions | reused + 2 models | `Robot`, `LogEntry` in `data/resource.ts` |
| Lambda (Node) | `compute-power` | new | PingReceipt stream → AppSync upsert of `Robot` |
| Lambda (Python 3.12) | `log-py` nightly writer | new | CDK `LambdaFunction` in a `log` stack, boto3 only |
| **EventBridge Scheduler** | the nightly tick | new | `aws-scheduler` `Schedule` + `LambdaInvoke`; `rate(5m)` to prove, then `cron 04:00 America/New_York` |
| Bedrock (Converse, Haiku 4.5) | Scrap's log | reused | `us.anthropic.claude-haiku-4-5-20251001-v1:0`, `maxTokens` 220, one call per team per night |
| AWS Budgets | $5 alarm | new | created in step 0 before any schedule exists |
| S3 + Nova Canvas | accessory images | tier 3 | not this weekend |

## Token strategy

1. Session start = `PLAN.md` (current step) → `docs/MAP.md` → last `NOTES.md` entry. No exploring.
2. Never read `App.tsx` / `RiverCanvas.tsx` whole — grep the symbol, Read with offset/limit.
3. One step per session, `/clear` between; each prompt above is self-contained.
4. Reviews through the `staff-engineer` subagent (fresh, small context), not long in-session self-review. Steve exactly twice.
5. Model tiers: steps 2, 6, 7, 9 on Sonnet; steps 3, 4, 5 and reviews on Opus/Fable.
6. Learn entries ≤12 lines inline; `tutor` (Sonnet) only for steps touching >3 files.
7. Paste `tail -30` of logs, never whole build logs; check deploys with `aws amplify list-jobs`, not screenshots.
8. Batch pushes — each pipeline build is ~10 min of wall clock; iterate backend in `ampx sandbox`.
9. NOTES.md is the memory: point Claude at an entry instead of re-explaining a decision.

## Agent roster

| Agent | Role | When | Model |
|---|---|---|---|
| `staff-engineer` (`.claude/agents/`) | correctness → spec compliance (rule enforced in code, date-keyed never overwritten, cost guards) → over-engineering | end of steps 3, 4, 5, 6 before commit | inherit |
| `marketing` | README, article, posts, demo script, microcopy; keeps the article qualifying and honest | step 9 (+ README during step 1's build wait) | inherit |
| `tutor` | learn-mode journal entries | after big steps, on demand | sonnet |
| **Steve** (`/initiate-steve`, hosted Managed Agent) | senior review with repo access; costs API money | after step 4, after step 7 | — |

## Learn mode

Mechanism: CLAUDE.md §11 + `docs/learn/README.md`. After each step an entry lands in `docs/learn/JOURNAL.md`; you answer the check question; the next session opens by grading it (2 minutes). Concept per step:

| Step | React | System design |
|---|---|---|
| 0–1 | — | environments & generated config; deploy-first; IaC |
| 2 | props vs state; copy ≠ behavior | API compatibility |
| 3 | effects + cleanup; derived state | materialized view; event-driven fan-out; least privilege as enforcement |
| 4 | — | scheduled agents; idempotent conditional writes; cost guards |
| 5 | declarative rendering: state → attributes; CSS vars; reduced motion | determinism over generation |
| 6 | async data in effects; tri-state; keyed lists | date-keyed storage; honest seeding |
| 7 | — | operational readiness: budgets, teardown |
| 8–10 | — | communicating architecture |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Scheduler construct fails to deploy through Amplify's CDK | low | verified constructs exist; fallback `CfnSchedule` or CLI-created schedule to the Lambda ARN |
| Log Lambda gets Bedrock AccessDenied | low–med | same IAM ARNs as `reportFn` (foundation-model **and** inference-profile); step 0 smoke test |
| New Cognito pool → demo accounts missing, eats 30 min | high | `create-demo-users.sh` in step 1 |
| Backend edit breaks the pipeline (root `tsc -b` skips `amplify/`) | med | `npx tsc -p amplify/tsconfig.json` before every push |
| `aws login` session expires mid-day | med | re-login at the start of step 4 |
| 5-minute proof schedule left running | med | `prove-log.ts` then immediate cron switch; budget alarm; schedule state logged in NOTES |
| App.tsx TDZ/white-screen from edits | med | `npm run build` is the gate; dev server doesn't type-check |
| Scope creep into tier 2/3 | high | scope guard in CLAUDE.md §11; STOP line at T+10:15 |

## Assumptions to verify before coding (step 0)

- [ ] `aws login` restores a working session for account `174516978581`, region `us-east-1`
- [ ] Bedrock `converse` on Haiku 4.5 works from the CLI (account gates carry over)
- [ ] Undercurrent's Amplify service role can be reused for the new app
- [ ] No existing EventBridge schedules or budgets in the account (CLI list)
- [ ] `gh repo create` run by you; push succeeds

## Teardown (goes in README)

Concept build running through **Sun Aug 30, 2026**. On **Mon Aug 31**: disable/delete the EventBridge schedule, delete the Amplify app (removes the backend stack), confirm zero Bedrock invocations in CloudWatch for 24 h, delete the budget, keep the repo public with a "retired" line in the README.

## Verification (end to end)

1. Live URL loads; sign in as `demo2`; check in → Scrap changes state within ~5 s without reload; second check-in says "already".
2. `aws scheduler get-schedule` shows the nightly cron, `ENABLED`; CloudWatch logs for `log-py` show exactly one invocation per tick; `LogEntry` table has one row per day, and re-invoking with today's `dayKey` is a no-op.
3. Log tab shows today's entry with its date plus 5 backfilled days; `backfill-log.ts` rerun adds nothing.
4. Theme toggle re-tints Scrap; OS reduced-motion → no idle animation.
5. Footer disclosure visible; `aws budgets describe-budgets` lists the $5 budget.
6. Article: exact title, `#agents`, ≥500 words, five sections, live URL + public repo link; seeded history and end date disclosed.
7. Repo public; `NOTES.md` has an entry per step.
