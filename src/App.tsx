import { useCallback, useEffect, useRef, useState } from 'react'
import {
  confirmSignUp,
  fetchAuthSession,
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
const TEAM_NAME = 'demo team'
const ANONYMITY_FLOOR = 5

type WeatherRow = Schema['WeatherState']['type']
type MembershipRow = Schema['Membership']['type']
type Stage = 'loading' | 'signIn' | 'signUp' | 'confirm' | 'in'
type View = 'river' | 'team' | 'report' | 'dev'

const POSES: Array<{ pose: AvatarPose; label: string }> = [
  { pose: 'floating', label: 'floating' },
  { pose: 'waving', label: 'waving' },
  { pose: 'raft', label: 'on a raft' },
  { pose: 'underwater', label: 'underwater' },
  { pose: 'struck', label: 'struck' },
  { pose: 'coconut', label: 'coconut mode' },
]
const poseLabel = (pose: string | null | undefined) =>
  POSES.find((p) => p.pose === pose)?.label ?? 'floating'

// ---------------------------------------------------------------------------
// small hooks

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

// Tabs live in the URL hash: back button, refresh, and shared links all work,
// with no router to misconfigure.
function useHashView(available: View[]): [View, (v: View) => void] {
  const read = useCallback((): View => {
    const h = window.location.hash.replace('#', '') as View
    return available.includes(h) ? h : 'river'
  }, [available])
  const [view, setViewState] = useState<View>(read)
  useEffect(() => {
    const onChange = () => setViewState(read())
    window.addEventListener('hashchange', onChange)
    onChange()
    return () => window.removeEventListener('hashchange', onChange)
  }, [read])
  const setView = (v: View) => {
    window.location.hash = v === 'river' ? '' : v
    setViewState(v)
  }
  return [view, setView]
}

// Group membership rides inside the signed access token — no extra query.
function useGroups() {
  const [groups, setGroups] = useState<string[]>([])
  useEffect(() => {
    fetchAuthSession()
      .then((session) => {
        const g = session.tokens?.accessToken.payload['cognito:groups']
        setGroups(Array.isArray(g) ? (g as string[]) : [])
      })
      .catch(() => {})
  }, [])
  return { isLead: groups.includes('lead'), isDev: groups.includes('dev') }
}

// Local calendar day, not UTC — the ping day should roll at the user's
// midnight, not at 8 PM ET (UTC midnight), or an evening ping blocks tomorrow
// afternoon's.
function localDayKey(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ---------------------------------------------------------------------------

export default function App() {
  const [stage, setStage] = useState<Stage>('loading')
  // Theme lives at the top so the sign-in screen honors the saved/system
  // preference too — not just the river behind it.
  const { theme, toggle } = useTheme()

  useEffect(() => {
    getCurrentUser()
      .then(() => setStage('in'))
      .catch(() => setStage('signIn'))
  }, [])

  if (stage === 'loading')
    return (
      <main className="shell centered">
        <p className="muted">finding the river…</p>
      </main>
    )
  if (stage === 'in')
    return <Home onSignOut={() => setStage('signIn')} theme={theme} onToggleTheme={toggle} />
  return <AuthGate stage={stage} setStage={setStage} theme={theme} onToggleTheme={toggle} />
}

// ---------------------------------------------------------------------------
// auth

function AuthGate({
  stage,
  setStage,
  theme,
  onToggleTheme,
}: {
  stage: Stage
  setStage: (s: Stage) => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
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

  // Amplify v6 gotcha: signing in with an unconfirmed account RESOLVES (no
  // throw) with isSignedIn:false — ignoring nextStep would mount the app with
  // no session and a permanently dead screen.
  const finishSignIn = async () => {
    const result = await signIn({ username: email, password })
    if (result.isSignedIn) {
      setStage('in')
    } else if (result.nextStep.signInStep === 'CONFIRM_SIGN_UP') {
      setStage('confirm')
      throw new Error('this account still needs its email confirmed — enter the code from your inbox.')
    } else {
      throw new Error(`sign-in needs another step (${result.nextStep.signInStep}).`)
    }
  }

  const submit = () =>
    run(async () => {
      if (stage === 'signUp') {
        await signUp({ username: email, password, options: { userAttributes: { email } } })
        setStage('confirm')
      } else if (stage === 'confirm') {
        await confirmSignUp({ username: email, confirmationCode: code })
        await finishSignIn()
      } else {
        await finishSignIn()
      }
    })

  return (
    <main className="shell centered">
      <section className="auth-card">
        <div className="horizon" aria-hidden="true" />
        <div className="auth-body">
          <h1 className="brand-large">undercurrent</h1>
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
                    minLength={8}
                    required
                  />
                </label>
                {stage === 'signUp' && (
                  <p className="hint">8+ characters with upper, lower, number, and symbol.</p>
                )}
              </>
            )}
            {stage === 'confirm' && (
              <label>
                confirmation code — check your email
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
              </label>
            )}
            {error && <p className="error">{error}</p>}
            <button type="submit" className="primary" disabled={busy}>
              {busy
                ? 'one moment…'
                : stage === 'signUp'
                  ? 'create account'
                  : stage === 'confirm'
                    ? 'confirm and sign in'
                    : 'sign in'}
            </button>
          </form>
          <div className="auth-links">
            {stage === 'signIn' && (
              <button className="link" onClick={() => setStage('signUp')}>
                new here? create an account
              </button>
            )}
            {stage !== 'signIn' && (
              <button className="link" onClick={() => setStage('signIn')}>
                back to sign in
              </button>
            )}
            <button className="link" onClick={onToggleTheme}>
              {theme === 'dark' ? 'daylight' : 'dusk'}
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

// ---------------------------------------------------------------------------
// signed-in shell

function Home({
  onSignOut,
  theme,
  onToggleTheme,
}: {
  onSignOut: () => void
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}) {
  const { isLead, isDev } = useGroups()
  const views: View[] = ['river', 'team', ...(isLead ? (['report'] as View[]) : []), ...(isDev ? (['dev'] as View[]) : [])]
  const [view, setView] = useHashView(views)

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
    })().catch(() => {
      /* a failed bootstrap leaves the pose picker disabled; the river still shows */
    })
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
        setWeather(row ? { ...row } : null)
      },
    })
    return () => sub.unsubscribe()
  }, [])

  // Live teammates: pose changes and roster edits broadcast to every window.
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

  const pingCount = weather?.pingCount ?? 0

  return (
    <main className="shell">
      <header className="topbar">
        <span className="brand">undercurrent</span>
        <nav className="tabs" aria-label="sections">
          {views.map((v) => (
            <button
              key={v}
              className={view === v ? 'tab active' : 'tab'}
              aria-current={view === v ? 'page' : undefined}
              onClick={() => setView(v)}
            >
              {v}
            </button>
          ))}
        </nav>
        <span className="header-actions">
          <button
            className="link"
            onClick={onToggleTheme}
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
              `waiting on a few more before the water shows — pings stay anonymous. (${pingCount} of ${ANONYMITY_FLOOR} so far)`}
            {scene !== null && scene !== 'gathering' && (
              <>
                {SCENES[scene].caption} — {pingCount} ping{pingCount === 1 ? '' : 's'} today
                {typeof weather?.score === 'number' && `, average ${weather.score.toFixed(1)}`}
              </>
            )}
          </p>
        </div>
      </section>

      {view === 'river' && (
        <div className="panel-grid">
          <section className="card" aria-label="your avatar pose">
            <h2>you, on the river</h2>
            <p className="muted">
              your pose is yours to pick — it's never inferred from anyone's mood.
            </p>
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
        </div>
      )}

      {view === 'team' && (
        <TeamPanel
          members={members}
          myUserId={myUserId}
          isLead={isLead}
          pingCount={pingCount}
        />
      )}
      {view === 'report' && isLead && <ReportPanel />}
      {view === 'dev' && isDev && <DevPanel />}
    </main>
  )
}

