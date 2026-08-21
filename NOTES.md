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
- **Second gate after verification: the Anthropic use-case form.** Invokes
  then failed with "Model use case details have not been submitted for this
  account." The console buries the form; the CLI exposes it directly
  (`aws bedrock put-use-case-for-model-access` with a base64 JSON body —
  name, website, internal/external users, industry, use case). Submitted
  from the terminal; about fifteen minutes later the report pipeline passed
  end to end.
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

### First real tester report (Fri ~1:30 AM): three bugs, three root causes

The developer signed up with a real email on the public URL (confirmation
email path proven) and reported: the dev page felt laggy, no dev access, and
"poses acting on the wrong character".

- **Wrong character = shared browser session.** Amplify keeps one
  "last signed-in user" per browser. Sign in as a second account in another
  tab and the first tab's tokens silently become that account while its React
  state still says "you are ana" — so a pose change lands on whoever the
  tokens say. Fix: listen for the cross-tab `storage` event on the auth key
  and reload, so every tab always reflects its real session; pose updates now
  surface errors instead of failing silently. (Private/incognito windows
  never had this problem, which is why the headless tests never saw it.)
- **Laggy = phone DPR.** At devicePixelRatio 3, the river was a ~3500px-wide
  backing store redrawn 60×/s. Now: DPR capped at 1.5, 30fps throttle, paused
  when the tab is hidden or the river scrolls out of view, fewer raindrops.
- **No dev access** was just group membership — granted lead + dev to the real
  account. Added a "your name on the river" editor while at it, since real
  sign-ups were stuck floating as their email prefix.
- Mobile pass: tabs were stacking vertically in the header; now a second row.

### The river, second draft (Fri ~2–3 AM): a stream going downhill

The developer didn't like the first river — a flat horizon with water below
read as "ocean", not "place". The brief: a stream running downhill with greens
on the outskirts, an indie-game feel, degrading into clouds, then rapids, storm
clouds, rain, lightning. Built on a branch so main stayed deployable.

- **Perspective from two functions of y.** `centerX(y)` is a gentle S-curve;
  `halfWidth(y)` goes from a sliver at the horizon to a third of the canvas
  at the bank. Every land feature — 260 grass strokes, 30 reeds, 12 trees,
  6 rocks, 70 flow streaks — is laid out once in unit space with a
  deterministic pseudo-random (same scenery every visit) and projected
  through those two functions, so the scene survives resizes.
- **Severity now drains the landscape, not just the sky.** Scenes gained
  bank/foliage/hill colors, all tweened through the same 2s palette mix; the
  greens go grey-green by "overcast" and near-black by "storm". Flow speed,
  chop on the bank edges, whitecaps, foam at the rocks, wind lean on reeds
  and grass, cloud mass, rain, lightning — one scalar.
- Avatars sit in fixed slots down the stream, scaled by distance; far ones
  draw first.
- **Dev-only weather preview**: a local override that never touches data, so
  every scene can be tuned by eye and shown on cue in the video.
- **GSAP + React Bits**: React Bits components are copied into the repo by
  design, so `src/ui/SceneTitle.tsx` (after SplitText) and `BlurText.tsx`
  are ours to read and change; `LoginHorizon.tsx` is a GSAP-animated SVG
  river for the login card; the card itself settles in with a timeline. All
  of it sits out under prefers-reduced-motion via `gsap.matchMedia`.
- **Forgot-password flow**, prompted by the developer locking himself out:
  Cognito's `resetPassword` → emailed code → `confirmResetPassword` → sign
  in, as two more stages of the same auth card. A good problem to have had
  before judges did.
- Review note to self: foam rings around rocks read as eyeballs. Bow-wave
  plus wake streaks instead.

### The river, third draft (Fri ~3:30 AM): corner to corner, stepping down

The toward-the-viewer stream was better but still piled avatars onto the
scene name on phones, and the developer's references (The Flame in the Flood,
River Run) pointed at a three-quarter view with the river cutting *across*
the land. Final visual round before the freeze:

- **The river is a sampled path** — 80 samples, each with position, tangent
  (downstream), normal (toward the upper bank), perspective scale, and
  half-width — running from the upper left to the lower right with a gentle
  meander. Everything is placed relative to it: grass skips the channel,
  reeds sit at lane ±1, trees stand off the banks, flow streaks ride the
  tangent, rocks rotate with the current.
- **"Descending" is two drops**: a dark lip, a foam line across the stream,
  and a churn of short streaks below, at 30% and 62% of the way down. The
  upper bank catches a highlight, the cue that the land steps down.
