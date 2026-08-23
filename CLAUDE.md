# Signalcraft — Build Spec

> Repo root. Claude Code reads this automatically.
> Forked from Undercurrent (github.com/SergioB03/Undercurrent). Keep that repo untouched.

## 0. What this is

A group adopts **Scrap**, a small salvaged robot. Scrap runs on **signal**: every honest
check-in from a member keeps him powered. Overnight, while nobody is watching, he makes
something — a log entry about the day, in his own voice — and it's waiting in the morning.

Built for the AWS Builder Center **Weekend Creative Agent Challenge** (Aug 21–24, 2026).

**The rule that defines this app:** *Scrap is powered by honesty, not by happiness.*
A terrible day powers him exactly as much as a great one. He only runs low when nobody
says anything at all. He never dies — with no signal he powers down and sleeps, and wakes
the moment someone checks in.

Write that rule into the UI, the article, and the demo. Everything else is downstream.

## 1. Hard constraints

- **Deadline: Monday Aug 24, 1:00 PM PT (4:00 PM ET).** The first 101 qualifying
  submissions win the jacket — **there is no judging**. Being early beats being polished.
  **Target: submit Sunday.**
- **This is a concept build with a ~7-day life.** Say so in the app footer
  ("concept build — running through <date>"). An intentional ending is a feature.
- Solo, one weekend, on top of an existing working codebase.
- Ship > polish > scope. Cut to tier 1 the moment the clock gets tight.
- Keep `NOTES.md` running from the first commit — it becomes the article.

## 2. What carries over from Undercurrent (do not rebuild)

Amplify Gen 2 backend, Cognito auth with groups, AppSync + DynamoDB with subscriptions,
the Python Bedrock Lambda pattern (Converse API, already through account verification and
the Anthropic use-case gate), Amplify Hosting CI/CD, theme tokens and the light/dark
toggle, and the canvas rendering approach.

**Reuse the check-in flow wholesale.** A Ping becomes a check-in. Same anonymity split:
`Ping` carries a score and no author, `PingReceipt` carries an author and a day key and
no score. That design decision is still the best thing in the codebase — keep it and say
why in the article.

## 3. What is new

1. **EventBridge Scheduler** — the nightly tick. This is what makes it an agent. Highest
   priority new component.
2. **A Scrap character rendered in canvas** with five power states.
3. **An overnight log** written by Bedrock and stored date-keyed.
4. Power level derived from signal (participation), never from mood scores.

## 4. Scope tiers

### Tier 1 — MUST SHIP
1. Fork deploys green on a new Amplify app with its own URL. **Do this first.**
2. Check-in flow works (reuse existing).
3. Power level computed from check-in count in the rolling window; five states.
4. Scrap renders in canvas and visibly changes state.
5. EventBridge Scheduler fires nightly → Lambda → Bedrock writes the log entry → stored.
6. Latest log entry displayed in the UI, with its date.
7. Seeded demo group + **backfilled log history** (see §7 — do not skip).
8. Light/dark toggle still works, Scrap re-tints with it.

### Tier 2
9. Log archive: scroll back through previous days.
10. Bedrock generates a background/scene description that varies with day and power state.
11. A line in the log that reflects *breadth* of participation, not volume.

### Tier 3 — only if ahead
12. Nova Canvas generating an accessory or background image (stored in S3).
13. Anonymous "send Scrap a part" care action.

### OUT of scope
Cosmetic unlock system, currency, inventory, multi-group, memory/anniversary features,
push notifications, native app, image generation of Scrap himself (see §6).

## 5. Data model additions

```ts
Robot:     id (= groupId), name ('Scrap'), powerState, signalCount, updatedAt
LogEntry:  id, groupId, dayKey ('2026-08-23'), body, powerState,
           signalCount, uniqueMembers, createdAt
           // date-keyed on purpose: this is the long-term hedge. Never overwrite.
```

Keep `Team`/`Membership`/`Ping`/`PingReceipt` as-is, renamed in the UI only.

**One LogEntry per group per day, never overwritten.** Even though nothing in this build
reads history beyond the archive view, storing it date-keyed now is what makes memory
features possible later. It costs one sort key.

## 6. Scrap's rendering — read this before touching art

**Scrap is drawn in canvas/SVG, not generated.** Image models drift; by night four a
generated Scrap would be a different robot, and that reads as a bug. Code-drawn means
perfect consistency and cheap state changes.

**Bedrock generates what's around him**, not him: the log entry (tier 1), the scene
description (tier 2), an accessory image (tier 3).

Five power states, driven by unique members checked in over the rolling 24h:

```
0 members        -> 'asleep'        eye dark, slumped, slow breathing glow
1               -> 'waking'         eye flickering on
2-3             -> 'low'            dim eye, antenna drooping
4-6             -> 'steady'         lit, upright, small idle motion
7+              -> 'bright'         panels lit, antenna up, animated
```

