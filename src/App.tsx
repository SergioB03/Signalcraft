import { useCallback, useEffect, useState } from 'react'
import {
  confirmSignUp,
  fetchUserAttributes,
  getCurrentUser,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../amplify/data/resource'
import RiverCanvas from './river/RiverCanvas'
import { SCENES } from './river/scenes'
import type { AvatarPose, RiverMember, SceneName } from './river/scenes'
import './App.css'

const client = generateClient<Schema>()

// Single hardcoded demo team for the challenge (multi-team is Tier 3).
const TEAM_ID = 'demo-team'

type WeatherRow = Schema['WeatherState']['type']
type MembershipRow = Schema['Membership']['type']
type Stage = 'loading' | 'signIn' | 'signUp' | 'confirm' | 'in'

const POSES: Array<{ pose: AvatarPose; label: string }> = [
  { pose: 'floating', label: 'floating' },
  { pose: 'waving', label: 'waving' },
  { pose: 'raft', label: 'on a raft' },
  { pose: 'underwater', label: 'underwater' },
  { pose: 'struck', label: 'struck' },
  { pose: 'coconut', label: 'coconut mode' },
]

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('uc-theme')
      if (saved === 'light' || saved === 'dark') return saved
    } catch {
      /* private mode etc. — fall through to system preference */
    }
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('uc-theme', theme)
    } catch {
      /* fine — the toggle still works for this visit */
    }
  }, [theme])
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }
}

export default function App() {
  const [stage, setStage] = useState<Stage>('loading')

  useEffect(() => {
    getCurrentUser()
      .then(() => setStage('in'))
      .catch(() => setStage('signIn'))
  }, [])

  if (stage === 'loading') return <main className="shell" />
  if (stage === 'in') return <River onSignOut={() => setStage('signIn')} />
  return <AuthGate stage={stage} setStage={setStage} />
}

function AuthGate({
  stage,
  setStage,
}: {
  stage: Stage
  setStage: (s: Stage) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — try again.')
    } finally {
      setBusy(false)
    }
  }

  const submit = () =>
    run(async () => {
      if (stage === 'signUp') {
        await signUp({ username: email, password, options: { userAttributes: { email } } })
        setStage('confirm')
      } else if (stage === 'confirm') {
        await confirmSignUp({ username: email, confirmationCode: code })
        await signIn({ username: email, password })
        setStage('in')
      } else {
        await signIn({ username: email, password })
        setStage('in')
      }
    })

  return (
    <main className="shell auth">
      <h1>undercurrent</h1>
      <p className="tagline">how's the water today?</p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {stage !== 'confirm' && (
          <>
            <label>
              email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={stage === 'signUp' ? 'new-password' : 'current-password'}
                required
              />
            </label>
          </>
        )}
        {stage === 'confirm' && (
          <label>
            confirmation code (check your email)
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" required />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {stage === 'signUp' ? 'create account' : stage === 'confirm' ? 'confirm' : 'sign in'}
        </button>
      </form>
      {stage === 'signIn' && (
        <button className="link" onClick={() => setStage('signUp')}>
          new here? create an account
        </button>
      )}
      {stage === 'signUp' && (
        <button className="link" onClick={() => setStage('signIn')}>
          already aboard? sign in
        </button>
      )}
    </main>
  )
}

