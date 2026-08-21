# 60-second walkthrough — shot list

Two browser windows side by side (`Win+←` / `Win+→`). **Left: a normal window
signed in as `demo1` (ana, the lead). Right: an InPrivate/Incognito window
signed in as `demo2` (kai).** Tabs share a login; private windows don't.

Before recording, **on the public URL** (the sandbox is a different backend —
the in-app button is the safe path):

1. In a third private window, sign in as `dev@undercurrent.local` → **dev** tab
   → **wipe and reseed**. The river is now past the floor, nobody has pinged
   today, and any existing report is kept.
2. Switch that window to the **report** tab and press **generate current
   report** once, so a finished report exists as the fallback for beat 5.
3. Close the dev window.

(Terminal equivalent, if you must: `OUTPUTS=<path to the main branch's
amplify_outputs.json> DEV_EMAIL=dev@undercurrent.local DEV_PASSWORD=…
npx tsx scripts/reset-demo.ts reseed` — without `OUTPUTS` it resets the local
sandbox, not the public river.)

| t | Beat | What the viewer sees |
|---|---|---|
| 0–8s | **Open on the river.** In both windows press **hide** on the glass panel first, so the landscape fills the frame — same scene name bottom-left, the cast on the stream. Tap the ≈ bubble to bring the panel back when you need it. | "Undercurrent: one anonymous mood ping a day, and the team becomes the weather." |
| 8–20s | **Ping from the right window (kai).** Pick a low score — 1 or 2 — add a short note, press ping. | The right window shows "your ping is in the river." Within a second the **left** window's sky darkens and the scene name changes — untouched. |
| 20–30s | **Point at the anonymity.** Open the left window's **team** tab: "N pings in the last 24 hours" with a roster — but never who pinged. | Roster with ana tagged lead; the participation line. |
| 30–40s | **Move in the right window** — pick "the eddy", then pose "underwater". | Kai drifts to the calm pool and submerges in **both** windows. "Where you sit and how you sit are chosen, never inferred." |
| 40–55s | **Left window, report tab: generate current report.** | The button spins "reading the water…", then a 3–4 sentence read of the week and one suggested action appear — written by Claude on Bedrock from aggregates only. |
| 55–60s | **Toggle the theme, land back on the river.** | Daylight / dusk flip; the river stays itself. End on the scene name. |

Fallbacks: if the report takes longer than ~20s, cut to the pre-generated one
from prep step 2 (the panel shows the latest report on load). If a ping reads
"already pinged today", run the dev tab's **forget today's pings**, then in the
pinging window click **think that's wrong? try again** (or switch to the team
tab and back) — the card doesn't refresh on its own.
