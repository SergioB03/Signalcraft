/**
 * Seeds demo pings so the app looks alive for the video (CLAUDE.md Tier 2 #12).
 *
 * Run:  npx tsx scripts/seed-demo.ts
 * Env:  TEST_EMAIL, TEST_PASSWORD (any signed-in member can seed)
 *
 * Note the irony, documented in NOTES.md: seeding works precisely through the
 * client-orchestration gap we logged — pings created without receipts. Useful
 * for a demo, and exhibit A for why real enforcement belongs server-side.
 */
import { Amplify } from 'aws-amplify'
import { signIn, signOut } from 'aws-amplify/auth'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../amplify/data/resource'
import outputs from '../amplify_outputs.json'

const TEAM_ID = 'demo-team'

const SEEDS: Array<{ score: number; note?: string }> = [
  { score: 4, note: 'shipped the migration, feeling good' },
  { score: 3 },
  { score: 4, note: 'nice quiet focus day' },
  { score: 2, note: 'meetings ate the whole morning again' },
  { score: 5, note: 'pairing session actually fixed it!' },
  { score: 3, note: 'fine. tired. friday-shaped.' },
  { score: 4 },
]

const email = process.env.TEST_EMAIL
const password = process.env.TEST_PASSWORD
if (!email || !password) {
  console.error('Set TEST_EMAIL and TEST_PASSWORD env vars first.')
  process.exit(1)
}

Amplify.configure(outputs)
const client = generateClient<Schema>()

await signOut().catch(() => {})
await signIn({ username: email, password })
await client.models.Team.create({ id: TEAM_ID, name: 'Demo Team' }) // conflict = fine

for (const seed of SEEDS) {
  const { errors } = await client.models.Ping.create({
    teamId: TEAM_ID,
    score: seed.score,
    note: seed.note,
    expiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  })
  if (errors) console.error('seed failed:', JSON.stringify(errors))
  else console.log(`seeded score=${seed.score}${seed.note ? ` "${seed.note}"` : ''}`)
  await new Promise((r) => setTimeout(r, 400))
}
console.log('done — the river should be past the anonymity floor now.')