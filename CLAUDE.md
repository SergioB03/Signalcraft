# Undercurrent — Build Spec

> Drop this file at the root of the repo. Claude Code reads it automatically.

## 0. What this is

Undercurrent is a team-morale app for remote and hybrid teams. Teammates submit one
anonymous mood ping per day. The pings aggregate into a **living river** whose weather
reflects the team's collective state — calm and sunny through storm and rapids. Each
member also has an **avatar** on the river whose pose they choose themselves.

Built for the AWS Builder Center "Full Stack Challenge" (word prompt: **CURRENT**).

**The one-line thesis:** Undercurrent shortens the distance between when a team starts
struggling and when its lead finds out. It prompts a conversation; it does not replace one.

## 1. Hard constraints — read before writing any code

- **Deadline: Friday Aug 21, 3:00 PM ET.** Non-negotiable. Everything below is ordered
  by what survives if we run out of time.
- **Solo developer, ~24 working hours.** Prefer boring, working, deployed over clever.
- **Deploy on hour one.** Get a "hello world" through Amplify CI/CD to a live URL before
  building features. A broken pipeline discovered at hour 40 is a failed submission.
- **Ship > polish > scope.** If a feature threatens the deadline, cut it and note it in
  the article's "what's next" section. That's a feature of the write-up, not a failure.
- **Commit often with meaningful messages.** The commit log becomes the "How You Built It"
  section of the article.
- Keep a running `NOTES.md` of decisions, dead ends, and fixes as we go. That file becomes
  the article. Do not skip this — reconstructing it Friday afternoon wastes an hour.

## 2. Stack

- **Frontend:** React + TypeScript + Vite
- **Backend:** AWS Amplify Gen 2 (TypeScript-defined backend)
- **Auth:** Amazon Cognito via Amplify Auth — email/password. Two groups: `lead`, `member`.
- **Data + API:** AWS AppSync (GraphQL) + Amazon DynamoDB via Amplify Data.
  Real-time subscriptions are the heart of this app.
- **Compute:** AWS Lambda (weather aggregation, Bedrock report generation)
- **Scheduling:** Amazon EventBridge Scheduler (weekly report, weather decay)
- **GenAI:** Amazon Bedrock (Claude) for the "current report"
- **Hosting/CDN:** Amplify Hosting — S3 + CloudFront, CI/CD from GitHub
- **Animation:** HTML Canvas 2D for the river. No game engine. No physics library.

Do not add services beyond this list. Every one above has a real job; padding the
architecture is obvious to readers and costs hours.

> **Amendment (Aug 20):** The Bedrock report Lambda is written in **Python 3.12**
> (boto3 only, no third-party deps) via a small CDK escape hatch in `backend.ts`.
> Everything else — backend definitions, weather Lambda, frontend — stays TypeScript.
> Rationale in NOTES.md.

## 3. Scope tiers

