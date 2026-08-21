# Design feedback brief — Undercurrent

> Paste everything below the line into a design assistant (Claude Design, Google
> AI Studio, etc.). Attach the screenshots in `docs/screenshots/` if the tool
> accepts images. Live app: https://main.d3unb3p2wvfry3.amplifyapp.com

---

I'm building **Undercurrent**, a team-morale web app, and I want design
suggestions I can implement *today* in my existing React codebase. Please read
the constraints carefully — I can only use suggestions that fit the stack below.

## What the product is

Teammates on a remote team each submit **one anonymous mood ping per day** (a
1–5 score plus an optional 140-character note). The pings aggregate into a
**living river** that everyone watches in real time: the team's collective state
is rendered as weather on a stream — *clear, breezy, overcast, rough, storm* —
plus a *gathering* state shown until at least 5 people have pinged (an anonymity
floor). Each member also appears on the river as a small **avatar** with a
self-chosen **pose** (floating in an inner tube, waving, on a raft, underwater
with a snorkel, struck by lightning, lounging in "coconut mode") and a
self-chosen **spot** (drifting, the headwater, the rapids, on the big rock, in
the shade of the old tree, the shallows, the eddy). Poses and spots are
expression, never inferred from mood data. A team **lead** can generate a short
AI-written "current report" from aggregates only.

**Thesis:** the app shortens the distance between when a team starts struggling
and when its lead finds out. It prompts a conversation; it does not replace one.

**Vibe we're going for:** "Riverbank naturalism — muted, weathered, atmospheric.
The interface is a place, not a dashboard. Standing at the edge of a river you
know well, reading the water before you step in." References: the quiet
three-quarter landscapes of *The Flame in the Flood* and small indie games — not
SaaS analytics.

## How it's built (so your suggestions fit)

**Frontend (the part you're advising on):**
- **React 19 + TypeScript + Vite.** Function components and hooks only. A
  single page; "tabs" (river / team / report / dev) are plain React state keyed
  to the URL hash — there is no router.
- **Styling is plain CSS** in two files (`index.css`, `App.css`) using **CSS
  custom properties** as role-based theme tokens on `:root[data-theme]`. Light
  and dark themes are one attribute flip. No Tailwind, no MUI/shadcn/Chakra, no
  CSS-in-JS. Suggestions should be expressed as CSS (selectors + properties) or
  small TSX changes.
- **The river is HTML Canvas 2D**, drawn procedurally every frame — sky, hills,
  a diagonal stream with two drops, banks with grass/reeds/trees/wildflowers,
  rocks, flow streaks, rain, lightning, and the avatars. **No WebGL, no
  Three.js, no image or sprite assets** — every shape is code. One scalar,
  *severity* (0–1), drives the whole scene (colors, flow speed, chop, cloud
  mass, rain, how far the greens drain out of the banks, avatar bobbing).
  Scene changes tween over ~2 seconds.
- **Motion:** GSAP 3 is available (login-card entrance, a split-text reveal on
  the scene name, a blur-in tagline, an animated SVG horizon on the login card).
  "React Bits"-style components are copied into `src/ui/` and are ours to edit.
- **Typography:** Fraunces (Google Fonts) for the display face — the large
  lowercase scene name and headings — and the system sans for body/UI.
- **Accessibility floor (non-negotiable):** `prefers-reduced-motion` must be
  respected (we render still frames with crossfades instead of animating),
  visible keyboard focus on every interactive element, works on a 360px phone.
- **Dependencies:** I cannot add npm packages beyond React, aws-amplify, and
  GSAP today.

**Backend (context only — do not redesign it):** AWS Amplify Gen 2: Cognito
auth with `lead`/`member`/`dev` groups, AppSync GraphQL with real-time
subscriptions over DynamoDB, a TypeScript Lambda that recomputes the weather on
every ping and publishes it so every open browser updates live, a Python Lambda
that calls Amazon Bedrock (Claude) for the lead's report. Anonymity is
structural: the record holding a score has no author; the record holding an
author has no score.

## The palette (please stay inside it)

| Token | Hex | Role |
|---|---|---|
| `--silt` | `#1B2027` | deep water, dark page ground |
| `--stone` | `#2E3944` | raised surfaces, cards |
| `--reed` | `#5E7C6B` | muted river green, primary accent |
| `--sun` | `#E8C87E` | warm low light, used sparingly |
| `--foam` | `#E6EDF2` | near-white, text on dark |
| `--clay` | `#A2603F` | storm and warning states only |

Light theme: `#EDF1F3` ground, `#1B2027` text, white cards, same accents (sun
darkens to `#8a6a1f` for contrast). Each member also has a stable personal
color from a small set (sun, coral, sky, moss, lavender, rose, sand, mint) used
for their avatar's shirt/gear, name tag, and roster dot.

## What's on screen today

1. **Login card** — animated SVG river horizon on top; brand, tagline, email +
   password, sign in / create account / confirm code / forgot password / reset.
2. **Home shell** — header with brand, pill tabs, theme toggle ("daylight" /
   "dusk"), sign out.
3. **River hero** (always visible, every tab) — the canvas; the scene name in
   large lowercase Fraunces over the lower-left with a one-line caption
   ("grey and choppy — 5 pings today, average 3.6").
4. **"you, on the river" card** — pose picker (pill buttons), spot picker
   (pill buttons + hint), "your name on the river" text field.
5. **"drop today's ping" card** — five mood tiles (1 sinking · 2 choppy ·
   3 steady · 4 flowing · 5 glassy), optional note, ping button; after
   pinging, a confirmation line.
6. **team** tab — roster with colored dots, you/lead tags, pose + joined date,
   participation line ("5 pings in the last 24 hours — the water is showing").
7. **report** tab (leads) — the latest AI report, period, body, "try this:"
   action, generate button.
8. **dev** tab (test accounts) — weather preview buttons, reset actions.

## What I want from you

Give me **ranked suggestions, highest impact per hour first, totalling no more
than ~2 hours of implementation**, each with:

- **What** to change and **why** it serves the riverbank-not-dashboard feel.
- **Where**: which screen/component/CSS selector from the list above.
- **How**: for layout/typography/color/spacing/micro-interaction ideas, give
  the CSS (selectors and properties) or a small TSX snippet. For canvas ideas,
  describe shapes, colors (hex within the palette), and motion in words — I'll
  draw them in Canvas 2D. For motion ideas, describe the GSAP timeline
  (targets, from/to, duration, ease, stagger).
- **Effort**: S / M / L.
- How it behaves in **both themes**, on a **360px phone**, and under
  **reduced motion**.

Areas I especially want eyes on: the overall composition and spacing rhythm of
the home shell; the hierarchy between the river hero and the cards below; the
mood tiles (could they feel more like part of the riverbank?); the login card;
empty/loading/confirmation states and their copy tone (plain, active, never
cute about someone's bad week); the team roster; and any small "indie game"
charm on the canvas that's cheap to draw.

## Please don't suggest

New UI frameworks or component libraries, Tailwind, WebGL/Three.js, image or
sprite assets, illustrations I'd need to source, charts/KPI cards/gauges/
dashboards, changes to the data model or the anonymity design, or anything
that needs more than the two hours above.
