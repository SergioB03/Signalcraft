/**
 * Checks in as one demo cast member from the terminal (PLAN.md step 1).
 *
 * This is how Scrap reaches 'bright' on camera without opening five browser
 * profiles: run it once per cast member and the power state climbs for real —
 * same two rows the UI writes, same conditional write, same anonymity split.
 *
 * Run:  npx tsx scripts/checkin-as.ts EMAIL SCORE [NOTE]
 *       npx tsx scripts/checkin-as.ts demo2@signalcraft.local 2
 *       npx tsx scripts/checkin-as.ts demo3 4 "pairing session actually fixed it"
 *       (a bare name is expanded to <name>@signalcraft.local)
 * Env:  DEMO_PASSWORD (shared by demoN@signalcraft.local), OUTPUTS (optional)
 *
 * Exits 0 when the check-in landed OR the user had already checked in today,
 * 1 on a real failure (bad args, auth, network, rejected write).
 */
import { readFileSync } from 'node:fs'
import { Amplify } from 'aws-amplify'
import { getCurrentUser, signIn, signOut } from 'aws-amplify/auth'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../amplify/data/resource'

// OUTPUTS env var targets another backend (e.g. the production branch's
// generated outputs); defaults to the local sandbox.
const outputs = JSON.parse(
  readFileSync(
    process.env.OUTPUTS ?? new URL('../amplify_outputs.json', import.meta.url),
    'utf8',
  ),
)

const TEAM_ID = 'demo-team'
const EMAIL_DOMAIN = '@signalcraft.local'
// Mirrors the schema bound on Ping.score (amplify/data/resource.ts) and the
// MOODS stones in the UI (App.tsx:1434) — 1 sinking … 5 glassy.
const MIN_SCORE = 1
const MAX_SCORE = 5
const MAX_NOTE = 140 // Ping.note validate((v) => v.maxLength(140))

const usage = 'Usage: npx tsx scripts/checkin-as.ts EMAIL SCORE [NOTE]'

const [rawEmail, rawScore, ...noteParts] = process.argv.slice(2)
if (!rawEmail || !rawScore) {
  console.error(usage)
  process.exit(1)
}

const email = rawEmail.includes('@') ? rawEmail : `${rawEmail}${EMAIL_DOMAIN}`

// Integer, in range, and nothing sneaky like '3.5' or '4abc' — the schema
// would reject those anyway, but a clear message beats a GraphQL error.
const score = Number(rawScore)
if (!Number.isInteger(score) || score < MIN_SCORE || score > MAX_SCORE) {
  console.error(`SCORE must be an integer ${MIN_SCORE}-${MAX_SCORE} (got "${rawScore}").`)
  console.error(usage)
  process.exit(1)
}

// Remaining args join so an unquoted multi-word note still works.
const note = noteParts.join(' ').trim()
if (note.length > MAX_NOTE) {
  console.error(`NOTE must be ${MAX_NOTE} characters or fewer (got ${note.length}).`)
  process.exit(1)
}

const password = process.env.DEMO_PASSWORD
if (!password) {
  console.error('Set DEMO_PASSWORD first.')
  process.exit(1)
}

// Copied from localDayKey() in src/App.tsx:278 — deliberately duplicated
// rather than imported, because App.tsx is a React module. Local calendar day,
// not UTC: the check-in day should roll at the user's midnight, not at 8 PM ET.
// If that helper ever changes, change it here too.
function localDayKey(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

Amplify.configure(outputs)
const client = generateClient<Schema>()

await signOut().catch(() => {})
await signIn({ username: email, password })
const { userId } = await getCurrentUser()
const dayKey = localDayKey()
console.log(`[auth] signed in as ${email} (${userId}), day ${dayKey}`)

// Two records, deliberately separate — the property this whole codebase is
// built on: the receipt names you but holds no score; the ping holds your
// score but doesn't name you. Keep it that way here too.
const receipt = await client.models.PingReceipt.create({
  id: `${userId}#${dayKey}`,
  teamId: TEAM_ID,
  userId,
  dayKey,
})
if (receipt.errors) {
  // The deterministic id carries a built-in attribute_not_exists(id), so a
  // 'condition' failure means "already checked in today" — expected on a
  // second run, and not a reason to stop: the run is still a no-op success.
  const duplicate = receipt.errors.some((e) =>
    `${(e as { errorType?: string }).errorType ?? ''} ${e.message}`
      .toLowerCase()
      .includes('condition'),
  )
  if (!duplicate) {
    console.error('[receipt] create failed:', JSON.stringify(receipt.errors))
    await signOut().catch(() => {})
    process.exit(1)
  }
  // Match the UI exactly (src/App.tsx:1497): when the receipt already exists
  // the form returns early and creates NO ping. Creating one here would add an
  // anonymous score row without adding a unique member, so pingCount and the
  // river average would drift above the real cast size — visible on camera in
  // the "{n} checked in today" caption. Re-running this script is a no-op.
  console.log(`[receipt] ${email} already checked in on ${dayKey} — no ping created.`)
  console.log('done — already checked in; nothing changed.')
  await signOut().catch(() => {})
  process.exit(0)
} else {
  console.log(`[receipt] ${userId}#${dayKey}`)
}

const ping = await client.models.Ping.create({
  teamId: TEAM_ID,
  score,
  note: note || undefined,
  // 8 days, not 24h: the weekly report and the nightly log need the rows to
  // still exist. The rolling windows are enforced by createdAt filters.
  expiresAt: Math.floor(Date.now() / 1000) + 8 * 24 * 60 * 60,
})
if (ping.errors) {
  console.error('[check-in] create failed:', JSON.stringify(ping.errors))
  await signOut().catch(() => {})
  process.exit(1)
}

console.log(`[check-in] score=${score}${note ? ` "${note}"` : ''} (anonymous — no userId on this row)`)
console.log('done — one more member of signal for Scrap.')
await signOut().catch(() => {})
