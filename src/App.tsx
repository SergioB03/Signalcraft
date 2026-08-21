import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  confirmResetPassword,
  confirmSignUp,
  fetchAuthSession,
  fetchUserAttributes,
  getCurrentUser,
  resendSignUpCode,
  resetPassword,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth'
import { generateClient } from 'aws-amplify/data'
import gsap from 'gsap'
import type { Schema } from '../amplify/data/resource'
import RiverCanvas from './river/RiverCanvas'
import { SCENES, SCENE_ORDER, SPOTS, memberColor, sceneFor } from './river/scenes'
import type { AvatarPose, RiverMember, SceneName, Spot } from './river/scenes'
import BlurText from './ui/BlurText'
import LoginHorizon from './ui/LoginHorizon'
import SceneTitle from './ui/SceneTitle'
import './App.css'
import './hud.css'

const client = generateClient<Schema>()

// Single hardcoded demo team for the challenge (multi-team is Tier 3).
const TEAM_ID = 'demo-team'
const TEAM_NAME = 'demo team'
const ANONYMITY_FLOOR = 5

type WeatherRow = Schema['WeatherState']['type']
type MembershipRow = Schema['Membership']['type']
type Stage = 'loading' | 'signIn' | 'signUp' | 'confirm' | 'forgot' | 'resetConfirm' | 'in'
type View = 'ping' | 'you' | 'team' | 'report' | 'dev'

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

// --- the simulation: a private sandbox for visitors ------------------------
// Six made-up teammates with random moods; the visitor is the seventh and
// last to ping, so their choice decides the weather. Nothing here touches
// the real team's data.
const SIM_NAMES = ['rae', 'milo', 'sol', 'ivy', 'noor', 'beck']
const SIM_POSES: AvatarPose[] = ['floating', 'waving', 'raft', 'underwater', 'coconut', 'floating']
const SIM_SPOTS: Spot[] = ['drift', 'headwater', 'rapids', 'shallows', 'shade', 'eddy']

type SimMember = { id: string; displayName: string; pose: AvatarPose; spot: Spot; score: number }

function simCast(seed: number): SimMember[] {
  const r = (i: number) => {
    const x = Math.sin(seed * 9301 + i * 49297) * 233280
    return x - Math.floor(x)
  }
  return SIM_NAMES.map((name, i) => ({
    id: `sim-${seed}-${i}`,
    displayName: name,
    pose: SIM_POSES[Math.floor(r(i) * SIM_POSES.length)],
    spot: SIM_SPOTS[Math.floor(r(i + 10) * SIM_SPOTS.length)],
    score: 1 + Math.floor(r(i + 20) * 5),
  }))
}

const isDemoEmail = (email?: string) => !!email && email.endsWith('@undercurrent.local')

// One simulated river per browser, shared by every window of it: the team
// lives in localStorage and changes broadcast over a BroadcastChannel. Which
// SEAT a window occupies lives in sessionStorage, which is per window — so one
// person can open three windows, be three teammates, and watch them move.
type SimSeat = { id: string; displayName: string; pose: AvatarPose; spot: Spot; score: number | null }
type SimState = { seed: number; seats: SimSeat[] }
const SIM_KEY = 'uc-sim-state'
const YOU_SEAT = 6

function newSimState(seed: number): SimState {
  return {
    seed,
    seats: [
      ...simCast(seed),
      { id: 'sim-you', displayName: 'you', pose: 'floating', spot: 'drift', score: null },
    ],
  }
}

