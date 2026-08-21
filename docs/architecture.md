# Undercurrent — Architecture

How the system fits together, and *why* it's shaped this way. Diagrams are Mermaid —
GitHub renders them inline.

## System overview

```mermaid
flowchart LR
    subgraph client["Browser — React + Vite (TypeScript)"]
        UI["React UI<br/>ping form · avatar picker · theme toggle"]
        Canvas["Canvas 2D river<br/>six weather scenes"]
    end

    subgraph aws["AWS — all provisioned by Amplify Gen 2"]
        Hosting["Amplify Hosting<br/>S3 + CloudFront, CI/CD from GitHub"]
        Cognito["Amazon Cognito<br/>email/password · groups: lead, member"]
        AppSync["AWS AppSync<br/>GraphQL API + real-time subscriptions"]
        DDB[("DynamoDB<br/>Team · Membership · Ping · PingReceipt<br/>WeatherState · Report")]
        WeatherFn["Weather Lambda — TypeScript<br/>recomputes on every ping"]
        ReportFn["Report Lambda — Python 3.12<br/>on-demand, leads only"]
        Bedrock["Amazon Bedrock (Claude)<br/>the 'current report'"]
    end

    Hosting -->|serves| UI
    UI -->|sign in| Cognito
    UI -->|mutations & queries| AppSync
    AppSync <--> DDB
    DDB -.->|"stream: Ping created"| WeatherFn
    WeatherFn -->|"updateWeatherState mutation (IAM auth)"| AppSync
    AppSync -.->|"subscription push"| Canvas
    UI -->|"generate report (lead)"| AppSync
    AppSync --> ReportFn
    ReportFn -->|aggregates only| Bedrock
    ReportFn --> DDB
```

Dashed arrows are the real-time path — the part that makes the demo land.

## The life of a ping

The core loop of the whole app. Window A pings; window B's river changes.

```mermaid
sequenceDiagram
    actor A as Teammate (window A)
    participant R as React app
    participant AS as AppSync
    participant DB as DynamoDB
    participant WF as Weather Lambda (TS)
    actor B as Teammate (window B)

    A->>R: taps mood 2/5, adds optional note
    R->>AS: createPingReceipt(teamId, userId, dayKey)
    Note over AS,DB: the receipt is the one-per-day guard — it holds no score
    AS->>DB: put PingReceipt
    R->>AS: createPing(teamId, score, note)
    Note over AS,DB: the ping holds the score — but no userId
    AS->>DB: put Ping (TTL: 24h)
    DB--)WF: stream event: Ping created
    WF->>DB: read team's pings from last 24h
    WF->>WF: avg + count → scene (see algorithm below)
    WF->>AS: updateWeatherState mutation (IAM auth)
    Note over WF,AS: must go through AppSync, not a direct DB write —<br/>subscriptions only fire on AppSync mutations
    AS->>DB: put WeatherState
    AS--)B: subscription push: new WeatherState
    B->>B: canvas tweens to the new scene over ~2s
```

**The gotcha worth knowing:** AppSync subscriptions fire when a *mutation goes through
AppSync* — not when a row changes in DynamoDB. If the weather Lambda wrote straight to
the table with `PutItem`, every client would silently see a stale river. This is the
riskiest wire in the system and the reason real-time gets proven on night one.

## Data model — anonymity is structural

```mermaid
erDiagram
    TEAM ||--o{ MEMBERSHIP : has
    TEAM ||--o{ PING : receives
    TEAM ||--o{ PING_RECEIPT : receives
    TEAM ||--|| WEATHER_STATE : "has exactly one"
    TEAM ||--o{ REPORT : generates

    MEMBERSHIP {
        string id
        string teamId
        string userId
        string role "lead or member"
        string displayName
        string avatarPose "self-selected, never inferred"
    }
    PING {
        string id
        string teamId
        int score "1-5 — NO userId on this record"
        string note "optional, 140 chars"
        datetime createdAt
        datetime expiresAt "DynamoDB TTL"
    }
    PING_RECEIPT {
        string id
        string teamId
        string userId
        string dayKey "e.g. 2026-08-21 — NO score on this record"
    }
    WEATHER_STATE {
        string id "equals teamId"
        string scene
        float score
        int pingCount
        datetime updatedAt
    }
    REPORT {
        string id
        string teamId
        string body
        string suggestedAction
        datetime createdAt
    }
```

