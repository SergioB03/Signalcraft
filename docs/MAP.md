# Codebase map

> Read this instead of exploring. Line refs are from the fork commit (Undercurrent
> `75047cb`); after edits, grep the symbol name. **Never open `src/App.tsx` (1572 lines) or
> `src/river/RiverCanvas.tsx` (1301 lines) whole** — grep, then Read with offset/limit.

## Shape

React 19 + TS + Vite, no router, no state library, no context. One `App.tsx` holds every
component; a Canvas-2D river renderer; Amplify Gen 2 backend with Cognito groups, AppSync +
DynamoDB (userPool default auth), two Node Lambdas, one Python Bedrock Lambda via CDK.

```
main.tsx - imports ./amplify-setup FIRST (configure before any generateClient) - <App/>
App (App.tsx:276)  stage: loading | signIn... | in
+- AuthGate (314)   sign-in/up/confirm/forgot/reset state machine + LoginHorizon
+- Home (531)       .app-viewport > RiverCanvas ; header (theme toggle, sign out)
   +- SceneTitle + caption (scene-label)
   +- island (tabs via URL hash): PingForm (1442) | pose/spot + NameEditor (976)
                                  | TeamPanel | ReportPanel (1160) | DevPanel (1232)
```

## Backend (`amplify/`)

| File | What |
|---|---|
| `backend.ts` (119) | `defineBackend({auth,data,computeWeather,resetDemo})`. Ping stream → compute-weather (Policy + `EventSourceMapping`, :30-54). Ping TTL on `expiresAt` (:59-62). `createStack('report')` + Python 3.12 `LambdaFunction` from `Code.fromAsset(functions/report-py)` with env `PING_TABLE_NAME`, `REPORT_TABLE_NAME`, `BEDROCK_MODEL_ID` (:72-88); IAM: table grants + `bedrock:InvokeModel` on `foundation-model/anthropic.*` **and** `inference-profile/us.anthropic.*` (:90-113); ReportRequest stream → Lambda (:114-119). **No scheduler exists.** |
| `data/resource.ts` (129) | Models: `Team`, `Membership` (id `teamId#userId`; role/displayName/avatarPose/spot), `Ping` (teamId, score 1-5 validated, note ≤140, expiresAt; **create-only, no userId**), `PingReceipt` (teamId, userId, dayKey; owner create/read; id `userId#dayKey` → one per day via built-in `attribute_not_exists(id)`), `WeatherState` (id = teamId; scene/score/pingCount; read-only to clients), `Report`, `ReportRequest` (lead), mutation `resetDemoDay` (dev or lead). Schema-level `allow.resource(computeWeather)`, `allow.resource(resetDemo)` = IAM access for Lambdas. |
| `auth/resource.ts` (18) | `defineAuth({ loginWith:{email:true}, groups:['lead','member','dev'] })`. Group assignment is manual. |
| `functions/compute-weather/` | `defineFunction({ resourceGroupName:'data' })` (required: reads the data API **and** is stream-triggered → else circular stack). Handler: IAM data-client boilerplate (:1-9), INSERT+REMOVE → teamIds, `Ping.list` createdAt > now-24h, `pickScene(n,avg)` (:81-88), upsert `WeatherState` via AppSync **so subscriptions fire**. **Template for `compute-power`.** |
| `functions/report-py/handler.py` (215) | boto3 only. Scan Ping (teamId + createdAt > 7d), aggregates (floor 5, per-day avg hidden under 3, notes deduped+shuffled ≤30), `bedrock.converse(modelId, maxTokens=500)`, `ACTION:` rpartition parse, fallback body on failure, `put_item` with `__typename/createdAt/updatedAt` so rows read through AppSync. **Template for the nightly log Lambda.** |
| `functions/reset-demo/` | Custom-mutation handler: paginated deleteAll by teamId; scopes receipts / all / reseed. |
| `amplify.yml` | `npm install` (not `npm ci` — lockfile bug) → `npx ampx pipeline-deploy`; frontend `npm run build` → `dist`. |

Bedrock: `us.anthropic.claude-haiku-4-5-20251001-v1:0` is the **only** allowed Anthropic model (Opus/Sonnet sales-gated). Account verification + use-case form are already done (account-level → they carry over).