function useSimState() {
  const [simState, setState] = useState<SimState>(() => {
    try {
      const raw = localStorage.getItem(SIM_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as SimState
        if (parsed?.seats?.length === 7) return parsed
      }
    } catch {
      /* fall through to a fresh team */
    }
    return newSimState(Math.floor(Math.random() * 1e6))
  })
  const [seat, setSeatState] = useState<number>(() => {
    try {
      // Number(null) is 0 — an integer in range — so a window with no saved
      // seat would silently sit in cast member #0's chair and inherit their
      // ping. Absent must mean YOU_SEAT.
      const raw = sessionStorage.getItem('uc-sim-seat')
      const v = raw === null ? NaN : Number(raw)
      return Number.isInteger(v) && v >= 0 && v < 7 ? v : YOU_SEAT
    } catch {
      return YOU_SEAT
    }
  })
  const channel = useRef<BroadcastChannel | null>(null)
  // Mirrors state for mount-only effects, without re-running them on change.
  const latest = useRef(simState)
  latest.current = simState

  // A freshly rolled team is persisted immediately, so the next window joins
  // THIS team instead of rolling its own six strangers. If another window won
  // the race in between, adopt theirs.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIM_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as SimState
        if (parsed?.seats?.length === 7) {
          setState(parsed)
          return
        }
      }
      localStorage.setItem(SIM_KEY, JSON.stringify(latest.current))
    } catch {
      /* the simulation still works, just window-local */
    }
  }, [])

  useEffect(() => {
    const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('uc-sim') : null
    channel.current = bc
    if (bc)
      bc.onmessage = (e: MessageEvent<SimState>) => {
        if (e.data?.seats?.length === 7) setState(e.data)
      }
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SIM_KEY || !e.newValue) return
      try {
        setState(JSON.parse(e.newValue) as SimState)
      } catch {
        /* ignore a torn write */
      }
    }
    window.addEventListener('storage', onStorage)
    return () => {
      bc?.close()
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const updateSim = (fn: (s: SimState) => SimState) =>
    setState((prev) => {
      const next = fn(prev)
      try {
        localStorage.setItem(SIM_KEY, JSON.stringify(next))
      } catch {
        /* still works within this window */
      }
      channel.current?.postMessage(next)
      return next
    })
  const setSeat = (i: number) => {
    setSeatState(i)
    try {
      sessionStorage.setItem('uc-sim-seat', String(i))
    } catch {
      /* per-window memory only */
    }
  }
  return { simState, updateSim, seat, setSeat }
}

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
    return available.includes(h) ? h : 'ping'
  }, [available])
  const [view, setViewState] = useState<View>(read)
  useEffect(() => {
    const onChange = () => setViewState(read())
    window.addEventListener('hashchange', onChange)
    onChange()
    return () => window.removeEventListener('hashchange', onChange)
  }, [read])
  const setView = (v: View) => {
    window.location.hash = v === 'ping' ? '' : v
    setViewState(v)
  }
  return [view, setView]
}

// Group membership rides inside the signed access token — no extra query.
// `groupsReady` marks the moment the answer is known, so mode decisions
// don't flip mid-render.
function useGroups() {
  const [groups, setGroups] = useState<string[] | null>(null)
  useEffect(() => {
    fetchAuthSession()
      .then((session) => {
        const g = session.tokens?.accessToken.payload['cognito:groups']
        setGroups(Array.isArray(g) ? (g as string[]) : [])
      })
      .catch(() => setGroups([]))
  }, [])
  return {
    isLead: !!groups?.includes('lead'),
    isDev: !!groups?.includes('dev'),
    groupsReady: groups !== null,
  }
}

