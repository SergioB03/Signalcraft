import { useEffect, useRef } from 'react'
import { SCENES, hexToRgb, lerp, lerpRgb, memberColor, memberHair, rgbCss } from './scenes'
import type { Rgb, RiverMember, SceneName, Spot } from './scenes'

type Props = {
  scene: SceneName | null
  members: RiverMember[]
  /** Fill the wrapper's height instead of a fixed aspect (full-bleed layouts). */
  fill?: boolean
  /** Keep the stream's downstream end clear of a panel on the right (px). */
  rightInset?: number
  /** Keep the stream's downstream end clear of a sheet at the bottom (px). */
  bottomInset?: number
}

/**
 * A three-quarter view of a stream cutting across the land from the upper
 * left to the lower right, stepping down over two small drops on the way.
 *
 * The river is a sampled path: each sample carries a position, a tangent
 * (downstream), a normal (toward the upper bank), a perspective scale, and a
 * half-width. Everything else — grass, reeds, trees, rocks, flow, avatars —
 * is placed relative to that path, so the whole landscape is one idea.
 *
 * Weather is one scalar. Severity drives flow speed, chop, whitecaps, foam
 * at the rocks and drops, rain, cloud mass, lightning, how hard the reeds
 * lean, how far the greens drain out of the banks, and how much the avatars
 * bob.
 */

type Palette = {
  severity: number
  skyTop: Rgb
  skyBottom: Rgb
  water: Rgb
  waterDeep: Rgb
  bank: Rgb
  foliage: Rgb
  hill: Rgb
  earth: Rgb
  flowers: number
  sun: number
  clouds: number
  rain: number
}

const TWEEN_MS = 2000
const MAX_DPR = 1.5
const FRAME_MS = 1000 / 30

const FOAM: Rgb = [230, 237, 242]
const FOAM_CSS = '#e6edf2'
const SUN_CSS = '#e8c87e'
const DROPS = [0.3, 0.62] // where the stream steps down
const BIG_TREE = { u: 0.42, size: 1.7 } // the shade spot lives under it
const BIG_ROCK = { u: 0.56, lane: 0.3, size: 1.9 } // the rock spot sits on it

function paletteFor(scene: SceneName): Palette {
  const s = SCENES[scene]
  return {
    severity: s.severity,
    skyTop: hexToRgb(s.skyTop),
    skyBottom: hexToRgb(s.skyBottom),
    water: hexToRgb(s.water),
    waterDeep: hexToRgb(s.waterDeep),
    bank: hexToRgb(s.bank),
    foliage: hexToRgb(s.foliage),
    hill: hexToRgb(s.hill),
    earth: hexToRgb(s.earth),
    flowers: s.flowers,
    sun: s.sun,
    clouds: s.clouds,
    rain: s.rain,
  }
}