- **Named spots instead of free roaming** (the spec's line): drifting (auto
  slots along the stream), the headwater, the rapids, on the big rock, in
  the shade of the old tree, the shallows, the eddy. A `spot` enum on
  Membership, a picker beside the poses, the same subscription. People on
  land don't bob and cast a small shadow. Several people on one spot fan out.
- Whitecaps are short flecks; long bright strokes read as debris in a storm.
- Layout bonus: the river ends in the lower right, the scene name lives in
  the lower left, so they rarely fight; on phones the stream ends higher and
  the two downstream spots move upstream so the caption band stays clear.

### Immersive HUD experiment (Fri morning, branch `immersive-hud`)

An external design pass proposed a full-bleed river with a glass "island"
floating over it and riverstone mood selectors. Adapted rather than pasted:

- The canvas gained a `fill` mode plus `rightInset`/`bottomInset` so the
  stream ends short of the panel (desktop) or the bottom sheet (phone) —
  avatars never hide behind glass; collapsing the island lets the river run
  the full width.
- The island scrolls internally (the source clipped with overflow hidden),
  centers without transforms (the source's reduced-motion rule would have
  broken its own centering), and the header text is pinned to foam because
  it sits on a dark gradient in both themes.
- **Token lesson**: the source used `--silt` as "dark text"; in our light
  theme `--silt` is the pale page ground (tokens are roles, not colors), so
  every inherited heading vanished. `--foam` is the text role in both themes.
- Mood tiles became riverstones (irregular radii, wet glow when chosen, clay
  for a 1); labels moved to a live caption under the stones.
- Verified: click-through, scenes, light/dark, mobile sheet, collapsed state.
- **Second pass to match the mockup's composition** (merged Friday morning):
  the island moved bottom-center with the brand and tabs inside it (a pebble
  dot marks the active tab), the ping stones come first, the scene name
  moved top-left over the sky, and the header slimmed to theme + sign-out.
  The stream now ends above the panel via `bottomInset`. One regression
  caught by the phone screenshot: App.css's header-era `.tabs { order: 3 }`
  rule was pushing the in-panel tabs to the bottom of the sheet. Shared
  water spots fan *along* the current so nobody drifts under the glass.
- What we deliberately did not chase from the mockup: its hand-painted art
  style. That's an image; ours is drawn live so the weather, spots, and poses
  can change in every open window — the whole point of the app.

### The river, final form (Fri late morning): toward the viewer

The developer preferred the mockup's river running toward the viewer. Because
the scene is built on a sampled path, that was a change to the path generator
(narrow at the horizon, wide at the bottom edge, perspective scale from an
eased depth), not a rewrite — banks, reeds, drops, rocks, flow, and spots all
followed. Added a small wooden dock off the right bank.

Two offset-curve lessons, both found by screenshots at several widths:

- **A bank folds into a fin when the half-width exceeds the centerline's bend
  radius.** First fix (fade the meander to zero at the bottom) moved the fold
  upstream into a hook. Real fix: a gentle meander confined to the narrow
  upper 65% with a sin² envelope (zero slope at its end), and the foreground
  half-width capped by frame height so ultra-wide screens don't get a delta.
- **Placement vs. panels.** On desktop the panel only covers the middle of
  the wide foreground, so a spot that would sit under it moves to the outer
  water beside it; only if that's blocked too (or on a phone sheet) does it
  move upstream. People in the foreground beside the panel read like the
  mockup's characters. Shared water spots fan along the current.

### Final cut (Fri ~12:45 PM): the mockup's panel and friendlier people

- The ping panel is now exactly the mockup's three rows — brand, tabs with a
  short underline and a pebble dot, five riverstones — with a single caption.
  The note field and the ping button appear only after a stone is chosen.
  "hide" became a chevron.
- Characters got rounder heads with faces and smiles, hats by person (beanie,
  cap, sun hat — hashed from the membership id like their color), broader
  shoulders, thicker arms with hands, and black rubber inner tubes with a
  stripe in their color. Drawn ~35% larger.
- The article draft was written in parallel by a subagent from this file
  while the last visual pass ran — the deadline stayed safe either way.

### Simulation mode (Fri ~1:30 PM): a sandbox for the people who'll actually visit

Most visitors will be AWS community members, not a real team. Giving them the
dev reset would let strangers wipe the demo river; giving them nothing would
mean a static page. So: a **simulation** toggle, remembered per browser, on
by default for real sign-ups and off for the cast, leads, and dev.

- Six made-up teammates (rae, milo, sol, ivy, noor, beck) with random moods,
  poses, and spots; the visitor is the seventh and last to ping. Six pings
  already clear the five-ping floor, so the river opens showing real weather
  and the visitor's stone *shifts* it — the seven scores run through the same
  thresholds as the Lambda (`sceneFor`, mirrored for the sandbox only — real
  weather is still never computed in a browser) and the sky tweens to the
  answer. Reset re-rolls the six; "ping again" keeps them.