// ---------------------------------------------------------------------------
// team

function TeamPanel({
  members,
  myUserId,
  isLead,
  pingCount,
}: {
  members: MembershipRow[]
  myUserId: string | null
  isLead: boolean
  pingCount: number
}) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState('')

  const remove = async (id: string) => {
    setError('')
    const { errors } = await client.models.Membership.delete({ id })
    if (errors) setError('could not remove that member — try again.')
    setConfirming(null)
  }

  const floorGap = Math.max(0, ANONYMITY_FLOOR - pingCount)

  return (
    <section className="card team" aria-label="team">
      <div className="card-head">
        <h2>{TEAM_NAME}</h2>
        <span className="muted">
          {members.length} member{members.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="participation">
        <strong>{pingCount}</strong> ping{pingCount === 1 ? '' : 's'} in the last 24 hours —{' '}
        {floorGap === 0
          ? 'the water is showing.'
          : `${floorGap} more before the water shows. who pinged stays private, always.`}
      </p>
      <ul className="roster">
        {members.map((m) => {
          const isMe = m.userId === myUserId
          const joined = m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '—'
          return (
            <li key={m.id} className="roster-row">
              <span className="roster-name">
                {m.displayName}
                {isMe && <span className="you-tag">you</span>}
                {m.role === 'lead' && <span className="role-tag">lead</span>}
              </span>
              <span className="roster-meta">
                {poseLabel(m.avatarPose)} · joined {joined}
              </span>
              {isLead && !isMe && (
                <span className="roster-actions">
                  {confirming === m.id ? (
                    <>
                      <button className="danger" onClick={() => remove(m.id)}>
                        confirm remove
                      </button>
                      <button className="link" onClick={() => setConfirming(null)}>
                        cancel
                      </button>
                    </>
                  ) : (
                    <button className="link subtle" onClick={() => setConfirming(m.id)}>
                      remove
                    </button>
                  )}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {error && <p className="error">{error}</p>}
      {!isLead && (
        <p className="muted small">leads can remove members; everyone can see who's aboard.</p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// report (leads)

function ReportPanel() {
  const [latest, setLatest] = useState<Schema['Report']['type'] | null>(null)
  const [status, setStatus] = useState<'idle' | 'waiting' | 'timeout'>('idle')

  const loadLatest = useCallback(async () => {
    const { data } = await client.models.Report.list({
      filter: { teamId: { eq: TEAM_ID } },
    })
    const newest =
      [...data].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0] ?? null
    setLatest(newest)
    return newest
  }, [])

  useEffect(() => {
    loadLatest()
  }, [loadLatest])

  const generate = async () => {
    setStatus('waiting')
    const before = latest?.createdAt ?? ''
    await client.models.ReportRequest.create({ teamId: TEAM_ID })
    // The Python Lambda writes the Report row straight to DynamoDB, so no
    // subscription fires (they only fire on AppSync mutations) — we poll.
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000))
      const fresh = await loadLatest()
      if (fresh && (fresh.createdAt ?? '') > before) {
        setStatus('idle')
        return
      }
    }
    setStatus('timeout')
  }

  return (
    <section className="card report" aria-label="current report">
      <div className="card-head">
        <h2>the current report</h2>
        <span className="muted">leads only · built from aggregates, never individuals</span>
      </div>
      {latest && (
        <article>
          <p className="report-period">
            {latest.periodStart} → {latest.periodEnd}
          </p>
          <p className="report-body">{latest.body}</p>
          {latest.suggestedAction && (
            <p className="report-action">try this: {latest.suggestedAction}</p>
          )}
        </article>
      )}
      {!latest && status === 'idle' && <p className="muted">no report yet — generate the first one.</p>}
      {status === 'timeout' && (
        <p className="error">the report didn't arrive in time — give it a minute and try again.</p>
      )}
      <button className="primary" onClick={generate} disabled={status === 'waiting'}>
        {status === 'waiting' ? 'reading the water…' : 'generate current report'}
      </button>
    </section>
  )
}

// ---------------------------------------------------------------------------
// dev (test environment)

function DevPanel() {
  const [busy, setBusy] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [result, setResult] = useState('')

  const run = async (scope: 'receipts' | 'all' | 'reseed') => {
    setBusy(scope)
    setConfirming(null)
    setResult('')
    const { data, errors } = await client.mutations.resetDemoDay({ teamId: TEAM_ID, scope })
    setResult(errors ? `failed: ${errors.map((e) => e.message).join('; ')}` : JSON.stringify(data))
    setBusy(null)
  }

  const actions: Array<{
    scope: 'receipts' | 'all' | 'reseed'
    label: string
    detail: string
    destructive: boolean
  }> = [
    {
      scope: 'receipts',
      label: 'forget today’s pings',
      detail: 'clears the one-per-day receipts so demo accounts can ping again. the river keeps its weather.',
      destructive: false,
    },
    {
      scope: 'all',
      label: 'wipe the river',
      detail: 'removes every ping, receipt, report, and request. weather recomputes to "gathering" on its own.',
      destructive: true,
    },
    {
      scope: 'reseed',
      label: 'wipe and reseed',
      detail: 'wipe, then drop a fresh day of seven demo pings — past the anonymity floor, ready to present.',
      destructive: true,
    },
  ]

  return (
    <section className="card dev" aria-label="test environment">
      <div className="card-head">
        <h2>test environment</h2>
        <span className="muted">dev only · acts on the demo team</span>
      </div>
      <ul className="dev-actions">
        {actions.map((a) => (
          <li key={a.scope}>
            <div>
              <strong>{a.label}</strong>
              <p className="muted small">{a.detail}</p>
            </div>
            {a.destructive && confirming === a.scope ? (
              <span className="roster-actions">
                <button className="danger" disabled={busy !== null} onClick={() => run(a.scope)}>
                  confirm
                </button>
                <button className="link" onClick={() => setConfirming(null)}>
                  cancel
                </button>
              </span>
            ) : (
              <button
                className={a.destructive ? 'danger' : 'primary'}
                disabled={busy !== null}
                onClick={() => (a.destructive ? setConfirming(a.scope) : run(a.scope))}
              >
                {busy === a.scope ? 'working…' : 'run'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {result && <pre className="dev-result">{result}</pre>}
    </section>
  )
}

// ---------------------------------------------------------------------------
// ping

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
  // If the ping fails after the receipt was created, the retry must skip
  // receipt creation — recreating it loses the conditional write and would
  // falsely read as "already pinged today".
  const receiptHeld = useRef(false)

  const submit = useCallback(async () => {
    if (selected === null) return
    setStatus('sending')
    setError('')
    try {
      const { userId } = await getCurrentUser()
      const dayKey = localDayKey()

      // Two records, deliberately separate: the receipt names you but holds no
      // score; the ping holds your score but doesn't name you. The receipt's
      // deterministic id makes the second ping of the day fail at the database.
      if (!receiptHeld.current) {
        const receipt = await client.models.PingReceipt.create({
          id: `${userId}#${dayKey}`,
          teamId: TEAM_ID,
          userId,
          dayKey,
        })
        if (receipt.errors) {
          // Only a conditional-write conflict means "already pinged" — any
          // other failure (network, auth) gets honest copy and a retry path.
          const duplicate = receipt.errors.some((e) =>
            `${(e as { errorType?: string }).errorType ?? ''} ${e.message}`
              .toLowerCase()
              .includes('condition'),
          )
          if (duplicate) {
            setStatus('already')
          } else {
            setError('could not reach the river — check your connection and try again.')
            setStatus('idle')
          }
          return
        }
        receiptHeld.current = true
      }

      const ping = await client.models.Ping.create({
        teamId: TEAM_ID,
        score: selected,
        note: note.trim() || undefined,
        // 8 days, not 24h: the weekly report needs the rows to still exist.
        // The weather window is enforced by createdAt, so this changes nothing there.
        expiresAt: Math.floor(Date.now() / 1000) + 8 * 24 * 60 * 60,
      })
      if (ping.errors) {
        setError('your ping did not go through — try again.')
        setStatus('idle')
        return
      }
      setStatus('done')
    } catch {
      setError('something interrupted the ping — check your connection and try again.')
      setStatus('idle')
    }
  }, [selected, note])

  if (status === 'done' || status === 'already')
    return (
      <section className="card ping" aria-label="today's ping">
        <h2>drop today's ping</h2>
        <p className="pinged">
          {status === 'done'
            ? 'your ping is in the river. see you tomorrow.'
            : "you've already pinged today — the river remembers."}
        </p>
      </section>
    )

  return (
    <section className="card ping" aria-label="today's ping">
      <h2>drop today's ping</h2>
      <p className="muted">one tap, anonymous, once a day.</p>
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
        aria-label="optional note"
      />
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={selected === null || status === 'sending'} onClick={submit}>
        {status === 'sending' ? 'sending…' : 'ping'}
      </button>
    </section>
  )
}