function mix(a: Palette, b: Palette, t: number): Palette {
  return {
    severity: lerp(a.severity, b.severity, t),
    skyTop: lerpRgb(a.skyTop, b.skyTop, t),
    skyBottom: lerpRgb(a.skyBottom, b.skyBottom, t),
    water: lerpRgb(a.water, b.water, t),
    waterDeep: lerpRgb(a.waterDeep, b.waterDeep, t),
    bank: lerpRgb(a.bank, b.bank, t),
    foliage: lerpRgb(a.foliage, b.foliage, t),
    hill: lerpRgb(a.hill, b.hill, t),
    earth: lerpRgb(a.earth, b.earth, t),
    flowers: lerp(a.flowers, b.flowers, t),
    sun: lerp(a.sun, b.sun, t),
    clouds: lerp(a.clouds, b.clouds, t),
    rain: lerp(a.rain, b.rain, t),
  }
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const rnd = (i: number, salt = 0) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

type Raindrop = { x: number; y: number; len: number; speed: number }

type Sample = {
  u: number
  x: number
  y: number
  tx: number
  ty: number
  nx: number
  ny: number
  s: number
  hw: number
}

type Scenery = {
  grass: Array<{ u: number; v: number; len: number; shade: number }>
  reeds: Array<{ side: -1 | 1; u: number; off: number; h: number; phase: number }>
  trees: Array<{ side: -1 | 1; u: number; off: number; size: number; shade: number }>
  rocks: Array<{ lane: number; u: number; size: number }>
  streaks: Array<{ lane: number; phase: number; len: number }>
  flowers: Array<{ u: number; v: number; c: number; size: number }>
}

const FLOWER_COLORS = ['#e8c87e', '#d98c6b', '#e6edf2', '#c9a0c0', '#e8c87e']

function makeScenery(): Scenery {
  return {
    flowers: Array.from({ length: 110 }, (_, i) => ({
      u: rnd(i, 40),
      v: rnd(i, 41),
      c: Math.floor(rnd(i, 42) * FLOWER_COLORS.length),
      size: 0.8 + rnd(i, 43) * 0.8,
    })),
    grass: Array.from({ length: 280 }, (_, i) => ({
      u: rnd(i, 1),
      v: rnd(i, 2),
      len: 0.4 + rnd(i, 3) * 0.6,
      shade: rnd(i, 4),
    })),
    reeds: Array.from({ length: 34 }, (_, i) => ({
      side: (i % 2 === 0 ? 1 : -1) as 1 | -1,
      u: 0.06 + rnd(i, 5) * 0.9,
      off: rnd(i, 6),
      h: 0.6 + rnd(i, 7) * 0.6,
      phase: rnd(i, 8) * Math.PI * 2,
    })),
    trees: Array.from({ length: 11 }, (_, i) => ({
      side: (i % 2 === 0 ? 1 : -1) as 1 | -1,
      u: 0.03 + rnd(i, 9) * 0.94,
      off: 0.15 + rnd(i, 10) * 0.85,
      size: 0.7 + rnd(i, 11) * 0.6,
      shade: rnd(i, 12),
    })),
    // most rocks in the rapids stretch between the drops
    rocks: Array.from({ length: 6 }, (_, i) => ({
      lane: (rnd(i, 13) - 0.5) * 1.4,
      u: i < 4 ? 0.33 + rnd(i, 14) * 0.27 : 0.08 + rnd(i, 14) * 0.85,
      size: 0.5 + rnd(i, 15) * 0.6,
    })),
    streaks: Array.from({ length: 72 }, (_, i) => ({
      lane: (rnd(i, 16) - 0.5) * 1.7,
      phase: rnd(i, 17),
      len: 0.6 + rnd(i, 18) * 0.8,
    })),
  }
}

export default function RiverCanvas({
  scene,
  members,
  fill = false,
  rightInset = 0,
  bottomInset = 0,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)

  const membersRef = useRef<RiverMember[]>(members)
  membersRef.current = members
  const layoutRef = useRef({ fill, rightInset, bottomInset })
  layoutRef.current = { fill, rightInset, bottomInset }
  const sceneryRef = useRef<Scenery | null>(null)
  if (!sceneryRef.current) sceneryRef.current = makeScenery()

  const sceneRef = useRef<SceneName>(scene ?? 'gathering')
  const drawStaticRef = useRef<(() => void) | null>(null)
  const tweenRef = useRef({
    from: paletteFor(scene ?? 'gathering'),
    to: paletteFor(scene ?? 'gathering'),
    start: 0,
  })

  // On scene change: snapshot wherever the tween currently is and glide to
  // the new target from there — never jump.
  useEffect(() => {
    const next = scene ?? 'gathering'
    if (next === sceneRef.current) return
    const now = performance.now()
    const t = easeInOut(Math.min(1, (now - tweenRef.current.start) / TWEEN_MS))
    tweenRef.current = {
      from: mix(tweenRef.current.from, tweenRef.current.to, t),
      to: paletteFor(next),
      start: now,
    }
    sceneRef.current = next
  }, [scene])

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    const scenery = sceneryRef.current
    if (!wrap || !canvas || !overlay || !scenery) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const drops: Raindrop[] = []
    let raf = 0
    let lightningFlash = 0
    let nextLightningAt = 0

    const currentDpr = () => Math.min(MAX_DPR, window.devicePixelRatio || 1)
    let dpr = currentDpr()
    const size = () => {
      dpr = currentDpr()
      const w = wrap.clientWidth
      // Phones get a taller frame so the diagonal has room to descend;
      // full-bleed layouts take whatever height the wrapper has.
      const h = layoutRef.current.fill
        ? Math.max(200, wrap.clientHeight)
        : w < 600
          ? Math.min(400, Math.max(300, Math.round(w * 0.85)))
          : Math.min(460, Math.max(260, Math.round(w * 0.5)))
      for (const c of [canvas, overlay]) {
        c.width = Math.round(w * dpr)
        c.height = Math.round(h * dpr)
        c.style.height = `${h}px`
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const draw = (now: number) => {
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      const tw = tweenRef.current
      const progress = easeInOut(Math.min(1, (now - tw.start) / TWEEN_MS))
      const p = mix(tw.from, tw.to, progress)
      const t = reducedMotion.matches ? 0 : now
      const sev = p.severity
      const narrow = w < 600
      const horizon = h * 0.26
      const wind = Math.sin(t * 0.0011) * (0.3 + sev * 1.4) + sev * 0.9

      // --- the river path -------------------------------------------------
      const N = 80
      const path: Sample[] = []
      // Where the stream ends: off the right edge normally; short of a side
      // panel or bottom sheet when the layout has one.
      const { rightInset, bottomInset } = layoutRef.current
      const xEnd = rightInset > 0 ? w - rightInset + 24 : 1.06 * w
      const bottomMargin = bottomInset > 0 ? bottomInset + 12 : h * (narrow ? 0.3 : 0.16)
      for (let i = 0; i <= N; i++) {
        const u = i / N
        path.push({
          u,
          x: lerp(-0.06 * w, xEnd, u),
          // narrow frames end the stream higher, clear of the scene caption
          y:
            horizon +
            h * 0.07 +
            Math.max(h * 0.25, h - horizon - bottomMargin) * u ** 1.08 +
            Math.sin(u * 6.5 + 1.2) * h * 0.035,
          tx: 0,
          ty: 0,
          nx: 0,
          ny: 0,
          s: 0.55 + 0.7 * u,
          hw: lerp(w * 0.022, w * 0.075, u) * (narrow ? 1.3 : 1),
        })
      }
      for (let i = 0; i <= N; i++) {
        const a = path[Math.max(0, i - 1)]
        const b = path[Math.min(N, i + 1)]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const len = Math.hypot(dx, dy) || 1
        path[i].tx = dx / len
        path[i].ty = dy / len
        // normal toward the upper bank (screen-up side)
        path[i].nx = path[i].ty
        path[i].ny = -path[i].tx
      }
      const sampleAt = (u: number): Sample => path[Math.round(clamp01(u) * N)]
      const pointAt = (u: number, lane: number) => {
        const sp = sampleAt(u)
        return { x: sp.x + lane * sp.hw * sp.nx, y: sp.y + lane * sp.hw * sp.ny, sp }
      }
      const nearest = (x: number, y: number) => {
        let best = path[0]
        let bd = Infinity
        for (let i = 0; i <= N; i += 2) {
          const d = Math.hypot(path[i].x - x, path[i].y - y)
          if (d < bd) {
            bd = d
            best = path[i]
          }
        }
        return { d: bd, sp: best }
      }

      // --- sky ------------------------------------------------------------
      const sky = ctx.createLinearGradient(0, 0, 0, horizon)
      sky.addColorStop(0, rgbCss(p.skyTop))
      sky.addColorStop(1, rgbCss(p.skyBottom))
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, horizon + 4)

      if (p.sun > 0.02) {
        const sx = w * 0.82
        const sy = horizon * 0.45
        const glow = ctx.createRadialGradient(sx, sy, 3, sx, sy, w * 0.1)
        glow.addColorStop(0, `rgba(232, 200, 126, ${0.9 * p.sun})`)
        glow.addColorStop(1, 'rgba(232, 200, 126, 0)')
        ctx.fillStyle = glow
        ctx.fillRect(sx - w * 0.11, sy - w * 0.11, w * 0.22, w * 0.22)
        ctx.fillStyle = `rgba(240, 214, 150, ${p.sun})`
        ctx.beginPath()
        ctx.arc(sx, sy, 11, 0, Math.PI * 2)
        ctx.fill()
        // low warm light pooling at the horizon
        const warm = ctx.createLinearGradient(0, horizon - 46, 0, horizon + 2)
        warm.addColorStop(0, 'rgba(232, 200, 126, 0)')
        warm.addColorStop(1, `rgba(232, 190, 126, ${0.32 * p.sun})`)
        ctx.fillStyle = warm
        ctx.fillRect(0, horizon - 46, w, 48)
      }

      const cloudCount = Math.round(p.clouds * 7)
      for (let i = 0; i < cloudCount; i++) {
        const cx = ((rnd(i, 20) * (w + 260) + t * 0.01 * (1 + sev)) % (w + 260)) - 130
        const cy = horizon * (0.15 + rnd(i, 21) * 0.55)
        const scale = (0.6 + rnd(i, 22) * 0.7) * (1 + sev * 0.5)
        const shade = 238 - sev * 165
        ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade + 4}, ${0.4 + p.clouds * 0.35})`
        for (const [dx, dy, r] of [
          [0, 0, 24],
          [20, 5, 17],
          [-21, 6, 16],
          [6, -8, 14],
        ]) {
          ctx.beginPath()
          ctx.ellipse(cx + dx * scale, cy + dy * scale, r * scale, r * 0.55 * scale, 0, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      for (let k = 0; k < 2; k++) {
        ctx.fillStyle = rgbCss(lerpRgb(p.hill, p.skyBottom, k === 0 ? 0.45 : 0.15))
        ctx.beginPath()
        ctx.moveTo(0, horizon + 6)
        for (let x = 0; x <= w; x += 8) {
          const y =
            horizon -
            (8 + k * 6) +
            Math.sin(x * 0.011 + k * 2.1) * 6 +
            Math.sin(x * 0.027 + k) * 3 +
            (k ? Math.sin(x * 0.005) * 8 : Math.sin(x * 0.004 + 1) * 11)
          ctx.lineTo(x, y)
        }
        ctx.lineTo(w, horizon + 6)
        ctx.closePath()
        ctx.fill()
      }

      // --- land -----------------------------------------------------------
      const land = ctx.createLinearGradient(0, horizon, 0, h)
      land.addColorStop(0, rgbCss(lerpRgb(p.bank, p.skyBottom, 0.35)))
      land.addColorStop(1, rgbCss(lerpRgb(p.bank, [0, 0, 0], 0.1)))
      ctx.fillStyle = land
      ctx.fillRect(0, horizon, w, h - horizon)

      ctx.lineCap = 'round'
      for (const g of scenery.grass) {
        const x = g.u * w
        const y = horizon + 4 + g.v * (h - horizon - 4)
        const near = nearest(x, y)
        if (near.d < near.sp.hw + 8) continue
        const s = 0.5 + ((y - horizon) / (h - horizon)) * 0.8
        const len = (2 + s * 7) * g.len
        ctx.strokeStyle = rgbCss(lerpRgb(p.foliage, p.bank, g.shade * 0.7), 0.5 + 0.35 * g.shade)
        ctx.lineWidth = 0.8 + s * 0.7
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + wind * len * 0.35, y - len)
        ctx.stroke()
      }

      // wildflowers — the first color to go when the weather turns
      if (p.flowers > 0.02) {
        for (const f of scenery.flowers) {
          const x = f.u * w
          const y = horizon + 10 + f.v * (h - horizon - 10)
          const near = nearest(x, y)
          if (near.d < near.sp.hw + 10) continue
          const s = 0.6 + ((y - horizon) / (h - horizon)) * 0.9
          const r = (1 + s) * f.size
          ctx.fillStyle = FLOWER_COLORS[f.c]
          ctx.globalAlpha = p.flowers * 0.9
          ctx.beginPath()
          ctx.arc(x + wind * 0.8, y - r * 1.8, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = p.flowers * 0.5
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(x + wind * 0.8 - r * 0.3, y - r * 2.1, r * 0.35, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }

      // --- trees (incl. the old tree that casts the shade spot) ------------
      type Tree = { x: number; y: number; s: number; shade: number; big: boolean }
      const trees: Tree[] = []
      for (const tr of scenery.trees) {
        const sp = sampleAt(tr.u)
        const dist = sp.hw + 30 * sp.s + tr.off * h * 0.32
        const x = sp.x + tr.side * dist * sp.nx
        const y = sp.y + tr.side * dist * sp.ny
        if (x < -30 || x > w + 30 || y < horizon + 8 || y > h + 10) continue
        trees.push({ x, y, s: (0.5 + sp.s * 0.6) * tr.size, shade: tr.shade, big: false })
      }
      const bigSp = sampleAt(BIG_TREE.u)
      const bigDist = bigSp.hw + 34 * bigSp.s
      const bigTree: Tree = {
        x: bigSp.x + bigDist * bigSp.nx,
        y: bigSp.y + bigDist * bigSp.ny,
        s: (0.5 + bigSp.s * 0.6) * BIG_TREE.size,
        shade: 0.2,
        big: true,
      }
      trees.push(bigTree)
      trees.sort((a, b) => a.y - b.y)
      for (const tr of trees) {
        const s = tr.s
        if (tr.big) {
          // the shade itself: a pool of shadow cast toward the lower left
          ctx.fillStyle = 'rgba(10, 14, 18, 0.2)'
          ctx.beginPath()
          ctx.ellipse(tr.x - 10 * s, tr.y + 4 * s, 22 * s, 8 * s, 0, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = rgbCss(lerpRgb(p.foliage, [0, 0, 0], 0.45))
        ctx.fillRect(tr.x - 1.6 * s, tr.y - 13 * s, 3.2 * s, 13 * s)
        const sway = wind * 2 * s
        // some canopies run warm (a touch of sun in the green), fading with severity
        const canopy =
          tr.shade > 0.55
            ? lerpRgb(p.foliage, hexToRgb('#e8c87e'), 0.22 * (1 - sev))
            : lerpRgb(p.foliage, p.bank, tr.shade * 0.4)
        ctx.fillStyle = rgbCss(canopy)
        for (const [dx, dy, rad] of [
          [0, -19, 9.5],
          [-7.5, -13.5, 7],
          [7.5, -14.5, 7.2],
        ]) {
          ctx.beginPath()
          ctx.arc(tr.x + dx * s + sway, tr.y + dy * s, rad * s, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // --- water ----------------------------------------------------------
      const bankPoly = (pad: number, chopAmp: number, phase: number) => {
        ctx.beginPath()
        for (const sp of path) {
          const chop = Math.sin(sp.u * 40 + t * 0.003 + phase) * chopAmp * sp.s
          const d = sp.hw + pad + chop
          ctx.lineTo(sp.x + d * sp.nx, sp.y + d * sp.ny)
        }
        for (let i = N; i >= 0; i--) {
          const sp = path[i]
          const chop = Math.sin(sp.u * 37 - t * 0.0025 + phase + 2) * chopAmp * sp.s
          const d = sp.hw + pad + chop
          ctx.lineTo(sp.x - d * sp.nx, sp.y - d * sp.ny)
        }
        ctx.closePath()
      }
      // the cut bank: warm earth, then a thin dry sandy lip above the water
      bankPoly(7, 0.4, 0)
      ctx.fillStyle = rgbCss(p.earth)
      ctx.fill()
      bankPoly(3, 0.4, 0)
      ctx.fillStyle = rgbCss(lerpRgb(p.earth, FOAM, 0.25))
      ctx.fill()
      // the water, lit from upstream (far, hazy) to downstream (near, deep)
      bankPoly(0, 0.6 + sev * 3.5, 1)
      const water = ctx.createLinearGradient(path[0].x, path[0].y, path[N].x, path[N].y)
      water.addColorStop(0, rgbCss(lerpRgb(p.water, p.skyBottom, 0.3)))
      water.addColorStop(1, rgbCss(p.waterDeep))
      ctx.fillStyle = water
      ctx.fill()
      // deep channel
      ctx.beginPath()
      for (const sp of path) ctx.lineTo(sp.x + sp.hw * 0.45 * sp.nx, sp.y + sp.hw * 0.45 * sp.ny)
      for (let i = N; i >= 0; i--) {
        const sp = path[i]
        ctx.lineTo(sp.x - sp.hw * 0.45 * sp.nx, sp.y - sp.hw * 0.45 * sp.ny)
      }
      ctx.closePath()
      ctx.fillStyle = rgbCss(p.waterDeep, 0.3)
      ctx.fill()
      // the upper bank catches the light — the cue that the land steps down
      ctx.strokeStyle = rgbCss(lerpRgb(p.bank, FOAM, 0.3), 0.45)
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (const sp of path) ctx.lineTo(sp.x + (sp.hw + 6) * sp.nx, sp.y + (sp.hw + 6) * sp.ny)
      ctx.stroke()

      // flow — the current, running downstream along the tangent
      const speed = 0.00006 + sev * 0.00022
      for (let i = 0; i < scenery.streaks.length; i++) {
        const st = scenery.streaks[i]
        const u = (st.phase + t * speed) % 1
        const { x, y, sp } = pointAt(u, st.lane * 0.9)
        // Whitecaps are short, bright flecks; the long soft streaks are the
        // current itself. Long bright strokes read as debris, not water.
        const whitecap = sev > 0.5 && i % 3 === 0
        const len = (whitecap ? 2 + sp.s * 5 : 5 + sp.s * 16) * st.len
        const nearDrop = DROPS.some((d) => Math.abs(u - d) < 0.07) ? 1.6 : 1
        ctx.strokeStyle = rgbCss(FOAM, Math.min(0.85, (whitecap ? 0.5 : 0.14 + sev * 0.18) * nearDrop))
        ctx.lineWidth = whitecap ? 1.2 + sp.s * 1.2 : 0.8 + sp.s * 0.8
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + sp.tx * len, y + sp.ty * len)
        ctx.stroke()
      }

      // the drops: a lip, a foam line, and a churn below — the stream descends
      for (const d of DROPS) {
        const sp = sampleAt(d)
        const a = { x: sp.x + sp.hw * sp.nx, y: sp.y + sp.hw * sp.ny }
        const b = { x: sp.x - sp.hw * sp.nx, y: sp.y - sp.hw * sp.ny }
        ctx.strokeStyle = rgbCss(lerpRgb(p.waterDeep, [0, 0, 0], 0.35), 0.7)
        ctx.lineWidth = 2 * sp.s
        ctx.beginPath()
        ctx.moveTo(a.x - sp.tx * 2, a.y - sp.ty * 2)
        ctx.lineTo(b.x - sp.tx * 2, b.y - sp.ty * 2)
        ctx.stroke()
        ctx.strokeStyle = rgbCss(FOAM, 0.55 + sev * 0.35)
        ctx.lineWidth = 2.5 * sp.s
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
        ctx.lineWidth = 1 + sp.s
        for (let k = -3; k <= 3; k++) {
          const lane = k / 3.6
          const { x, y } = pointAt(d + 0.012, lane)
          const len = (8 + sev * 10) * sp.s * (0.7 + rnd(k + 10, 30) * 0.6)
          const jitter = Math.sin(t * 0.01 + k) * 1.5
          ctx.strokeStyle = rgbCss(FOAM, 0.3 + sev * 0.3)
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x + sp.tx * len + jitter, y + sp.ty * len)
          ctx.stroke()
        }
      }

      // rocks — most in the rapids — plus the big one
      const foamAlpha = clamp01((sev - 0.3) * 1.5)
      const rockColor = lerpRgb(p.waterDeep, [0, 0, 0], 0.4)
      const drawRock = (u: number, lane: number, sizeMul: number) => {
        const { x, y, sp } = pointAt(u, lane)
        const size = (3 + sp.s * 9) * sizeMul
        const ang = Math.atan2(sp.ty, sp.tx)
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(ang)
        ctx.fillStyle = rgbCss(rockColor)
        ctx.beginPath()
        ctx.ellipse(0, 0, size, size * 0.6, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = rgbCss(lerpRgb(rockColor, FOAM, 0.12))
        ctx.beginPath()
        ctx.ellipse(-size * 0.3, -size * 0.25, size * 0.35, size * 0.15, 0, 0, Math.PI * 2)
        ctx.fill()
        // a mossy cap in fair weather
        if (sev < 0.5) {
          ctx.fillStyle = rgbCss(lerpRgb(p.foliage, hexToRgb('#8fae7a'), 0.5), (0.5 - sev) * 1.5)
          ctx.beginPath()
          ctx.ellipse(size * 0.05, -size * 0.32, size * 0.6, size * 0.2, 0, 0, Math.PI * 2)
          ctx.fill()
        }
        if (foamAlpha > 0.01) {
          const wobble = Math.sin(t * 0.008 + u * 9) * 0.8
          ctx.fillStyle = rgbCss(FOAM, foamAlpha * 0.45)
          ctx.beginPath()
          ctx.ellipse(-size * 0.85 + wobble, 0, size * 0.3, size * 0.8, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = rgbCss(FOAM, foamAlpha * 0.5)
          ctx.lineWidth = 1 + sp.s
          for (const dir of [-1, 1]) {
            ctx.beginPath()
            ctx.moveTo(size * 0.3, dir * size * 0.6)
            ctx.lineTo(size * 2.4 + wobble, dir * size * 0.95)
            ctx.stroke()
          }
        }
        ctx.restore()
        return { x, y, size, sp }
      }
      for (const rk of scenery.rocks) drawRock(rk.u, rk.lane, rk.size)
      const bigRock = drawRock(BIG_ROCK.u, BIG_ROCK.lane, BIG_ROCK.size)

      // reeds along both banks
      for (const rd of scenery.reeds) {
        const { x, y, sp } = pointAt(rd.u, rd.side * (1.08 + rd.off * 0.5))
        const hgt = (6 + sp.s * 24) * rd.h
        const bend = (wind + Math.sin(t * 0.002 + rd.phase) * 0.4) * hgt * 0.35
        ctx.strokeStyle = rgbCss(lerpRgb(p.foliage, FOAM, 0.12), 0.9)
        ctx.lineWidth = 0.8 + sp.s
        for (const b of [-1, 0, 1]) {
          ctx.beginPath()
          ctx.moveTo(x + b * 1.5, y)
          ctx.quadraticCurveTo(
            x + bend * 0.5 + b * 2,
            y - hgt * 0.55,
            x + bend + b * 3 * sp.s,
            y - hgt * (0.85 + 0.15 * Math.abs(b)),
          )
          ctx.stroke()
        }
      }

      // --- weather over everything ---------------------------------------
      const targetDrops = reducedMotion.matches ? 0 : Math.round(p.rain * 90)
      while (drops.length < targetDrops)
        drops.push({
          x: Math.random() * w,
          y: Math.random() * h,
          len: 6 + Math.random() * 9,
          speed: 220 + Math.random() * 260,
        })
      drops.length = Math.min(drops.length, targetDrops)
      if (drops.length) {
        ctx.strokeStyle = 'rgba(200, 215, 225, 0.4)'
        ctx.lineWidth = 1
        const slant = 0.2 + sev * 0.35
        for (const d of drops) {
          ctx.beginPath()
          ctx.moveTo(d.x, d.y)
          ctx.lineTo(d.x - d.len * slant, d.y + d.len)
          ctx.stroke()
          d.y += (d.speed / 60) * (1 + sev)
          d.x -= (d.speed / 60) * slant * 0.6
          if (d.y > h) {
            d.y = -10
            d.x = Math.random() * (w + 60)
          }
        }
      }

      if (SCENES[sceneRef.current].lightning && !reducedMotion.matches) {
        if (now > nextLightningAt) {
          lightningFlash = 1
          nextLightningAt = now + 2500 + Math.random() * 5000
        }
        if (lightningFlash > 0.01) {
          ctx.fillStyle = `rgba(240, 245, 250, ${lightningFlash * 0.4})`
          ctx.fillRect(0, 0, w, h)
          if (lightningFlash > 0.7) {
            const bx = w * (0.2 + Math.random() * 0.6)
            ctx.strokeStyle = `rgba(232, 200, 126, ${lightningFlash})`
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(bx, horizon * 0.15)
            ctx.lineTo(bx - 12, horizon * 0.5)
            ctx.lineTo(bx + 6, horizon * 0.7)
            ctx.lineTo(bx - 8, horizon * 1.05)
            ctx.stroke()
          }
          lightningFlash *= 0.86
        }
      }

      // --- avatars: named spots, or drifting slots down the stream ---------
      type Placed = { m: RiverMember; x: number; y: number; s: number; onLand: boolean; i: number }
      const placed: Placed[] = []
      const list = membersRef.current
      const bySpot = new Map<Spot, RiverMember[]>()
      list.forEach((m) => bySpot.set(m.spot, [...(bySpot.get(m.spot) ?? []), m]))
      // wide enough that two name tags on one spot don't collide
      const fan = (k: number, n: number) => (k - (n - 1) / 2) * 28

      const anchor = (spot: Spot, k: number, n: number) => {
        switch (spot) {
          // shared water spots fan out along the current, so everyone stays
          // on the stream line instead of drifting onto a bank or under a panel
          case 'headwater': {
            const { x, y, sp } = pointAt(0.1, 0)
            return { x: x + fan(k, n) * sp.tx * sp.s, y: y + fan(k, n) * sp.ty * sp.s, s: sp.s, onLand: false }
          }
          case 'rapids': {
            const { x, y, sp } = pointAt(0.47, 0.3)
            return { x: x + fan(k, n) * sp.tx * sp.s, y: y + fan(k, n) * sp.ty * sp.s, s: sp.s, onLand: false }
          }
          case 'rock': {
            const s = bigRock.sp.s
            return {
              x: bigRock.x + fan(k, n) * s * 0.8,
              y: bigRock.y - bigRock.size * 0.55,
              s,
              onLand: true,
            }
          }
          case 'shade': {
            const s = bigTree.s * 0.7
            return { x: bigTree.x - 12 * bigTree.s + fan(k, n) * s, y: bigTree.y + 6 * bigTree.s, s, onLand: true }
          }
          case 'shallows': {
            const { x, y, sp } = pointAt(narrow ? 0.64 : 0.74, -0.82)
            return { x: x + fan(k, n) * sp.tx * sp.s, y: y + fan(k, n) * sp.ty * sp.s, s: sp.s, onLand: false }
          }
          case 'eddy': {
            const { x, y, sp } = pointAt(narrow ? 0.82 : 0.9, 0.25)
            return { x: x + fan(k, n) * sp.tx * sp.s, y: y + fan(k, n) * sp.ty * sp.s, s: sp.s, onLand: false }
          }
          default:
            return null
        }
      }

      let gi = 0
      for (const [spot, group] of bySpot) {
        if (spot === 'drift') continue
        group.forEach((m, k) => {
          const a = anchor(spot, k, group.length)
          if (a) placed.push({ m, ...a, i: gi++ })
        })
      }
      const drifters = bySpot.get('drift') ?? []
      const lanes = narrow ? [-0.55, 0.55, 0] : [-0.4, 0.4, 0, -0.2, 0.2]
      drifters.forEach((m, k) => {
        const u = 0.14 + ((k + 0.5) / drifters.length) * 0.78
        const { x, y, sp } = pointAt(u, lanes[k % lanes.length])
        placed.push({ m, x, y, s: sp.s, onLand: false, i: gi++ })
      })

      placed.sort((a, b) => a.y - b.y)
      for (const pl of placed) {
        const bob =
          reducedMotion.matches || pl.onLand
            ? 0
            : Math.sin(t * 0.002 * (1 + sev * 2) + pl.i * 1.7) * (1 + sev * 5) * pl.s
        if (pl.onLand) {
          ctx.fillStyle = 'rgba(10, 14, 18, 0.25)'
          ctx.beginPath()
          ctx.ellipse(pl.x, pl.y + 3 * pl.s, 8 * pl.s, 2.5 * pl.s, 0, 0, Math.PI * 2)
          ctx.fill()
        }
        // On a phone, seven name tags can't fit — keep yours (unless it would
        // land in the caption band); the team tab names everyone.
        const nameFits = !narrow || (pl.m.isMe && pl.y + 14 * pl.s + 10 < h - 100)
        drawAvatar(ctx, pl.m, pl.x, pl.y + bob, t, pl.i, pl.s * 1.15, pl.onLand, nameFits)
      }
    }

    const drawStatic = () => {
      const octx = overlay.getContext('2d')
      if (octx) {
        octx.setTransform(1, 0, 0, 1, 0, 0)
        octx.clearRect(0, 0, overlay.width, overlay.height)
        octx.drawImage(canvas, 0, 0)
        overlay.style.transition = 'none'
        overlay.style.opacity = '1'
        requestAnimationFrame(() => {
          overlay.style.transition = 'opacity 1.2s ease'
          overlay.style.opacity = '0'
        })
      }
      tweenRef.current.start = -TWEEN_MS
      draw(performance.now())
    }
    drawStaticRef.current = drawStatic

    let lastFrame = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      // The 1ms slack matters: two 60Hz vsyncs sum to 33.3ms, which rounds
      // under 33.333 most of the time and would skip to a juddery 3-vsync
      // cadence (~20fps) without it.
      if (now - lastFrame < FRAME_MS - 1) return
      lastFrame = now
      if (currentDpr() !== dpr) size()
      draw(now)
    }

    size()
    const ro = new ResizeObserver(() => {
      size()
      if (reducedMotion.matches) drawStatic()
    })
    ro.observe(wrap)

    let inView = true
    const startOrStop = () => {
      cancelAnimationFrame(raf)
      if (reducedMotion.matches) drawStatic()
      else if (!document.hidden && inView) raf = requestAnimationFrame(loop)
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry?.isIntersecting ?? true
        startOrStop()
      },
      { threshold: 0 },
    )
    io.observe(wrap)
    startOrStop()
    reducedMotion.addEventListener('change', startOrStop)
    document.addEventListener('visibilitychange', startOrStop)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      reducedMotion.removeEventListener('change', startOrStop)
      document.removeEventListener('visibilitychange', startOrStop)
    }
  }, [])

  useEffect(() => {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setTimeout(() => drawStaticRef.current?.())
    return () => clearTimeout(id)
  }, [scene, members])

  return (
    <div className="river-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} aria-hidden="true" />
      <canvas ref={overlayRef} aria-hidden="true" className="river-overlay" />
    </div>
  )
}

// --- avatars ---------------------------------------------------------------
// Each person: a personal color (shirt, gear), hair, a face, and a prop for
// the pose. Drawn in a ~24px unit space and scaled by distance.

const SKIN = '#f0d6ba'
const WOOD = '#8a6642'
const WOOD_DARK = '#6e4f33'

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  m: RiverMember,
  x: number,
  y: number,
  t: number,
  i: number,
  s: number,
  onLand: boolean,
  showName = true,
) {
  const c = memberColor(m.id)
  const hair = memberHair(m.id)
  ctx.save()
  ctx.translate(x, y)
  ctx.save()
  ctx.scale(s, s)

  // a soft reflection under anyone on the water
  if (!onLand && m.pose !== 'underwater') {
    ctx.fillStyle = 'rgba(10, 14, 18, 0.18)'
    ctx.beginPath()
    ctx.ellipse(0, 4, 11, 3, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  switch (m.pose) {
    case 'underwater': {
      ctx.globalAlpha = 0.62
      head(ctx, 0, 7, hair)
      // mask
      ctx.fillStyle = FOAM_CSS
      ctx.fillRect(-3.6, 5.6, 7.2, 3)
      ctx.fillStyle = '#6fb1c9'
      ctx.fillRect(-3, 6.1, 6, 2)
      ctx.globalAlpha = 1
      // snorkel in their color, poking above the surface
      ctx.strokeStyle = c
      ctx.lineWidth = 1.8
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(4, 6)
      ctx.lineTo(5.5, 0)
      ctx.lineTo(6.5, -8)
      ctx.stroke()
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.arc(6.5, -8.5, 1.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(230, 237, 242, 0.8)'
      for (let b = 0; b < 3; b++) {
        const by = 2 - ((t * 0.04 + b * 14 + i * 5) % 26)
        ctx.beginPath()
        ctx.arc(-4 + b * 2.5, by, 1.5 - b * 0.3, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'raft': {
      ctx.fillStyle = WOOD
      ctx.beginPath()
      ctx.roundRect(-13, -2, 26, 5, 1.5)
      ctx.fill()
      ctx.strokeStyle = WOOD_DARK
      ctx.lineWidth = 0.8
      for (const lx of [-7, -1, 5]) {
        ctx.beginPath()
        ctx.moveTo(lx, -2)
        ctx.lineTo(lx, 3)
        ctx.stroke()
      }
      // a little flag in their color
      ctx.strokeStyle = WOOD_DARK
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(11, -2)
      ctx.lineTo(11, -15)
      ctx.stroke()
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.moveTo(11, -15)
      ctx.lineTo(17.5, -12.5)
      ctx.lineTo(11, -10)
      ctx.closePath()
      ctx.fill()
      torso(ctx, c, 0, -6)
      head(ctx, 0, -14, hair)
      arm(ctx, -5, -8, -8, -2)
      arm(ctx, 5, -8, 8, -2)
      break
    }
    case 'struck': {
      torso(ctx, c, 0, -3)
      head(ctx, 0, -11, hair)
      // hair standing on end
      ctx.strokeStyle = hair
      ctx.lineWidth = 1.2
      ctx.lineCap = 'round'
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath()
        ctx.moveTo(k * 1.8, -15)
        ctx.lineTo(k * 3.4, -21)
        ctx.stroke()
      }
      arm(ctx, -5, -5, -10, -10)
      arm(ctx, 5, -5, 10, -10)
      if ((t + i * 700) % 3400 < 220) {
        ctx.strokeStyle = SUN_CSS
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(2, -36)
        ctx.lineTo(-3, -26)
        ctx.lineTo(3, -23)
        ctx.lineTo(-1, -17)
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(160, 165, 170, 0.5)'
      for (let k = 0; k < 2; k++) {
        const sy = -19 - ((t * 0.02 + k * 9 + i * 3) % 14)
        ctx.beginPath()
        ctx.arc(k * 4 - 2, sy, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'coconut': {
      // lounge chair: legs, seat, slanted back, stripes
      ctx.strokeStyle = WOOD_DARK
      ctx.lineWidth = 1.2
      for (const lx of [-10, 6]) {
        ctx.beginPath()
        ctx.moveTo(lx, 2)
        ctx.lineTo(lx, 7)
        ctx.stroke()
      }
      ctx.fillStyle = c
      ctx.beginPath()
      ctx.roundRect(-13, 0, 22, 4, 1.5)
      ctx.fill()
      ctx.strokeStyle = c
      ctx.lineWidth = 4
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(8, 1)
      ctx.lineTo(13, -11)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(230, 237, 242, 0.55)'
      ctx.lineWidth = 1
      for (const sx of [-10, -6, -2, 2]) {
        ctx.beginPath()
        ctx.moveTo(sx, 0.5)
        ctx.lineTo(sx, 3.5)
        ctx.stroke()
      }
      // reclined body, lighter shirt so it reads against the chair
      ctx.fillStyle = lighten(c)
      ctx.beginPath()
      ctx.roundRect(-5, -6, 13, 7, 3)
      ctx.fill()
      arm(ctx, -4, -1, -11, 1)
      head(ctx, 9, -11, hair)
      // the coconut, with a straw and a tiny umbrella
      ctx.fillStyle = WOOD_DARK
      ctx.beginPath()
      ctx.arc(-14, -5, 3.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = FOAM_CSS
      ctx.lineWidth = 0.9
      ctx.beginPath()
      ctx.moveTo(-13, -7)
      ctx.lineTo(-11.5, -12)
      ctx.stroke()
      ctx.fillStyle = SUN_CSS
      ctx.beginPath()
      ctx.moveTo(-16, -11)
      ctx.lineTo(-11.5, -15)
      ctx.lineTo(-7, -11)
      ctx.closePath()
      ctx.fill()
      break
    }
    case 'waving': {
      torso(ctx, c, 0, -3)
      head(ctx, 0, -11, hair)
      arm(ctx, -5, -5, -9, -1)
      const wave = Math.sin(t * 0.009 + i) * 3
      arm(ctx, 5, -6, 8, -17 + wave)
      ctx.fillStyle = SKIN
      ctx.beginPath()
      ctx.arc(8.3, -18.5 + wave, 1.7, 0, Math.PI * 2)
      ctx.fill()
      break
    }
    default: {
      // floating in an inner tube
      torso(ctx, c, 0, -4)
      ctx.strokeStyle = c
      ctx.lineWidth = 4.2
      ctx.beginPath()
      ctx.ellipse(0, 0, 10.5, 5, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
      ctx.lineWidth = 1.3
      ctx.beginPath()
      ctx.ellipse(0, 0, 10.5, 5, 0, Math.PI * 1.1, Math.PI * 1.6)
      ctx.stroke()
      head(ctx, 0, -12, hair)
      arm(ctx, -4, -6, -9, -1)
      arm(ctx, 4, -6, 9, -1)
    }
  }
  ctx.restore()

  if (showName) {
    ctx.globalAlpha = 1
    ctx.font = `${m.isMe ? '600 ' : ''}10.5px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillStyle = m.isMe ? SUN_CSS : c
    ctx.fillText(m.displayName.slice(0, 14), 0, 14 * s + 10)
  }
  ctx.restore()
}

function lighten(hex: string): string {
  return rgbCss(lerpRgb(hexToRgb(hex), FOAM, 0.4))
}

function torso(ctx: CanvasRenderingContext2D, color: string, x: number, y: number) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x - 5, y - 4, 10, 9, 3)
  ctx.fill()
}

function head(ctx: CanvasRenderingContext2D, x: number, y: number, hair: string) {
  ctx.fillStyle = SKIN
  ctx.beginPath()
  ctx.arc(x, y, 5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = hair
  ctx.beginPath()
  ctx.arc(x, y - 0.4, 5.2, Math.PI * 1.02, Math.PI * 1.98)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#2b2f36'
  ctx.beginPath()
  ctx.arc(x - 1.8, y + 0.6, 0.7, 0, Math.PI * 2)
  ctx.arc(x + 1.8, y + 0.6, 0.7, 0, Math.PI * 2)
  ctx.fill()
}

function arm(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  ctx.strokeStyle = SKIN
  ctx.lineWidth = 2.2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}