## Frontend (`src/`)

- **Data client:** `const client = generateClient<Schema>()` at module scope (App.tsx:26). `TEAM_ID='demo-team'` (:29), `ANONYMITY_FLOOR=5` (:31).
- **Hooks:** `useTheme` (:190; localStorage `uc-theme`, sets `documentElement.dataset.theme`), `useHashView` (:213; tabs = URL hash), `useGroups` (:235; `cognito:groups` from the access token), `useViewport` (:254; narrow under 600px), `useSimState` (:94; browser-local simulation — **not needed for Signalcraft tier 1**).
- **Subscriptions** (Home, mount-only effects): `WeatherState.observeQuery()` (:639), `Membership.observeQuery({filter teamId})` (:650). Cleanup = `sub.unsubscribe()`. **Template for `Robot.observeQuery`.**
- **Bootstrap** (:601-632): `Team.create` (ignore conflict), `getCurrentUser`, Membership get-or-create with a `cancelled` flag (StrictMode-safe).
- **Check-in (PingForm :1442-1572):** MOODS 1..5 (:1434); `localDayKey()` (:268 — **local** day); `PingReceipt.create` with id `userId#dayKey` — a `condition` error means already checked in today (status `'already'`); otherwise `Ping.create({teamId, score, note, expiresAt: now+8d in seconds})` — **no userId**. The `receiptHeld` ref prevents re-creating the receipt on retry. **Reuse wholesale; rename copy only.**
- **ReportPanel** (:1160-1229): list → create `ReportRequest` → poll every 3s for ≤60s (the Lambda writes DynamoDB directly → no subscription). **Template for reading `LogEntry`.**
- **Theme tokens** (`index.css:5-26`): roles, not colors — `--silt` ground, `--silt-deep`, `--stone` raised surface, `--foam` **text**, `--reed` accent, `--sun` highlight/focus, `--clay` danger, `--on-accent`. `:root` / `[data-theme='dark']` vs `[data-theme='light']`. Fraunces for h1/h2/.brand. **Scrap's fills use these vars.**
- **RiverCanvas** (`river/RiverCanvas.tsx`): props `{scene, members, fill, rightInset, bottomInset}` mirrored into refs; mount-only rAF loop (30fps gate `FRAME_MS-1`, DPR ≤1.5, pauses when hidden/offscreen); `[scene]` effect retargets a 2s palette tween; reduced motion → static frame + 1.2s overlay crossfade (:229, `drawStatic`). Scene colors are **absolute hex** in `river/scenes.ts` (theme never reaches the canvas — by design). Leave it as the background; don't modify.
- **CSS:** `App.css` (components) then `hud.css` (immersive layer: `.app-viewport`, `.full-bleed-canvas`, `.viewport-header`, glass `.riverbank-island.dock-bottom`, `.island-tabs`, `.hud-bubble`, 600px bottom-sheet breakpoint). Reduced-motion overrides at `App.css:609`, `hud.css:443`.
- **GSAP** only in `ui/SceneTitle`, `ui/BlurText`, `ui/LoginHorizon`, and the AuthGate entrance — all gated on reduced motion.

## Scripts (`scripts/`, run with `npx tsx`)

Shared preamble: `OUTPUTS` env (default `../amplify_outputs.json`) → `Amplify.configure` → `generateClient` → `signOut` + `signIn(TEST_EMAIL/TEST_PASSWORD)`. Cognito user-pool auth only; no IAM keys. `seed-demo.ts` (5 pings) is the **template for `backfill-log.ts`**; `seed-members.ts` signs in as demo1..demo5@undercurrent.local (`DEMO_PASSWORD`) and upserts Memberships; `prove-report.ts` = create trigger row, poll 90s, reject fallback bodies (**template for `prove-log.ts`**); `reset-demo.ts` calls the mutation. Scripts are excluded from every tsconfig — errors surface at runtime.

## Undercurrent deploy facts

