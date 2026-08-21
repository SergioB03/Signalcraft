/**
 * Test-environment reset — the terminal twin of the in-app dev button.
 *
 * Run:  npx tsx scripts/reset-demo.ts [receipts|all|reseed]
 *   receipts (default) — forget who pinged today so demo accounts can ping again
 *   all                — also wipe every ping, report, and report request
 *   reseed             — `all`, then seed a fresh day of demo pings
 * Env:  DEV_EMAIL / DEV_PASSWORD (an account in the `dev` group),
 *       OUTPUTS (optional path to another backend's amplify_outputs.json)
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
const scope = process.argv[2] ?? 'receipts'
const email = process.env.DEV_EMAIL
const password = process.env.DEV_PASSWORD
if (!email || !password) {
  console.error('Set DEV_EMAIL and DEV_PASSWORD (a dev-group account) first.')
  process.exit(1)
}
if (!['receipts', 'all', 'reseed'].includes(scope)) {
  console.error(`unknown scope "${scope}" — use receipts | all | reseed`)
  process.exit(1)
}

Amplify.configure(outputs)
const client = generateClient<Schema>()

await signOut().catch(() => {})
await signIn({ username: email, password })
const { data, errors } = await client.mutations.resetDemoDay({ teamId: TEAM_ID, scope })
if (errors) {
  console.error('reset failed:', JSON.stringify(errors))
  process.exit(1)
}
console.log(`reset (${scope}):`, data)
