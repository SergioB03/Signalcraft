# 60-second walkthrough — shot list

Two browser windows side by side (`Win+←` / `Win+→`). **Left: a normal window
signed in as `demo1` (ana, the lead). Right: an InPrivate/Incognito window
signed in as `demo2` (kai).** Tabs share a login; private windows don't.

Before recording: on the **dev** tab (sign in as `dev@…` in a third private
window, or run `npx tsx scripts/reset-demo.ts reseed`) run **wipe and reseed**
so the river is past the floor and nobody has pinged today. Then close the dev
window.

| t | Beat | What the viewer sees |
|---|---|---|
| 0–8s | **Open on the river.** Both windows showing the same scene name large over the water, five avatars bobbing. | "Undercurrent: one anonymous mood ping a day, and the team becomes the weather." |
| 8–20s | **Ping from the right window (kai).** Pick a low score — 1 or 2 — add a short note, press ping. | The right window shows "your ping is in the river." Within a second the **left** window's sky darkens and the scene name changes — untouched. |
| 20–30s | **Point at the anonymity.** Open the left window's **team** tab: "N pings in the last 24 hours" with a roster — but never who pinged. | Roster with ana tagged lead; the participation line. |
| 30–40s | **Move in the right window** — pick "the eddy", then pose "underwater". | Kai drifts to the calm pool and submerges in **both** windows. "Where you sit and how you sit are chosen, never inferred." |
| 40–55s | **Left window, report tab: generate current report.** | The button spins "reading the water…", then a 3–4 sentence read of the week and one suggested action appear — written by Claude on Bedrock from aggregates only. |
| 55–60s | **Toggle the theme, land back on the river.** | Daylight / dusk flip; the river stays itself. End on the scene name. |

Fallbacks: if the report takes longer than ~20s, cut to a pre-generated one
(the panel shows the latest report on load). If a ping reads "already pinged
today", the dev tab's **forget today's pings** clears it in two seconds.
