import { useCallback, useEffect, useState } from 'react'
import {
  confirmSignUp,
  getCurrentUser,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '../amplify/data/resource'
import './App.css'

const client = generateClient<Schema>()

// Single hardcoded demo team for the challenge (multi-team is Tier 3).
const TEAM_ID = 'demo-team'

type WeatherRow = Schema['WeatherState']['type']
type Stage = 'loading' | 'signIn' | 'signUp' | 'confirm' | 'in'

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
  const [weather, setWeather] = useState<WeatherRow | null>(null)

  // Make sure the demo team row exists; a conflict just means it already does.
  useEffect(() => {
    client.models.Team.create({ id: TEAM_ID, name: 'Demo Team' }).catch(() => {})
  }, [])

  // The heart of the app: subscribe to WeatherState. The weather Lambda's
  // AppSync mutation lands here live — clients never compute weather locally.
  useEffect(() => {
    const sub = client.models.WeatherState.observeQuery().subscribe({
      next: ({ items }) => {
        const row = items.find((w) => w.id === TEAM_ID)
        if (row) setWeather({ ...row })
      },
    })
    return () => sub.unsubscribe()
  }, [])

  const scene = weather?.scene ?? null

  return (
    <main className="shell">
      <header>
        <span className="brand">undercurrent</span>
        <button
          className="link"
          onClick={() => signOut().then(onSignOut)}
        >
          sign out
        </button>
      </header>

      <section className="water" data-scene={scene ?? 'empty'}>
        <h1 className="scene-name">{scene ?? 'still water'}</h1>
        {scene === null && <p>nobody's pinged yet today — set the tone.</p>}
        {scene === 'gathering' && (
          <p>
            waiting on a few more before the water shows — pings stay anonymous.
            {typeof weather?.pingCount === 'number' && ` (${weather.pingCount} of 5 so far)`}
          </p>
        )}
        {scene !== null && scene !== 'gathering' && (
          <p>
            {weather?.pingCount} ping{weather?.pingCount === 1 ? '' : 's'} in the last day
            {typeof weather?.score === 'number' && ` — average ${weather.score.toFixed(1)}`}
          </p>
        )}
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