// Viewport facts the full-bleed layout needs: phone-width (the island becomes
// a bottom sheet) and height (how much of the stream the sheet covers).
function useViewport() {
  const read = () => ({ narrow: window.innerWidth < 600, height: window.innerHeight })
  const [vp, setVp] = useState(read)
  useEffect(() => {
    const onResize = () => setVp(read())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return vp
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

  // Tokens are shared per browser: if another tab signs in or out, THIS tab's
  // session silently changes under it — a sign-in form would dead-end, and a
  // river would act as the wrong person. Reload on any cross-tab auth change
  // so every tab always reflects who the tokens say it is.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key?.includes('LastAuthUser') && e.newValue !== e.oldValue) window.location.reload()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
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
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const cardRef = useRef<HTMLElement>(null)

  // GSAP entrance: the card settles in, then its contents follow.
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const mm = gsap.matchMedia(card)
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from(card, { y: 26, autoAlpha: 0, duration: 0.8, ease: 'power3.out' })
      gsap.from('.auth-body > *', {
        y: 10,
        autoAlpha: 0,
        stagger: 0.07,
        duration: 0.5,
        delay: 0.25,
        ease: 'power2.out',
      })
    })
    return () => mm.revert()
  }, [])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      // Another tab already signed this browser in: the tokens are valid, so
      // just go in rather than parroting Amplify's "already a signed in user".
      if ((e as { name?: string }).name === 'UserAlreadyAuthenticatedException') {
        setStage('in')
        return
      }
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

  const go = (next: Stage, message = '') => {
    setStage(next)
    setError('')
    setNotice(message)
    setCode('')
  }

  const submit = () =>
    run(async () => {
      setNotice('')
      if (stage === 'signUp') {
        await signUp({ username: email, password, options: { userAttributes: { email } } })
        go('confirm', 'we emailed you a confirmation code.')
      } else if (stage === 'confirm') {
        await confirmSignUp({ username: email, confirmationCode: code })
        await finishSignIn()
      } else if (stage === 'forgot') {
        await resetPassword({ username: email })
        setPassword('')
        go('resetConfirm', 'we emailed you a reset code — pick a new password below.')
      } else if (stage === 'resetConfirm') {
        await confirmResetPassword({ username: email, confirmationCode: code, newPassword: password })
        await finishSignIn()
      } else {
        await finishSignIn()
      }
    })

  const showEmail = stage === 'signIn' || stage === 'signUp' || stage === 'forgot'
  const showPassword = stage === 'signIn' || stage === 'signUp' || stage === 'resetConfirm'
  const showCode = stage === 'confirm' || stage === 'resetConfirm'
  const buttonLabel = busy
    ? 'one moment…'
    : stage === 'signUp'
      ? 'create account'
      : stage === 'confirm'
        ? 'confirm and sign in'
        : stage === 'forgot'
          ? 'email me a reset code'
          : stage === 'resetConfirm'
            ? 'set new password and sign in'
            : 'sign in'

  return (
    <main className="shell centered">
      <section className="auth-card" ref={cardRef}>
        <LoginHorizon />
        <div className="auth-body">
          <h1 className="brand-large">undercurrent</h1>
          <BlurText className="tagline" text="how's the water today?" delay={0.4} />
          <form
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            {showEmail && (
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
            )}
            {showCode && (
              <label>
                {stage === 'confirm' ? 'confirmation code — check your email' : 'reset code — check your email'}
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
              </label>
            )}
            {showPassword && (
              <label>
                {stage === 'resetConfirm' ? 'new password' : 'password'}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={stage === 'signIn' ? 'current-password' : 'new-password'}
                  minLength={8}
                  required
                />
              </label>
            )}
            {(stage === 'signUp' || stage === 'resetConfirm') && (
              <p className="hint">8+ characters with upper, lower, number, and symbol.</p>
            )}
            {stage === 'forgot' && <p className="hint">we'll email a one-time code to that address.</p>}
            {notice && <p className="notice">{notice}</p>}
            {error && <p className="error">{error}</p>}
            <button type="submit" className="primary" disabled={busy}>
              {buttonLabel}
            </button>
          </form>
          <div className="auth-links">
            {stage === 'signIn' && (
              <>
                <button className="link" onClick={() => go('signUp')}>
                  new here? create an account
                </button>
                <button className="link" onClick={() => go('forgot')}>
                  forgot your password?
                </button>
              </>
            )}
            {stage === 'confirm' && (
              <button
                className="link"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await resendSignUpCode({ username: email })
                    setNotice('a fresh code is on its way — check spam too.')
                  })
                }
              >
                send a new code
              </button>
            )}
            {stage !== 'signIn' && (
              <button className="link" onClick={() => go('signIn')}>
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
  const { isLead, isDev, groupsReady } = useGroups()
  const views: View[] = [
    'ping',
    'you',
    'team',
    ...(isLead ? (['report'] as View[]) : []),
    ...(isDev ? (['dev'] as View[]) : []),
  ]
  const [view, setView] = useHashView(views)

  const [weather, setWeather] = useState<WeatherRow | null>(null)
  const [members, setMembers] = useState<MembershipRow[]>([])
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [myMembershipId, setMyMembershipId] = useState<string | null>(null)
  const [poseError, setPoseError] = useState('')
  // Dev-only local override of the scene (never written anywhere): lets the
  // presenter show "storm" on cue, and lets us tune every scene by eye.
  const [preview, setPreview] = useState<SceneName | null>(null)
  // The glass island over the river can be tucked away into a bubble.
  const [collapsed, setCollapsed] = useState(false)
  const viewport = useViewport()

  // Simulation: on by default for real sign-ups (community visitors), off for
  // the demo cast, leads, and dev; the visitor's choice is remembered.
  const [simPref, setSimPref] = useState<string | null>(() => {
    try {
      return localStorage.getItem('uc-sim')
    } catch {
      return null
    }
  })
  const [demoAccount, setDemoAccount] = useState<boolean | null>(null)
  const sim = simPref ? simPref === 'on' : demoAccount === false && !isLead && !isDev
  const setSim = (on: boolean) => {
    setSimPref(on ? 'on' : 'off')
    try {
      localStorage.setItem('uc-sim', on ? 'on' : 'off')
    } catch {
      /* fine */
    }
  }
  const { simState, updateSim, seat, setSeat } = useSimState()
  const mySeat = simState.seats[seat] ?? simState.seats[YOU_SEAT]
  const simScore = mySeat.score
  const simScores = simState.seats.map((s) => s.score).filter((x): x is number => x !== null)
  const simPinged = simScores.length
  const simScene: SceneName = sceneFor(simScores)
  const simAvg = simPinged ? simScores.reduce((a, b) => a + b, 0) / simPinged : 0
  const setSimScore = (score: number | null) =>
    updateSim((s) => ({ ...s, seats: s.seats.map((x, i) => (i === seat ? { ...x, score } : x)) }))
  const resetSim = () => updateSim(() => newSimState(Math.floor(Math.random() * 1e6)))
  const setSimSeatField = (patch: Partial<SimSeat>) =>
    updateSim((s) => ({ ...s, seats: s.seats.map((x, i) => (i === seat ? { ...x, ...patch } : x)) }))
  // Until the account's email and groups are known, the mode is undecided —
  // render neither live nor simulated chrome, so first-time visitors never
  // see the live team flash before the simulation swaps in.
  const modeReady = simPref !== null || (demoAccount !== null && groupsReady)

  // Make sure the demo team + my membership exist. Deterministic membership
  // id (`teamId#userId`) means StrictMode's double-run can't create dupes —
  // the second create loses the conditional write, same trick as receipts.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await client.models.Team.create({ id: TEAM_ID, name: 'Demo Team' }).catch(() => {})
      const { userId } = await getCurrentUser()
      const membershipId = `${TEAM_ID}#${userId}`
      const attrs = await fetchUserAttributes().catch(() => ({ email: undefined }))
      if (!cancelled) setDemoAccount(isDemoEmail(attrs.email))
      let mine = (await client.models.Membership.get({ id: membershipId })).data
      if (!mine) {
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

  // If a lead takes you off the river, stop acting on the ghost id.
  useEffect(() => {
    if (myMembershipId && members.length > 0 && !members.some((m) => m.id === myMembershipId)) {
      setMyMembershipId(null)
      setPoseError('you were taken off the river — reload to rejoin.')
    }
  }, [members, myMembershipId])

  const scene = (weather?.scene ?? null) as SceneName | null
  const shownScene = preview ?? (sim ? simScene : scene)
  const myPose = sim
    ? mySeat.pose
    : (members.find((m) => m.id === myMembershipId)?.avatarPose ?? 'floating')
  const me = members.find((m) => m.id === myMembershipId) ?? null

  const realMembers: RiverMember[] = members.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    pose: (m.avatarPose ?? 'floating') as AvatarPose,
    spot: (m.spot ?? 'drift') as Spot,
    isMe: m.userId === myUserId,
  }))
  const riverMembers: RiverMember[] = sim
    ? simState.seats.map((s, i) => ({
        id: s.id,
        displayName: i === YOU_SEAT ? (me?.displayName ?? 'you') : s.displayName,
        pose: s.pose,
        spot: s.spot,
        isMe: i === seat,
      }))
    : realMembers
  const mySpot = sim
    ? mySeat.spot
    : ((members.find((m) => m.id === myMembershipId)?.spot ?? 'drift') as Spot)

  const setSpot = async (spot: Spot) => {
    if (sim) {
      setSimSeatField({ spot })
      return
    }
    if (!myMembershipId) return
    setPoseError('')
    const { errors } = await client.models.Membership.update({ id: myMembershipId, spot })
    if (errors)
      setPoseError(
        'could not move you — if you signed in as someone else in another tab, reload this one.',
      )
  }

  const setPose = async (pose: AvatarPose) => {
    if (sim) {
      setSimSeatField({ pose })
      return
    }
    if (!myMembershipId) return
    setPoseError('')
    const { errors } = await client.models.Membership.update({ id: myMembershipId, avatarPose: pose })
    if (errors)
      setPoseError(
        'could not change your pose — if you signed in as someone else in another tab, reload this one.',
      )
  }

  const saveName = async (name: string): Promise<string | null> => {
    if (!myMembershipId) return 'not on the river yet'
    const { errors } = await client.models.Membership.update({ id: myMembershipId, displayName: name })
    return errors ? errors.map((e) => e.message).join('; ') : null
  }

  const pingCount = weather?.pingCount ?? 0

  return (
    <div className="app-viewport">
      <div className="full-bleed-canvas">
        <RiverCanvas
          scene={shownScene}
          members={riverMembers}
          fill
          bottomInset={collapsed ? 0 : Math.round(viewport.height * (viewport.narrow ? 0.54 : 0.44))}
        />
      </div>
      <header className="viewport-header">
        <span className="dev-notice" role="status">
          <span className="notice-long">
            {!modeReady
              ? 'preview build'
              : sim
                ? 'preview build · simulated experience — your pings stay in this browser'
                : 'preview build · live demo team'}
          </span>
          <span className="notice-short">{modeReady && sim ? 'simulated' : 'preview'}</span>
        </span>
        <span className="header-actions">
          {modeReady && (
            <button className="link" onClick={() => setSim(!sim)} aria-pressed={sim}>
              {sim ? 'simulation: on' : 'simulate'}
            </button>
          )}
          <button
            className="link"
            onClick={onToggleTheme}
            aria-label={`switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? 'daylight' : 'dusk'}
          </button>
          <button
            className="link"
            onClick={() => {
              // the sim preference belongs to this account's visit, not the next one's
              try {
                localStorage.removeItem('uc-sim')
              } catch {
                /* fine */
              }
              signOut().then(onSignOut)
            }}
          >
            sign out
          </button>
        </span>
      </header>

      <div className="scene-label hud-label" aria-label={`team weather: ${shownScene ?? 'no pings yet'}`}>
          <SceneTitle className="scene-name" text={shownScene ?? 'still water'} />
          <p className="scene-caption">
            {preview && (
              <>
                <span className="preview-pill">preview · this window only</span>
                {SCENES[preview].caption}.
              </>
            )}
            {!preview && modeReady && sim && simScore === null && (
              <>
                <span className="preview-pill">simulated</span>
                {simPinged} of 7 have pinged — {7 - simPinged === 1 ? "you're the last one" : 'your turn'}.
                your ping decides the weather.
              </>
            )}
            {!preview && modeReady && sim && simScore !== null && (
              <>
                <span className="preview-pill">simulated</span>
                {SCENES[simScene].caption} — {simPinged} of 7 pinged, average {simAvg.toFixed(1)}.
                {simPinged === 7 ? ' you set this.' : ''}
              </>
            )}
            {!preview && modeReady && !sim && scene === null && "nobody's pinged yet today — set the tone."}
            {!preview &&
              modeReady &&
              !sim &&
              scene === 'gathering' &&
              `waiting on a few more before the water shows — pings stay anonymous. (${pingCount} of ${ANONYMITY_FLOOR} so far)`}
            {!preview && modeReady && !sim && scene !== null && scene !== 'gathering' && (
              <>
                {SCENES[scene].caption} — {pingCount} ping{pingCount === 1 ? '' : 's'} today
                {typeof weather?.score === 'number' && `, average ${weather.score.toFixed(1)}`}
              </>
            )}
          </p>
      </div>

      {collapsed ? (
        <button className="hud-bubble" onClick={() => setCollapsed(false)} aria-label="open the panel">
          ≈
        </button>
      ) : (
      <aside className="riverbank-island dock-bottom" aria-label={`${view} panel`}>
        <div className="island-head">
          <span className="brand">undercurrent</span>
          <button className="icon-btn" aria-label="hide the panel" title="hide" onClick={() => setCollapsed(true)}>
            ⌄
          </button>
        </div>
        <nav className="tabs island-tabs" aria-label="sections">
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
        <div className="island-body">
      {view === 'ping' &&
        modeReady &&
        (sim ? (
          <SimPingForm
            score={simScore}
            scene={simScene}
            seatName={seat === YOU_SEAT ? null : mySeat.displayName}
            onPing={setSimScore}
            onReset={resetSim}
            onAgain={() => setSimScore(null)}
          />
        ) : (
          <PingForm />
        ))}
      {view === 'you' && (
        <>
          <section className="card" aria-label="your avatar pose">
            {sim && (
              <>
                <h3 className="sub">in this window you are</h3>
                <div className="pose-row" role="radiogroup" aria-label="choose your seat">
                  {simState.seats.map((s, i) => (
                    <button
                      key={s.id}
                      role="radio"
                      aria-checked={seat === i}
                      className={seat === i ? 'pose selected' : 'pose'}
                      onClick={() => setSeat(i)}
                    >
                      {i === YOU_SEAT ? (me?.displayName ?? 'you') : s.displayName}
                    </button>
                  ))}
                </div>
                <p className="muted small">
                  open another window, pick a different seat, and you'll see each other move — the
                  simulated team is shared by every window of this browser.
                </p>
              </>
            )}
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
                  disabled={!sim && !myMembershipId}
                  onClick={() => setPose(p.pose)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <h3 className="sub">where you are</h3>
            <div className="pose-row" role="radiogroup" aria-label="choose your spot">
              {SPOTS.map((sp) => (
                <button
                  key={sp.spot}
                  role="radio"
                  aria-checked={mySpot === sp.spot}
                  className={mySpot === sp.spot ? 'pose selected' : 'pose'}
                  disabled={!sim && !myMembershipId}
                  title={sp.hint}
                  onClick={() => setSpot(sp.spot)}
                >
                  {sp.label}
                </button>
              ))}
            </div>
            <p className="muted small">{SPOTS.find((sp) => sp.spot === mySpot)?.hint}</p>
            {poseError && <p className="error">{poseError}</p>}
            {!sim && (
              <NameEditor current={me?.displayName ?? ''} disabled={!myMembershipId} onSave={saveName} />
            )}
          </section>
        </>
      )}

      {view === 'team' &&
        modeReady &&
        (sim ? (
          <SimTeam seats={simState.seats} seat={seat} meName={me?.displayName ?? 'you'} />
        ) : (
          <TeamPanel
            members={members}
            myUserId={myUserId}
            isLead={isLead}
            pingCount={pingCount}
          />
        ))}
      {view === 'report' && isLead && <ReportPanel />}
      {view === 'dev' && isDev && <DevPanel preview={preview} onPreview={setPreview} />}
        </div>
      </aside>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// name

function NameEditor({
  current,
  disabled,
  onSave,
}: {
  current: string
  disabled: boolean
  onSave: (name: string) => Promise<string | null>
}) {
  const [draft, setDraft] = useState(current)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  // Follow the live value (it arrives after mount, and can change elsewhere).
  useEffect(() => {
    setDraft(current)
  }, [current])

  const clean = draft.trim()
  const unchanged = !clean || clean === current

  const save = async () => {
    if (unchanged) return
    setStatus('saving')
    const err = await onSave(clean)
    setStatus(err ? 'error' : 'saved')
  }

  return (
    <form
      className="name-editor"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <label>
        your name on the river
        <span className="name-row">
          <input
            value={draft}
            maxLength={14}
            onChange={(e) => {
              setDraft(e.target.value)
              setStatus('idle')
            }}
            disabled={disabled}
            aria-describedby="name-hint"
          />
          <button type="submit" disabled={disabled || status === 'saving' || unchanged}>
            {status === 'saving' ? 'saving…' : 'save'}
          </button>
        </span>
      </label>
      <p id="name-hint" className="muted small">
        {status === 'saved'
          ? "saved — everyone's river updates live."
          : status === 'error'
            ? 'could not save your name — try again.'
            : 'up to 14 characters; this is what floats under your avatar.'}
      </p>
    </form>
  )
}

// ---------------------------------------------------------------------------
// team (simulated): the seats, not the live roster — the live team's names
// and remove buttons would contradict the river being simulated.

function SimTeam({ seats, seat, meName }: { seats: SimSeat[]; seat: number; meName: string }) {
  const pinged = seats.filter((s) => s.score !== null).length
  return (
    <section className="card team" aria-label="simulated team">
      <div className="card-head">
        <h2>simulated team</h2>
        <span className="muted">7 seats · this browser only</span>
      </div>
      <p className="participation">
        <strong>{pinged}</strong> of 7 have pinged — moods stay hidden; only the river shows them.
      </p>
      <ul className="roster">
        {seats.map((s, i) => (
          <li key={s.id} className="roster-row">
            <span className="roster-name">
              <span className="dot" style={{ background: memberColor(s.id) }} aria-hidden="true" />
              {i === YOU_SEAT ? meName : s.displayName}
              {i === seat && <span className="you-tag">this window</span>}
            </span>
            <span className="roster-meta">
              {poseLabel(s.pose)} · {SPOTS.find((x) => x.spot === s.spot)?.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
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
                <span className="dot" style={{ background: memberColor(m.id) }} aria-hidden="true" />
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
  // undefined = not fetched yet, null = fetched and none exists — the panel
  // must not flash "no report yet" while the first fetch is in flight
  const [latest, setLatest] = useState<Schema['Report']['type'] | null | undefined>(undefined)
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
      {latest === undefined && <p className="muted">looking for the latest report…</p>}
      {latest === null && status === 'idle' && (
        <p className="muted">no report yet — generate the first one.</p>
      )}
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

function DevPanel({
  preview,
  onPreview,
}: {
  preview: SceneName | null
  onPreview: (s: SceneName | null) => void
}) {
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
      detail: 'wipe pings and receipts, then drop a fresh day of five demo pings — past the anonymity floor, ready to present. reports are kept.',
      destructive: true,
    },
  ]

  return (
    <section className="card dev" aria-label="test environment">
      <div className="card-head">
        <h2>test environment</h2>
        <span className="muted">dev only · acts on the demo team</span>
      </div>
      <div className="dev-preview">
        <strong>preview the weather</strong>
        <p className="muted small">
          this window only — the team's real weather is untouched. handy for the video.
        </p>
        <div className="pose-row" role="radiogroup" aria-label="preview scene">
          <button
            role="radio"
            aria-checked={preview === null}
            className={preview === null ? 'pose selected' : 'pose'}
            onClick={() => onPreview(null)}
          >
            live
          </button>
          {SCENE_ORDER.map((s) => (
            <button
              key={s}
              role="radio"
              aria-checked={preview === s}
              className={preview === s ? 'pose selected' : 'pose'}
              onClick={() => onPreview(s)}
            >
              {s}
            </button>
          ))}
        </div>
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
// ping (simulated): the same stones, but the score stays in this browser and
// decides a simulated team's weather.

function SimPingForm({
  score,
  scene,
  seatName,
  onPing,
  onReset,
  onAgain,
}: {
  score: number | null
  scene: SceneName
  /** null when this window holds your own seat, otherwise the teammate it drives */
  seatName: string | null
  onPing: (s: number) => void
  onReset: () => void
  onAgain: () => void
}) {
  const [selected, setSelected] = useState<number | null>(null)
  if (score !== null)
    return (
      <section className="card ping" aria-label="simulated ping">
        <p className="pinged">
          {seatName ? `${seatName} pinged ${score}` : `you pinged ${score}`} — the river went{' '}
          <strong>{scene}</strong>.{' '}
          {seatName
            ? 'every window of this browser sees it.'
            : "that's what one honest answer does to a team's weather."}
        </p>
        <div className="roster-actions">
          <button
            className="primary"
            onClick={() => {
              setSelected(null)
              onReset()
            }}
          >
            reset the simulation
          </button>
          <button
            className="link subtle"
            onClick={() => {
              setSelected(null)
              onAgain()
            }}
          >
            {seatName ? `ping again as ${seatName}` : 'ping again with the same teammates'}
          </button>
        </div>
      </section>
    )
  return (
    <section className="card ping" aria-label="simulated ping">
      <h2 className="sr-only">drop a simulated ping</h2>
      <div className="mood-selector-container" role="radiogroup" aria-label="your mood">
        {MOODS.map((m) => (
          <button
            key={m.score}
            role="radio"
            aria-checked={selected === m.score}
            aria-label={`${m.score} — ${m.label}`}
            data-mood={m.score}
            className={selected === m.score ? 'mood-stone selected' : 'mood-stone'}
            onClick={() => setSelected(m.score)}
          >
            {m.score}
          </button>
        ))}
      </div>
      <p className="mood-caption" aria-live="polite">
        {selected === null
          ? 'six teammates have pinged. you decide the weather — 1 is sinking, 5 is glassy.'
          : `${selected} — ${MOODS.find((m) => m.score === selected)?.label}. simulated, nothing is saved.`}
      </p>
      {selected !== null && (
        <div className="ping-reveal">
          <button className="primary" onClick={() => onPing(selected)}>
            drop the ping
          </button>
        </div>
      )}
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
        {status === 'already' && (
          <button
            className="link subtle"
            onClick={() => {
              receiptHeld.current = false
              setStatus('idle')
            }}
          >
            think that's wrong? try again
          </button>
        )}
      </section>
    )

  return (
    <section className="card ping" aria-label="today's ping">
      <h2 className="sr-only">drop today's ping</h2>
      <div className="mood-selector-container" role="radiogroup" aria-label="today's mood">
        {MOODS.map((m) => (
          <button
            key={m.score}
            role="radio"
            aria-checked={selected === m.score}
            aria-label={`${m.score} — ${m.label}`}
            data-mood={m.score}
            className={selected === m.score ? 'mood-stone selected' : 'mood-stone'}
            onClick={() => setSelected(m.score)}
          >
            {m.score}
          </button>
        ))}
      </div>
      <p className="mood-caption" aria-live="polite">
        {selected === null
          ? 'how is the water today? 1 is sinking, 5 is glassy.'
          : `${selected} — ${MOODS.find((m) => m.score === selected)?.label}. anonymous, once a day.`}
      </p>
      {selected !== null && (
        <div className="ping-reveal">
          <input
            placeholder="optional note, 140 characters"
            maxLength={140}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="optional note"
          />
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={status === 'sending'} onClick={submit}>
            {status === 'sending' ? 'sending…' : 'drop the ping'}
          </button>
        </div>
      )}
    </section>
  )
}