The most important design decision in the app: **`Ping` has a score but no author;
`PingReceipt` has an author but no score.** One-ping-per-day is enforced on the
receipt. A UI can promise anonymity and be wrong later — a schema physically cannot
leak what it never stored. General pattern: *enforce invariants in the data model,
not the interface.*

Two smaller notes:

- `expiresAt` uses DynamoDB TTL so old pings clean themselves up — but TTL deletion is
  lazy (can lag by hours), so the weather Lambda still filters by `createdAt`. TTL is
  cleanup, not correctness.
- `WeatherState.id` *is* the teamId — a one-row-per-team materialized view. Clients
  subscribe to exactly one tiny row instead of streaming pings.

## Weather algorithm

Server-side only. Clients never compute weather locally — one source of truth, and the
anonymity floor is enforced where users can't bypass it.

```mermaid
flowchart TD
    P["all pings for the team, last 24h (rolling)"] --> N{"count ≥ 5?"}
    N -- "no — anonymity floor" --> G["gathering<br/>'waiting for the team'"]
    N -- yes --> A{"average score"}
    A -- "≥ 4.2" --> C["clear — sunny, glassy, slow drift"]
    A -- "3.4 – 4.2" --> BR["breezy — bright but moving"]
    A -- "2.6 – 3.4" --> O["overcast — grey, choppier"]
    A -- "1.8 – 2.6" --> R["rough — rapids, whitecaps"]
    A -- "< 1.8" --> S["storm — lightning, near-black"]
```

Scene transitions tween over ~2 seconds on the canvas — never snap. A single severity
scalar (0–1) derived from the scene drives water speed, palette shift, *and* avatar
bobbing amplitude, which makes the whole scene feel connected for almost no code.
Under `prefers-reduced-motion`, scenes render statically and crossfade.

## Where each language lives

| Location | Language | Why |
|---|---|---|
| `src/` — React app, canvas river | TypeScript | Frontend stack |
| `amplify/` — backend definitions (auth, data, wiring) | TypeScript | Amplify Gen 2 defines infrastructure in TS; this is not optional |
| `amplify/functions/compute-weather/` — weather aggregation | TypeScript | Hot path; uses Amplify's IAM-authed data client so the AppSync mutation (and therefore the subscription) actually fires |
| `amplify/functions/report-py/` — Bedrock report | Python 3.12 | Off the critical path, boto3-only (no packaging), invoked on demand by leads. Deliberate learning slice. |

## Why it's built this way — the five load-bearing decisions

1. **Buy the real-time layer, don't build it.** The demo *is* "ping in window A, river
   changes in window B." Hand-rolling WebSocket fan-out is weeks; AppSync gives it as a
   schema feature, and Amplify Gen 2 provisions everything from TypeScript with CI/CD
   on git push. Spend hours on what's differentiated (the river), buy the rest.
2. **Anonymity is structural, not promised** (see data model above).
3. **Weather is a materialized view.** Pings are the write model; `WeatherState` is a
   precomputed read model, one row per team, recomputed by a Lambda on each ping.
   Consistency (every window shows the same river), enforcement (the 5-ping floor
   lives server-side), efficiency (subscribers get one tiny row).
4. **The Lambda mutates through AppSync, never straight to DynamoDB** — otherwise no
   subscription fires (see the gotcha above).
5. **One shared severity scalar animates everything** — water, sky, avatar bobbing —
   so six scenes stay cheap and coherent.

## Privacy boundary for GenAI

The Python report Lambda sends Bedrock **aggregates only**: date range, ping counts,
daily averages, and note text that has been deduped and order-shuffled. Never
individual scores, never a note tied to a person — the Lambda physically can't,
because pings carry no author. Two extra floors on top of the structural anonymity:
no report is generated at all below 5 pings (mirroring the weather floor), and days
with fewer than 3 pings report their count but withhold the average — a one-ping
day's "average" is one person's exact answer with a date on it. Same principle as
the schema: the boundary is structural, enforced where the data leaves the system.