Live: `https://main.d3unb3p2wvfry3.amplifyapp.com` (app `d3unb3p2wvfry3`, branch `main`). Region is never stated in docs; the `us.` inference profile implies US (the CLI config says `us-east-1`). Demo accounts `demo1..demo5@undercurrent.local` (ana lead, kai, mira, theo, june) + `dev@undercurrent.local` live in **Undercurrent's** user pool — a new Amplify app gets a new pool, so Signalcraft must recreate them.

## Gotchas that will bite again

1. `amplify_outputs.json` is gitignored and generated — nothing runs without `npx ampx sandbox` (needs a live `aws login`) or a pipeline deploy.
2. Root `tsc -b` never type-checks `amplify/` — run `npx tsc -p amplify/tsconfig.json` before pushing.
3. Subscriptions fire only for AppSync mutations. Lambda → AppSync (IAM) = live; Lambda → DynamoDB `put_item` = poll.
4. A function that reads the data API **and** is stream-triggered needs `resourceGroupName:'data'`.
5. Bedrock IAM needs both the foundation-model and the inference-profile ARN for `us.` profiles.
6. Python Lambda asset = raw directory zip; boto3 only, no pip.
7. Day keys are local calendar days; UTC would roll at 8 PM ET.
8. `expiresAt` is epoch **seconds**; TTL is lazy — correctness comes from `createdAt` filters.
9. StrictMode double-runs effects: deterministic ids + the built-in conditional create absorb it; use `cancelled` flags.
10. `--silt` is ground and `--foam` is text — using `--silt` as "dark text" vanishes in light mode.
11. New canvas props must be mirrored into refs or the rAF loop never sees them.
12. Scripts hit the sandbox unless `OUTPUTS` points at the production outputs file.

## Where Signalcraft's changes land

| New / changed | Why |
|---|---|
| `amplify/data/resource.ts` | + `Robot` (id = teamId; powerState enum, signalCount, uniqueMembers), + `LogEntry` (id `teamId#dayKey`, dayKey, body, powerState, signalCount, uniqueMembers, `seeded`; readable by authenticated), + `allow.resource(computePower)` |
| `amplify/functions/compute-power/` | Clone of compute-weather, **triggered by the `PingReceipt` stream (and hourly by `HourlyPowerTick` with `{source:'scheduler'}`) and reading `PingReceipt` only** (unique userIds, rolling 24h) → upserts `Robot` via AppSync. `power.ts` = pure `powerStateFor(uniqueMembers)` + `power.test.ts`; `scripts/check-power-is-mood-free.sh` greps the handler for `Ping`/`score` |
| `amplify/functions/log-py/handler.py` | Clone of report-py: `{source:'scheduler'}` or backfill `{teamId, dayKey, aggregates}`; fixed-offset dayKey (no zoneinfo); `get_item` before Bedrock; Scrap-voice prompt from `docs/marketing/scrap-voice.md`; `put_item` with `ConditionExpression='attribute_not_exists(id)'`, `seeded` flag |
| `amplify/backend.ts` | PingReceipt stream → compute-power; `agent` stack: `NightlyLog` (cron 00:30 America/New_York) and `HourlyPowerTick` (rate 1 h) `Schedule`s with `LambdaInvoke` targets; env `LOG_TABLE_NAME`, `PING_TABLE_NAME`, `RECEIPT_TABLE_NAME`, `GROUP_IDS` |
| `src/scrap/Scrap.tsx` (+ `scrap.css`) | SVG with named `<g>` parts; `powerState` prop → attributes/classes; CSS vars; reduced-motion in CSS |
| `src/scrap/Scrap.tsx` imports `PowerState` from `amplify/functions/compute-power/power.ts` | one source of truth for the five states; thresholds 0 / 1 / 2 / 3–4 / 5+ (lowered for a five-person cast) |
| `App.tsx` | `Robot.observeQuery` effect; `LogPanel` (latest `LogEntry` by dayKey desc); copy rename ping → check-in; footer disclosure |
| `scripts/backfill-log.ts`, `prove-log.ts`, `checkin-as.ts`, `show-robot.ts`, `create-cast.sh` | Seeded history Aug 18–22 (deterministic ids, backdated createdAt, `seeded=true`); scheduler proof; check in as any cast member from the terminal; Cognito cast creation |