Tune thresholds to the demo group size. **Mood score must not appear in this calculation.**
Scores may change Scrap's *expression* (he sits closer, looks concerned) but never his
power. Enforce this in code, not just intent — a reviewer will look.

Assets come from Claude Design as SVG with **named separable parts** (body, head,
face plate, eye, antenna, chest light, arms) so states are attribute changes, not
separate files. Colors as CSS variables so Scrap re-tints with the theme.

Respect `prefers-reduced-motion`: static poses with a crossfade, no idle animation.

## 7. The nightly agent

EventBridge Scheduler → Lambda (Python 3.12, same pattern as the Undercurrent report):

1. Read the day's aggregates for each group: check-in count, unique members, power state
   history, deduped and shuffled note text.
2. Call Bedrock (Converse API, Haiku 4.5 — Opus/Sonnet are sales-gated on this account).
3. Ask for 3–5 sentences in Scrap's voice about the day: what he noticed, what he did
   while nobody was around, how his power held up. Warm, a little dented, never guilt-
   tripping. **Never** "nobody came, I waited alone."
4. Write a LogEntry keyed to the day. Never overwrite an existing dayKey.

Cost guards, non-negotiable: **one call per group per night, hard-capped**, low
max_tokens, and an **AWS Budget alarm at $5** before the schedule is enabled.

**Backfill before recording.** The scheduler only starts producing tonight, but the demo
and article need a lived-in log. Write `scripts/backfill-log.ts` that runs the same
generator against 5 days of synthetic aggregates so day one looks like day six. Run it
against the demo group only, and say plainly in the article that the demo history is
seeded.

## 8. Build order

**Saturday**
1. Fork, rename, new Amplify app, deploy green. Nothing else until the URL works.
2. Rename Ping → check-in in the UI. Confirm the existing flow still works end to end.
3. Robot + LogEntry models. Power calculation Lambda. Subscription wired.
4. EventBridge Scheduler + log Lambda + Bedrock call. **Prove it fires** — set it to
   every 5 minutes first, watch a real entry land, then switch to nightly.

**Sunday morning**
5. Scrap in canvas, five states, theme-aware.
6. Log display + date. Backfill script.
7. Seed the demo group. Footer disclosure line. Budget alarm on.

**Sunday afternoon — stop building**
8. Record the demo.
9. Write the article from NOTES.md: title exactly
   `Weekend Creative Agent Challenge: Signalcraft`, tag `#agents`, 500+ words, sections
   for vision / how built / AWS services + architecture / what learned / link.
10. Submit. Confirm repo is public.

## 9. Teardown plan (write this into the README)

Concept build. After evaluation closes: disable the EventBridge schedule, delete the
Amplify app, confirm no Bedrock invocations remain, keep the repo public. A nightly
scheduled job left running unattended is the failure mode here — put the date in the
README so future-you actually does it.

## 10. Working agreements

- Ask before adding a dependency. Default no.
- Prefer Amplify Gen 2 built-ins over custom CDK.
- If something takes over 30 minutes, propose the simpler version instead.
- Never end a session with the app in a non-deploying state.
- Log every non-obvious decision and every bug into NOTES.md as it happens.

## 11. Claude Code workflow (added Sun Aug 23 — token economy, agents, learn mode)

- **Read order at session start:** `PLAN.md` (find the current step) → `docs/MAP.md` → the
  last entry of `NOTES.md`. Nothing else. Do not explore the codebase; the map is the
  exploration. **Never read `src/App.tsx` or `src/river/RiverCanvas.tsx` whole** — grep the
  symbol, then Read with offset/limit.
- **One PLAN.md step per session** where possible. End every session with a green
  `npm run build`, `npx tsc -p amplify/tsconfig.json`, a commit, and a NOTES.md entry.
- **Agents** (`.claude/agents/`): `staff-engineer` — review the step's diff before committing
  (spawn it; do not self-review at length). `marketing` — anything a reader sees: README,
  article, posts, microcopy. `tutor` — learn mode (cheap model). **Steve** (`/initiate-steve`,
  hosted Managed Agent, costs real API money) at most twice: after step 4 (backend wired) and
  after step 7 (before recording).
- **Learn mode is ON.** After each step, append an entry to `docs/learn/JOURNAL.md` (React
  concept + system-design concept anchored to file:line, one check question, one "at scale"
  line). Inline if the step was small; spawn `tutor` if it touched more than ~3 files.
  Syllabus: `docs/learn/README.md`. Start each session by grading the previous answers.
- **Model tiers:** mechanical steps (renames, copy, seed data) on the cheaper tier; backend
  wiring, Scrap, and reviews on the stronger one.
- **Scope guard:** anything not in Tier 1 gets a one-line NOTES.md entry and is skipped until
  the submission is in.