function River({ onSignOut }: { onSignOut: () => void }) {
  const { theme, toggle } = useTheme()
  const [weather, setWeather] = useState<WeatherRow | null>(null)
  const [members, setMembers] = useState<MembershipRow[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [myMembershipId, setMyMembershipId] = useState<string | null>(null)

  // Make sure the demo team + my membership exist. Deterministic membership
  // id (`teamId#userId`) means StrictMode's double-run can't create dupes —
  // the second create loses the conditional write, same trick as receipts.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await client.models.Team.create({ id: TEAM_ID, name: 'Demo Team' }).catch(() => {})
      const { userId } = await getCurrentUser()
      const membershipId = `${TEAM_ID}#${userId}`
      let mine = (await client.models.Membership.get({ id: membershipId })).data
      if (!mine) {
        const attrs = await fetchUserAttributes().catch(() => ({ email: undefined }))
        const displayName = (attrs.email ?? 'someone').split('@')[0]
        const created = await client.models.Membership.create({
          id: membershipId,
          teamId: TEAM_ID,
          userId,
          role: 'member',
          displayName,
          avatarPose: 'floating',
        })
        mine = created.data ?? (await client.models.Membership.get({ id: membershipId })).data
      }
      if (!cancelled) {
        setMyUserId(userId)
        setMyMembershipId(mine?.id ?? null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Live weather: the heart of the app. The Lambda's AppSync mutation lands
  // here — clients never compute weather locally.
  useEffect(() => {
    const sub = client.models.WeatherState.observeQuery().subscribe({
      next: ({ items }) => {
        const row = items.find((w) => w.id === TEAM_ID)
        if (row) setWeather({ ...row })
      },
    })
    return () => sub.unsubscribe()
  }, [])

  // Live teammates: pose changes broadcast to every open window.
  useEffect(() => {
    const sub = client.models.Membership.observeQuery({
      filter: { teamId: { eq: TEAM_ID } },
    }).subscribe({
      next: ({ items }) =>
        setMembers(
          [...items].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
        ),
    })
    return () => sub.unsubscribe()
  }, [])

  const scene = (weather?.scene ?? null) as SceneName | null
  const myPose = members.find((m) => m.id === myMembershipId)?.avatarPose ?? 'floating'

  const riverMembers: RiverMember[] = members.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    pose: (m.avatarPose ?? 'floating') as AvatarPose,
    isMe: m.userId === myUserId,
  }))

  const setPose = (pose: AvatarPose) => {
    if (!myMembershipId) return
    client.models.Membership.update({ id: myMembershipId, avatarPose: pose })
  }

  return (
    <main className="shell">
      <header>
        <span className="brand">undercurrent</span>
        <span className="header-actions">
          <button
            className="link"
            onClick={toggle}
            aria-label={`switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? 'daylight' : 'dusk'}
          </button>
          <button className="link" onClick={() => signOut().then(onSignOut)}>
            sign out
          </button>
        </span>
      </header>

      <section className="water" aria-label={`team weather: ${scene ?? 'no pings yet'}`}>
        <RiverCanvas scene={scene} members={riverMembers} />
        <div className="scene-label">
          <h1 className="scene-name">{scene ?? 'still water'}</h1>
          <p className="scene-caption">
            {scene === null && "nobody's pinged yet today — set the tone."}
            {scene === 'gathering' &&
              `waiting on a few more before the water shows — pings stay anonymous. (${
                weather?.pingCount ?? 0
              } of 5 so far)`}
            {scene !== null && scene !== 'gathering' && (
              <>
                {SCENES[scene].caption} — {weather?.pingCount} ping
                {weather?.pingCount === 1 ? '' : 's'} today
                {typeof weather?.score === 'number' && `, average ${weather.score.toFixed(1)}`}
              </>
            )}
          </p>
        </div>
      </section>

      <section className="poses" aria-label="your avatar pose">
        <h2>you, on the river</h2>
        <div className="pose-row" role="radiogroup" aria-label="choose your pose">
          {POSES.map((p) => (
            <button
              key={p.pose}
              role="radio"
              aria-checked={myPose === p.pose}
              className={myPose === p.pose ? 'pose selected' : 'pose'}
              disabled={!myMembershipId}
              onClick={() => setPose(p.pose)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <PingForm />
    </main>
  )
}

const MOODS = [
  { score: 1, label: 'sinking' },
  { score: 2, label: 'choppy' },
  { score: 3, label: 'steady' },
  { score: 4, label: 'flowing' },
  { score: 5, label: 'glassy' },
] as const

function PingForm() {
  const [selected, setSelected] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'already'>('idle')
  const [error, setError] = useState('')

  const submit = useCallback(async () => {
    if (selected === null) return
    setStatus('sending')
    setError('')
    const { userId } = await getCurrentUser()
    const dayKey = new Date().toISOString().slice(0, 10)

    // Two records, deliberately separate: the receipt names you but holds no
    // score; the ping holds your score but doesn't name you. The receipt's
    // deterministic id makes the second ping of the day fail at the database.
    const receipt = await client.models.PingReceipt.create({
      id: `${userId}#${dayKey}`,
      teamId: TEAM_ID,
      userId,
      dayKey,
    })
    if (receipt.errors) {
      setStatus('already')
      return
    }

    const ping = await client.models.Ping.create({
      teamId: TEAM_ID,
      score: selected,
      note: note.trim() || undefined,
      expiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    })
    if (ping.errors) {
      setError('your ping did not go through — try again.')
      setStatus('idle')
      return
    }
    setStatus('done')
  }, [selected, note])

  if (status === 'done') return <p className="pinged">your ping is in the river. see you tomorrow.</p>
  if (status === 'already') return <p className="pinged">you've already pinged today — the river remembers.</p>

  return (
    <section className="ping">
      <h2>drop today's ping</h2>
      <div className="moods" role="radiogroup" aria-label="today's mood">
        {MOODS.map((m) => (
          <button
            key={m.score}
            role="radio"
            aria-checked={selected === m.score}
            className={selected === m.score ? 'mood selected' : 'mood'}
            onClick={() => setSelected(m.score)}
          >
            <span className="mood-num">{m.score}</span>
            {m.label}
          </button>
        ))}
      </div>
      <input
        placeholder="optional note, 140 characters"
        maxLength={140}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      <button disabled={selected === null || status === 'sending'} onClick={submit}>
        {status === 'sending' ? 'sending…' : 'ping'}
      </button>
    </section>
  )
}