/**
 * Gives the five demo accounts river-ready memberships with names and poses.
 * Signs in as each account so the Membership row is owner-correct (each demo
 * user can still change their own pose later).
 *
 * Run:  npx tsx scripts/seed-members.ts
 * Env:  DEMO_PASSWORD (shared by demoN@undercurrent.local), OUTPUTS (optional)
 */
import { readFileSync } from 'node:fs'
import { Amplify } from 'aws-amplify'
import { getCurrentUser, signIn, signOut } from 'aws-amplify/auth'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../amplify/data/resource'

const outputs = JSON.parse(
  readFileSync(
    process.env.OUTPUTS ?? new URL('../amplify_outputs.json', import.meta.url),
    'utf8',
  ),
)

const TEAM_ID = 'demo-team'
const password = process.env.DEMO_PASSWORD
if (!password) {
  console.error('Set DEMO_PASSWORD first.')
  process.exit(1)
}

type Pose = Schema['Membership']['type']['avatarPose']
const CAST: Array<{ email: string; name: string; role: 'lead' | 'member'; pose: Pose }> = [
  { email: 'demo1@undercurrent.local', name: 'ana', role: 'lead', pose: 'coconut' },
  { email: 'demo2@undercurrent.local', name: 'kai', role: 'member', pose: 'floating' },
  { email: 'demo3@undercurrent.local', name: 'mira', role: 'member', pose: 'waving' },
  { email: 'demo4@undercurrent.local', name: 'theo', role: 'member', pose: 'raft' },
  { email: 'demo5@undercurrent.local', name: 'june', role: 'member', pose: 'underwater' },
]

Amplify.configure(outputs)
const client = generateClient<Schema>()

await client.models.Team.create({ id: TEAM_ID, name: 'Demo Team' }).catch(() => {})

for (const person of CAST) {
  await signOut().catch(() => {})
  await signIn({ username: person.email, password })
  const { userId } = await getCurrentUser()
  const id = `${TEAM_ID}#${userId}`
  const existing = (await client.models.Membership.get({ id })).data
  const result = existing
    ? await client.models.Membership.update({
        id,
        displayName: person.name,
        role: person.role,
        avatarPose: person.pose,
      })
    : await client.models.Membership.create({
        id,
        teamId: TEAM_ID,
        userId,
        displayName: person.name,
        role: person.role,
        avatarPose: person.pose,
      })
  if (result.errors) console.error(`${person.email}: ${JSON.stringify(result.errors)}`)
  else console.log(`${person.email} → ${person.name} (${person.role}, ${person.pose})`)
}
console.log('cast is on the river.')