- A persistent "preview build" pill says which mode you're in.
- Login stays: tinkerers need an identity for the live mode and their spot.

The pill first read "nothing here reaches a real team", which was a promise the
code didn't keep: a visitor is still auto-joined to the demo team at bootstrap,
so their membership is real even though their simulated pings never leave the
browser. Changed to what is actually true — "your pings stay in this browser" —
and the name editor is hidden while simulating, so nothing they type in the
sandbox lands on the live roster. Copy that overclaims is worse than no copy.

### Multi-window simulation (Fri ~2 PM): one browser, several teammates

To record a live-looking team without seven accounts — and so a visitor can feel
what the app does with other people in it — the simulated team is **shared by
every window of one browser** while the *seat* you occupy is per window.

- The team lives in `localStorage` and changes broadcast over a
  `BroadcastChannel`, with a `storage` listener as the fallback.
- Which of the seven seats a window drives lives in `sessionStorage`, which is
  per window by definition. Open three windows, pick three seats, move three
  people, and every window sees all of it.

Three bugs came out of this, all found by driving two real windows:

- **`Number(null)` is `0`.** The seat initializer read
  `Number(sessionStorage.getItem('uc-sim-seat'))` and range-checked the result.
  With no saved seat that yields `0` — a perfectly valid seat — so every first
  window sat down in cast member #0's chair and inherited their ping. The
  visitor's first sight was "you pinged 1 — the river went rough" before they
  had touched anything, which quietly destroys the one premise the sandbox has.
  Absent has to mean absent: check for `null` before coercing.
- **A rolled team that was never written down.** The fresh six were only
  persisted on the first *change*, so a second window opened before then rolled
  its own six strangers and the two windows disagreed. The team is now written
  at mount, and a window that finds someone else's team already there adopts it
  instead of overwriting — otherwise the second window silently wins the race.
- **A window driving someone else's seat still said "you pinged".** It now
  names the seat: "rae pinged 1 — every window of this browser sees it."

### Fixing what the showcase review found (Fri ~2 PM)

An 18-agent pass driving the app through visitor use cases and viewports, with
each finding independently verified before it counted:

- **Simulation crashed the whole app to a blank page.** The new shared-state
  code read `me` inside `riverMembers`, which is declared 24 lines further
  down — a temporal dead zone that throws on every render while simulating.
  Because the preference is remembered, every later load white-screened too,
  and simulation is the *default for real sign-ups*: a community visitor would
  have met a blank page and nothing else. TypeScript catches this; the dev
  server strips types without checking them, which is exactly why the two
  failing Playwright runs I'd been blaming on flakiness were the tests being
  right. Declaration hoisted.
- **Mode flipped after first paint.** `demoAccount` starts `null`, and
  `null === false` is false, so a first-time visitor mounted in *live* mode and
  swapped to the simulation ~400ms later — real river, real roster, then six
  strangers. Undecided is now its own state: nothing mode-specific renders
  until the email and the group memberships have both resolved.
- **The simulation preference outlived the account.** It's browser-global, so
  signing out and back in as the lead landed in the sandbox and the live demo
  silently stopped working in that window. Cleared on sign-out.
- **The team tab showed the live roster while the river was simulated** — real
  names and remove buttons under a fake river. It now shows the seven seats,
  with the seat this window drives marked.
- **Avatars clipped by the bottom edge.** The relocation test only ran when the
  panel was open, so with it collapsed nothing moved and the eddy occupant
  (y ≈ 0.936h) was bisected at any height under ~1000px; with it open, the
  sideways relocation changed only x, parking the avatar clipped beside the
  panel. Off-frame is now blocked in its own right, and the limit it clamps to
  leaves 56px of tail room — a name tag hangs ~40px below its anchor.
- **"No report yet" flashed for ~200ms** before every fetched report. Absent
  and not-yet-loaded are now different states.
- **"Amplify has not been configured" on every load.** `generateClient()` runs
  at module scope, and module evaluation beat the `Amplify.configure()` call in
  `main.tsx`. Configuration moved into its own module imported first, which is
  the only ordering guarantee ES modules give you.
- The scene title got a second tight text-shadow so a pale cloud drifting
  behind it can't swallow the word.

### The panel was moving the team (Fri, during recording prep)

