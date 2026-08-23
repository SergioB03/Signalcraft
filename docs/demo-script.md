# Demo — 75 seconds, single take, screen recording

## Setup before rolling (public URL, not the sandbox)

- Two windows side by side (Win+Left / Win+Right). Left: normal window signed in as `demo1` (ana, lead). Right: InPrivate window signed in as `demo2` (kai). Private windows do not share the Amplify login.
- Reset so nobody in the demo group has checked in today and Scrap reads asleep (dev tab → forget today's check-ins (receipts), or `scripts/reset-demo.ts` with `OUTPUTS` pointed at production).
- Confirm the log panel shows the latest entry with its date and the seeded days behind it.
- Start in dark theme. Mute notifications. 1080p. Cursor visible.

## Beats

| Time | Beat | On screen | Caption / voiceover |
|---|---|---|---|
| 0:00–0:08 | Open on the rule | Panel collapsed; Scrap asleep: eye dark, slumped, slow breathing glow | "Signalcraft. Scrap is powered by honesty, not by happiness. A bad day powers him as much as a good one. He only runs low when nobody says anything." |
| 0:08–0:22 | A check-in changes Scrap | Right window: pick a **low** score (1 or 2), short honest note, "check in". Cut to the left window, untouched: Scrap wakes within a few seconds; caption flips to "waking" | "A low score. He still powers up. Power comes from who showed up, not what they said." |
| 0:22–0:34 | Show it is structural | Left: group tab, "N checked in today", never who. Optional 3-second cut to `compute-power/handler.ts`: it reads `PingReceipt`, which has no score field | "The table that powers him has no mood column. It is not a rule in a comment." |
| 0:34–0:52 | The overnight log, with its date | Left: log tab. Latest entry with its date header. Hold long enough to read two sentences. Scroll back a day; pause on the seeded label | "Every night an EventBridge Scheduler wakes a Lambda that asks Claude on Bedrock for a few sentences in Scrap's voice. Nobody triggers it. Entries for Aug 18–22 are seeded and labeled — say it on camera." |
| 0:52–1:02 | Terminal check-in | In a terminal: `OUTPUTS=prod/amplify_outputs.json npx tsx scripts/checkin-as.ts demo4@signalcraft.local 5 'great day'` — Scrap steps up a state live in both windows | "A 2 and a 5 power him exactly the same. Five of you, and he is bright." |
| 1:02–1:12 | Theme and the footer | Toggle daylight; Scrap re-tints. Pan to the footer | "Scrap is drawn in code, so he is the same robot every night. It ends on purpose." |
| 1:12–1:15 | End card | Scrap, the rule in one line, the repo URL | — |

## Fallbacks

- Subscription slow: switch the left window to the group tab and back to force a refresh; do not re-submit the check-in.
- Latest log entry missing: show the most recent seeded entry and say the word "seeded" on camera.
- "already checked in today": run the reset and retry before recording; the card does not refresh on its own.
