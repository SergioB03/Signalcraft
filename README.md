# undercurrent

A team-morale app where the team *is* the weather. Everyone drops one anonymous
mood ping a day; the pings aggregate into a living river — calm and sunny through
storm and rapids — that every teammate watches change in real time. Each member
floats on the river as an avatar whose pose they choose themselves.

Built solo in ~24 hours for the AWS Builder Center **Full Stack Challenge**
(word prompt: **CURRENT**).

**Live app:** https://main.d3unb3p2wvfry3.amplifyapp.com

> The one-line thesis: Undercurrent shortens the distance between when a team
> starts struggling and when its lead finds out. It prompts a conversation;
> it does not replace one.

## The two ideas worth stealing

**Anonymity is structural, not promised.** A `Ping` carries a score but no
author; a `PingReceipt` carries an author but no score. The schema physically
cannot leak what it never stored. One-ping-per-day rides on the receipt's
deterministic id and DynamoDB's conditional writes.

**One source of truth for the weather.** Clients never compute weather locally.
A Lambda on the Ping table's stream recomputes a single `WeatherState` row per
team and publishes it through an AppSync mutation — which is what makes every
open browser's river change at once. Below 5 pings, the average never leaves
the server (the "anonymity floor").

## Stack

React + TypeScript + Vite · AWS Amplify Gen 2 (Cognito, AppSync + DynamoDB,
Lambda) · Amazon Bedrock (Claude Haiku 4.5) for the lead's "current report" ·
Canvas 2D for the river (no game engine, no art assets). One Lambda is
deliberately Python 3.12 + boto3.

Architecture, diagrams, and the five load-bearing decisions:
[docs/architecture.md](docs/architecture.md). The full build log — decisions,
dead ends, and fixes as they happened: [NOTES.md](NOTES.md).

## Run it

```bash
npm install
npx ampx sandbox        # deploys a personal cloud backend, writes amplify_outputs.json
npm run dev             # http://localhost:5173
```

Useful scripts (all `npx tsx scripts/<name>.ts`, credentials via
`TEST_EMAIL`/`TEST_PASSWORD` env vars):

- `seed-demo.ts` — seed a day of demo pings past the anonymity floor
- `prove-realtime.ts` — end-to-end proof: ping → stream → Lambda → AppSync
  mutation → subscription event, pass/fail in 30s
- `prove-report.ts` — end-to-end proof of the Bedrock report path (lead account)