Caught while setting up the two-window shot: collapsing the glass panel
rearranged the river. `bottomInset` went to `0` on collapse, and it feeds both
the downstream placement limit and the under-the-panel relocation test, so
every avatar re-placed. The demo puts one window with the panel **open** (you
have to see the stones to ping) beside one **collapsed** (so the landscape
fills the frame) — which meant the two windows drew the same team in different
places, on the one screen where the whole claim is "you are both watching the
same river".

Placement is now a function of the viewport alone. Desktop reserves the panel
band whether the panel is open or not, so collapsing only uncovers more water
and nobody moves. A phone can only ever show one window, and its sheet is half
the screen, so it stays responsive there. The river's *path* never depended on
the panel — only placement did — so this was a two-line change once the cause
was clear.

The general rule, which is worth stating because it is easy to violate again:
**local UI state must never reach shared-scene geometry.** Anything a single
window can toggle — a panel, a tab, a preview override — has to leave the team
exactly where it was.

Proved rather than eyeballed: `.sync.mjs` signs in, samples the canvas above
the panel band with `getImageData`, collapses the panel, samples again, and
fails if more than 0.5% of the band changed. Water is frozen with Playwright's
`reducedMotion: 'reduce'` so only placement can move the pixels. It reports
0.006% at 1280x720 and 0.005% at 1440x900 — antialiasing, nothing else.

The first cut of the overlap-nudge spaced people by body width and production
promptly disproved it: name tags are drawn at a fixed 10.5px regardless of
depth, so "sergiobanuelos" ran straight through "ana" while both bodies were
comfortably apart. The pass now measures the string it actually draws
(`ctx.measureText`, bold face — the wider of the two) and spaces by tag width.
The screenshot that catches you is always the one with a real name in it.

### Color and character (Fri ~4:30 AM): the people stop being stick figures

The developer's last note: still too plain, characters too basic, more color.
Held to the riverbed palette, added within it:

- **Each person gets a stable personal color** hashed from their membership
  id (sun, coral, sky, moss, lavender, rose, sand, mint) — shirt, gear, name
  tag, and a matching dot on the team roster. Same color on every screen
  without a database field.
- **Bodies, faces, hair, props.** Floating = an inner tube in your color;
  raft = planks and a little flag; underwater = mask, snorkel poking above
  the surface, bubbles; struck = hair on end and hands up; coconut = a striped
  lounge chair, reclined body, a coconut with a straw and a paper umbrella;
  waving = a proper hand. A soft reflection under anyone on the water.
- **The land got warmer**: wildflowers in sun-gold, coral, foam, and mauve
  that fade out as severity rises (the first color to go when the weather
  turns); a warm earthen cut-bank with a dry sandy lip; some canopies tinted
  toward sun; mossy caps on rocks in fair weather; low warm light pooling at
  the horizon when the sun is out.
- In the storm, the people's colors are the only warmth left in the frame —
  which is the point.

### Second review pass over the delta (Fri ~4 AM): 18 agents, 9 confirmed

Everything since the first review got the same adversarial treatment. Fixed:

- **Second-tab sign-in dead-end.** A tab left on the sign-in form while another
  tab signed in would throw Amplify's raw "There is already a signed in user"
  with no way forward. Now: the cross-tab reload guard lives at the app root
  (not just inside the river), and that specific error simply proceeds — the
  tokens are valid.
- **No way to resend a confirmation code** — a spam-filtered email stranded a
  real sign-up with no in-app exit. Added "send a new code".
- **The 30fps gate was really ~20fps.** Two 60Hz vsyncs sum to 33.3ms, which
  rounds under 33.333 most of the time, skipping to a juddery 3-vsync cadence.
  A 1ms slack fixes it (verified by the reviewer on a 240Hz panel and by
  simulation at 60/120/144Hz).
- **Reseed erased the report the shot list's fallback depends on.** Reseed
  now keeps reports; the prep step generates one before recording.
- **"Already pinged" didn't clear after a reset** — added an in-card retry.
- Phone anchors for the shallows/eddy landed under the caption; moved
  upstream, stream ends higher, name tag suppressed in the caption band.
- Honest wording for remove-member (they rejoin on next sign-in), and the
  removed user's own tab stops acting on a ghost id.
- Five seed pings instead of seven, so the team tab never shows more pings
  than members at the one-ping-a-day beat.
- Shot list: the terminal reseed targets the sandbox unless `OUTPUTS` points
  at production — spelled out, with the in-app button as the safe path.

### Decision: scaffold = Vite template + `create-amplify` on top

`npm create vite@latest` (react-ts template) into a temp dir merged into the repo root
(the root wasn't empty — LICENSE, .gitignore), then `npm create amplify@latest` to add
the `amplify/` backend folder. Kept the repo's existing comprehensive Node .gitignore
and appended Amplify-specific entries instead of taking Vite's smaller one.