### Tier 1 — MUST SHIP (nothing else matters until these work)
1. Cognito sign-up / sign-in, user belongs to a team (single hardcoded demo team is fine)
2. Submit a mood ping (5-point scale, one tap, optional 140-char note)
3. Weather state computed from recent pings, stored and readable
4. Canvas river that renders the current weather state
5. AppSync subscription: a ping submitted in window A visibly changes the river in window B
6. Avatar row: pick your pose, everyone sees it change live
7. Light/dark theme toggle (**+$25 credit — do not skip, it's ~30 minutes**)
8. Deployed on Amplify with a working public URL

### Tier 2 — Strong to have
9. Bedrock "current report" for leads, generated on demand from a button
10. Anonymity floor: weather does not render until >= 5 pings in the window
11. Suggested-action nudge in the report when weather is rough
12. Seeded demo data so an empty app still looks alive for the video

### Tier 3 — Only if genuinely ahead
13. EventBridge weekly scheduled report
14. Weather decay over time as pings age
15. Multi-team support / team creation flow
16. Ping streaks, history sparkline

### Explicitly OUT of scope — do not build
- Free-roaming or physics-driven avatar movement (this is multiplayer game networking;
  it will eat the entire sprint). Avatars occupy **fixed slots** with **discrete poses**.
- Slack integration, email/SNS notifications, mobile app, file uploads
- Any custom infra outside Amplify Gen 2's defined backend

## 4. Data model (Amplify Gen 2 `amplify/data/resource.ts`)

```ts
Team:      id, name, createdAt
Membership: id, teamId, userId, role ('lead'|'member'), displayName, avatarPose, updatedAt
Ping:      id, teamId, score (1-5), note?, createdAt, expiresAt (TTL)
           // NOTE: no userId on Ping. Anonymity is structural, not a UI promise.
           // Enforce one-ping-per-day via a separate PingReceipt record.
PingReceipt: id, teamId, userId, dayKey ('2026-08-21')  // unique guard, holds no score
WeatherState: id (= teamId), scene, score, pingCount, updatedAt
Report:    id, teamId, periodStart, periodEnd, body, suggestedAction, createdAt
```

Authorization: members read/write within their own team only. `Report` readable by
`lead` group only. Use Amplify's owner/group-based auth rules — do not hand-roll.

**The anonymity split is the most important design decision in this app.** Ping carries
no author. PingReceipt proves someone pinged without recording what they said. Say this
explicitly in the article.

## 5. Weather algorithm

Input: all Pings for a team in the last 24h (rolling).

```
avg = mean(score)            // 1.0 - 5.0
n   = count(pings)

if n < 5            -> scene = 'gathering'   // anonymity floor; show "waiting for the team"
else if avg >= 4.2  -> scene = 'clear'       // sunny, glassy, slow drift
else if avg >= 3.4  -> scene = 'breezy'      // bright but moving, small ripples
else if avg >= 2.6  -> scene = 'overcast'    // grey, faster, choppier
else if avg >= 1.8  -> scene = 'rough'       // rapids, whitecaps, dark
else                -> scene = 'storm'       // lightning, near-black, violent
```

Six scenes total including `gathering`. Compute in a Lambda triggered on Ping create
(or a custom mutation resolver — whichever is faster to get working), write to
WeatherState, which clients subscribe to. **Clients never compute weather locally** —
one source of truth, and the subscription is what makes the demo land.

Transitions between scenes must **tween over ~2 seconds**, never snap. The demo moment is
watching the sky darken.

## 6. Avatar poses (discrete — 5 states + idle)

`floating` (default, calm) · `raft` (holding on, listing) · `underwater` (submerged,
bubbles) · `struck` (lightning-hit, brief flash then smoking) · `coconut` (lounging in a
chair with a drink) · `waving`

Changing pose = one GraphQL mutation on Membership → subscription broadcasts → everyone's
canvas updates. Poses are **self-selected and never derived from mood data.** The weather
is what the system infers; the avatar is what the person chooses to say. Do not blur this.

Render avatars in fixed horizontal slots along the river, ordered by membership creation.
Simple sprite-ish shapes drawn in canvas or layered SVG — no art assets, no sprite sheets.
Bob them on a sine wave whose amplitude scales with the weather severity. That single
shared variable makes the whole scene feel connected for almost no code.

## 7. Design direction

The subject is water and weather, so the interface should feel like standing at a
riverbank, not like a SaaS dashboard. Avoid the analytics-tool look entirely: no KPI
cards, no gauge, no line chart on the main screen. The river *is* the visualization.

**Palette — "riverbed"** (deliberately avoiding the neon-on-black and cream-serif defaults):

```
--silt        #1B2027   deep water / dark base
--stone       #2E3944   raised surfaces
--reed        #5E7C6B   muted river green, primary accent
--sun         #E8C87E   warm low sunlight, used sparingly
--foam        #E6EDF2   near-white, text on dark
--clay        #A2603F   warning / storm accent only
```

Light theme inverts to a pale overcast sky (`#EDF1F3` base, `#1B2027` text) keeping the
same accents. Implement themes as CSS custom properties on `:root[data-theme]` so the
toggle is a single attribute flip — and so the canvas can read the same variables.

**Type:** one characteristic display face for the weather name and headings (something
with weight and a little humanity — not Inter), a quiet sans for body/UI. Set the current
scene name large and lowercase over the river. That's the page's thesis and its signature
element: the river with its state named plainly beneath it.

**Copy rules:** plain, active, never cute about someone's bad week. The empty state is an
invitation ("nobody's pinged yet today — set the tone"). The gathering state is honest
("waiting on a few more before the water shows — pings stay anonymous"). Errors say what
happened and what to do.

**Quality floor, no announcements:** responsive to mobile, visible keyboard focus, and
`prefers-reduced-motion` respected — under reduced motion, render the scene statically
with a crossfade instead of animating water. That last one is not optional; a stormy
animated canvas is genuinely a problem for some users.

## 8. Bedrock report

Prompt Bedrock with **aggregates only** — never raw notes tied to anyone, never
individual scores. Give it: date range, ping count, average by day, scene history, and
anonymized note text (deduped, order-shuffled).

Ask for exactly: 3–4 sentences on what shifted this week, plus one concrete suggested
action for the lead. Keep `max_tokens` low. **Never call Bedrock in a loop or on every
ping** — cost and latency. On-demand button first; EventBridge schedule only in Tier 3.

## 9. Build order

**Session 1 (tonight)**
1. `npm create amplify@latest`, React + TS + Vite, push to GitHub, connect Amplify Hosting,
   confirm the live URL works. **Do not proceed until a deploy is green.**
2. Auth: sign-up/sign-in, `lead` and `member` groups, seed one demo team.
3. Data model + generated client. Submit a ping, list pings. Ugly is fine.
4. Weather computation Lambda + WeatherState write. Verify by hand in the console.
5. Subscription wired to WeatherState. Prove real-time in two browser windows. **This is
   the riskiest technical step — do it tonight, not tomorrow.**

**Session 2 (Friday morning)**
6. Canvas river: six scenes, tweened transitions.
7. Avatars: slots, poses, live pose sync.
8. Theme toggle + responsive pass + reduced motion.
9. Bedrock report button.
10. Seed demo pings so the app looks populated.

**Session 3 (Friday, 1–3 PM ET) — stop building**
11. Record the 60-second walkthrough. Script it: sign in → ping → river shifts in the other
    window → change avatar to underwater → generate report. Two windows side by side.
12. Write the article from `NOTES.md` (500+ words, title format:
    `Full Stack Challenge: Undercurrent`), include the architecture overview.
13. Submit the entry form. Confirm the repo is public.

## 10. Working agreements for Claude Code

- Ask before adding any dependency. Default answer is no.
- Prefer Amplify Gen 2's built-in patterns over custom resolvers or hand-written CDK.
- When something takes more than ~30 minutes to get working, stop and propose the
  simpler version instead.
- Never leave the app in a non-deploying state at the end of a session.
- Log every non-obvious decision and every bug fixed into `NOTES.md` as it happens.
- If AWS credentials, region, or Bedrock model access cause friction, surface it
  immediately — Bedrock model access sometimes requires enabling the model in the console
  for the region, and that is a five-minute fix that can look like a one-hour bug.