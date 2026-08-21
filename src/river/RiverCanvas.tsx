import { useEffect, useRef } from 'react'
import { SCENES, hexToRgb, lerp, lerpRgb, rgbCss } from './scenes'
import type { Rgb, RiverMember, SceneName, Spot } from './scenes'

type Props = {
  scene: SceneName | null
  members: RiverMember[]
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
}

function makeScenery(): Scenery {
  return {
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

export default function RiverCanvas({ scene, members }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)

  const membersRef = useRef<RiverMember[]>(members)
  membersRef.current = members
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
      // Phones get a taller frame so the diagonal has room to descend.
      const h =
        w < 600
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
      for (let i = 0; i <= N; i++) {
        const u = i / N
        path.push({
          u,
          x: lerp(-0.06 * w, 1.06 * w, u),
          y:
            horizon +
            h * 0.07 +
            (h - horizon - h * 0.16) * u ** 1.08 +
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
        ctx.fillStyle = rgbCss(lerpRgb(p.foliage, p.bank, tr.shade * 0.4))
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
      // wet earth at the edge
      bankPoly(5, 0.4, 0)
      ctx.fillStyle = rgbCss(lerpRgb(p.bank, p.waterDeep, 0.45))
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
      const fan = (k: number, n: number) => (k - (n - 1) / 2) * 11

      const anchor = (spot: Spot, k: number, n: number) => {
        switch (spot) {
          case 'headwater': {
            const { x, y, sp } = pointAt(0.1, 0)
            return { x: x + fan(k, n) * sp.nx * sp.s, y: y + fan(k, n) * sp.ny * sp.s, s: sp.s, onLand: false }
          }
          case 'rapids': {
            const { x, y, sp } = pointAt(0.47, -0.15)
            return { x: x + fan(k, n) * sp.nx * sp.s, y: y + fan(k, n) * sp.ny * sp.s, s: sp.s, onLand: false }
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
            const { x, y, sp } = pointAt(0.74, -0.82)
            return { x: x + fan(k, n) * sp.tx * sp.s, y: y + fan(k, n) * sp.ty * sp.s, s: sp.s, onLand: false }
          }
          case 'eddy': {
            const { x, y, sp } = pointAt(0.9, 0.25)
            return { x: x + fan(k, n) * sp.nx * sp.s, y: y + fan(k, n) * sp.ny * sp.s, s: sp.s, onLand: false }
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
        // On a phone, seven name tags can't fit — keep yours; the team tab
        // names everyone.
        drawAvatar(ctx, pl.m, pl.x, pl.y + bob, t, pl.i, pl.s, !narrow || pl.m.isMe)
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
      if (now - lastFrame < FRAME_MS) return
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

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  m: RiverMember,
  x: number,
  y: number,
  t: number,
  i: number,
  s: number,
  showName = true,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.save()
  ctx.scale(s, s)

  switch (m.pose) {
    case 'underwater': {
      ctx.globalAlpha = 0.55
      head(ctx, 0, 9)
      ctx.globalAlpha = 0.8
      ctx.fillStyle = FOAM_CSS
      for (let b = 0; b < 3; b++) {
        const by = 4 - ((t * 0.04 + b * 14 + i * 5) % 26)
        ctx.beginPath()
        ctx.arc(4 + b * 3, by, 1.6 - b * 0.3, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'raft': {
      ctx.fillStyle = '#8a6642'
      ctx.beginPath()
      ctx.roundRect(-11, -2, 22, 5, 2)
      ctx.fill()
      head(ctx, 0, -8)
      arm(ctx, -4, -6, -9, -1)
      arm(ctx, 4, -6, 9, -1)
      break
    }
    case 'struck': {
      head(ctx, 0, -8, '#6a6f75')
      if ((t + i * 700) % 3400 < 220) {
        ctx.strokeStyle = SUN_CSS
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(2, -34)
        ctx.lineTo(-3, -22)
        ctx.lineTo(3, -18)
        ctx.lineTo(-1, -11)
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(160, 165, 170, 0.5)'
      for (let k = 0; k < 2; k++) {
        const sy = -16 - ((t * 0.02 + k * 9 + i * 3) % 14)
        ctx.beginPath()
        ctx.arc(k * 4 - 2, sy, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'coconut': {
      ctx.strokeStyle = SUN_CSS
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-12, 2)
      ctx.lineTo(-2, 2)
      ctx.lineTo(8, -8)
      ctx.stroke()
      head(ctx, 8, -13)
      ctx.fillStyle = SUN_CSS
      ctx.fillRect(-14, -8, 4, 6)
      ctx.strokeStyle = FOAM_CSS
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(-12, -8)
      ctx.lineTo(-10, -13)
      ctx.stroke()
      break
    }
    case 'waving': {
      head(ctx, 0, -8)
      arm(ctx, -4, -6, -9, -2)
      const wave = Math.sin(t * 0.009 + i) * 3
      arm(ctx, 4, -7, 8, -16 + wave)
      break
    }
    default: {
      head(ctx, 0, -8)
      arm(ctx, -4, -5, -10, -3)
      arm(ctx, 4, -5, 10, -3)
    }
  }
  ctx.restore()

  if (showName) {
    ctx.globalAlpha = 1
    ctx.font = '10.5px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillStyle = m.isMe ? SUN_CSS : 'rgba(230, 237, 242, 0.85)'
    ctx.fillText(m.displayName.slice(0, 14), 0, 14 * s + 10)
  }
  ctx.restore()
}

function head(ctx: CanvasRenderingContext2D, x: number, y: number, color = FOAM_CSS) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, 5, 0, Math.PI * 2)
  ctx.fill()
}

function arm(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  ctx.strokeStyle = FOAM_CSS
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}
