/**
 * End-to-end proof of the report path (Tier 2 #9):
 *   ReportRequest created (as a lead) → DynamoDB stream → Python Lambda
 *   → Bedrock (Haiku 4.5) → Report row → visible to the lead via list.
 *
 * Run:  npx tsx scripts/prove-report.ts   (TEST_EMAIL must be in the lead group)
 * Exits 0 on PASS (a new Report appears within 90s), 1 on FAIL.
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
if (!email || !password) {
  console.error('Set TEST_EMAIL and TEST_PASSWORD env vars first.')
  process.exit(1)
}

Amplify.configure(outputs)
const client = generateClient<Schema>()

await signOut().catch(() => {})
await signIn({ username: email, password })
console.log(`[auth] signed in as ${email}`)

const newest = async () => {
  const { data } = await client.models.Report.list({ filter: { teamId: { eq: TEAM_ID } } })
  return [...data].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0] ?? null
}

const before = (await newest())?.createdAt ?? ''
const { errors } = await client.models.ReportRequest.create({ teamId: TEAM_ID })
if (errors) {
  console.error('[request] create failed:', JSON.stringify(errors))
  process.exit(1)
}
console.log('[request] created; waiting for the Python Lambda + Bedrock…')

const deadline = Date.now() + 90_000
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 4000))
  const fresh = await newest()
  if (fresh && (fresh.createdAt ?? '') > before) {
    console.log('\n--- REPORT ---')
    console.log(fresh.body)
    console.log(`\nACTION: ${fresh.suggestedAction}`)
    // A fallback body means the pipeline ran but Bedrock did NOT — that must
    // not read as proof of the Bedrock leg.
    const body = fresh.body ?? ''
    if (
      body.startsWith('No pings in the last week') ||
      body.startsWith('Only ') ||
      body.startsWith('The writing assistant is unavailable')
    ) {
      console.error('\nREPORT PROOF: FAIL — a fallback report arrived; Bedrock was not exercised.')
      process.exit(1)
    }
    console.log('\nREPORT PROOF: PASS')
    process.exit(0)
  }
}
console.error('REPORT PROOF: FAIL — no new report within 90s (check the Lambda logs)')
process.exit(1)