/**
 * Proof of the riskiest wire in the system (CLAUDE.md §9 step 5):
 *   ping created → DynamoDB stream → weather Lambda → AppSync mutation
 *   → WeatherState subscription event received by a connected client.
 *
 * Run:  npx tsx scripts/prove-realtime.ts
 * Env:  TEST_EMAIL, TEST_PASSWORD (Cognito user), optional SCORE (1-5)
 *
 * Exits 0 on PASS (subscription event within 30s of the ping), 1 on FAIL.
 */
import { readFileSync } from 'node:fs'
import { Amplify } from 'aws-amplify'
import { signIn, signOut } from 'aws-amplify/auth'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../amplify/data/resource'

const outputs = JSON.parse(
  readFileSync(
    process.env.OUTPUTS ?? new URL('../amplify_outputs.json', import.meta.url),
    'utf8',
  ),
)

const TEAM_ID = 'demo-team'
const email = process.env.TEST_EMAIL
const password = process.env.TEST_PASSWORD
const score = Number(process.env.SCORE ?? '3')

if (!email || !password) {
  console.error('Set TEST_EMAIL and TEST_PASSWORD env vars first.')
  process.exit(1)
}

Amplify.configure(outputs)
const client = generateClient<Schema>()

await signOut().catch(() => {})
await signIn({ username: email, password })
console.log(`[auth] signed in as ${email}`)

await client.models.Team.create({ id: TEAM_ID, name: 'Demo Team' }) // conflict = already exists, fine

let received = 0
const log = (kind: string) => (ws: Schema['WeatherState']['type']) => {
  received += 1
  console.log(
    `[subscription:${kind}] ${new Date().toISOString()} scene=${ws.scene} n=${ws.pingCount} avg=${ws.score ?? '—'}`,
  )
}
const subs = [
  client.models.WeatherState.onCreate().subscribe({ next: log('create'), error: (e) => console.error(e) }),
  client.models.WeatherState.onUpdate().subscribe({ next: log('update'), error: (e) => console.error(e) }),
]

// Give the websocket a moment to finish connecting before we fire the ping.
await new Promise((r) => setTimeout(r, 3000))
const baseline = received

const ping = await client.models.Ping.create({
  teamId: TEAM_ID,
  score,
  expiresAt: Math.floor(Date.now() / 1000) + 8 * 24 * 60 * 60,
})
if (ping.errors) {
  console.error('[ping] create failed:', JSON.stringify(ping.errors))
  process.exit(1)
}
console.log(`[ping] submitted score=${score}; waiting for the river to move…`)

const deadline = Date.now() + 30_000
while (Date.now() < deadline && received === baseline) {
  await new Promise((r) => setTimeout(r, 500))
}
subs.forEach((s) => s.unsubscribe())

if (received > baseline) {
  console.log('REALTIME PROOF: PASS')
  process.exit(0)
}
console.error('REALTIME PROOF: FAIL — no WeatherState subscription event within 30s of the ping')
process.exit(1)