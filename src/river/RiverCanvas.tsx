import { useEffect, useRef } from 'react'
import { SCENES, hexToRgb, lerp, lerpRgb, rgbCss } from './scenes'
import type { Rgb, RiverMember, SceneName } from './scenes'

type Props = {
  scene: SceneName | null
  members: RiverMember[]
}

/**
 * A stream running downhill toward the viewer. Perspective is faked with two
 * functions of screen-y: centerX (a gentle S-curve) and halfWidth (narrow at
 * the horizon, wide at the bank). Everything on the land — grass, reeds,
 * trees, rocks — is laid out once in unit space and scaled by that same
 * perspective, so the scene survives resizes and stays coherent.
 *
 * Weather is one scalar. Severity drives flow speed, chop, whitecaps, rain,
 * cloud mass, lightning, how hard the reeds lean, how far the greens drain
 * out of the banks, and how much the avatars bob.
 */

/** Numeric snapshot of everything the renderer needs; tweened, never snapped. */
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
// Phones report DPR 3: a 1170px-wide river becomes a 3500px backing store
// redrawn 60×/s. Capping DPR and frame rate keeps it fluid on a phone at a
// fraction of the cost; nobody can see the difference at these sizes.
const MAX_DPR = 1.5
const FRAME_MS = 1000 / 30

const FOAM: Rgb = [230, 237, 242]
const FOAM_CSS = '#e6edf2'
const SUN_CSS = '#e8c87e'

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
// Deterministic pseudo-random in [0,1): the same scenery every visit.
const rnd = (i: number, salt = 0) => {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

type Raindrop = { x: number; y: number; len: number; speed: number }

type Scenery = {
  grass: Array<{ u: number; v: number; len: number; shade: number }>
  reeds: Array<{ side: -1 | 1; v: number; off: number; h: number; phase: number }>
  trees: Array<{ side: -1 | 1; v: number; off: number; size: number; shade: number }>
  rocks: Array<{ lane: number; v: number; size: number }>
  streaks: Array<{ lane: number; phase: number; len: number }>
}

function makeScenery(): Scenery {
  const grass = Array.from({ length: 260 }, (_, i) => ({
    u: rnd(i, 1),
    v: rnd(i, 2) ** 0.6, // denser toward the viewer
    len: 0.4 + rnd(i, 3) * 0.6,
    shade: rnd(i, 4),
  }))
  const reeds = Array.from({ length: 30 }, (_, i) => ({
    side: (i % 2 === 0 ? 1 : -1) as 1 | -1,
    v: 0.12 + rnd(i, 5) * 0.85,
    off: rnd(i, 6),
    h: 0.6 + rnd(i, 7) * 0.6,
    phase: rnd(i, 8) * Math.PI * 2,
  }))
  const trees = Array.from({ length: 12 }, (_, i) => ({
    side: (i % 2 === 0 ? 1 : -1) as 1 | -1,
    v: 0.04 + rnd(i, 9) * 0.8,
    off: 0.1 + rnd(i, 10) * 0.9,
    size: 0.7 + rnd(i, 11) * 0.7,
    shade: rnd(i, 12),
  })).sort((a, b) => a.v - b.v)
  const rocks = Array.from({ length: 6 }, (_, i) => ({
    lane: (rnd(i, 13) - 0.5) * 1.4,
    v: 0.3 + rnd(i, 14) * 0.6,
    size: 0.6 + rnd(i, 15) * 0.8,
  }))
  const streaks = Array.from({ length: 70 }, (_, i) => ({
    lane: (rnd(i, 16) - 0.5) * 1.7,
    phase: rnd(i, 17),
    len: 0.6 + rnd(i, 18) * 0.8,
  }))
  return { grass, reeds, trees, rocks, streaks }
}

export default function RiverCanvas({ scene, members }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)

  // Imperative state lives in refs: the draw loop reads them every frame
  // without re-rendering React.
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
      // Phones get a taller frame: a narrow stream needs vertical room for the
      // avatars to sit above the scene name instead of on it.
      const h =
        w < 600
          ? Math.min(380, Math.max(280, Math.round(w * 0.8)))
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

      // --- perspective ----------------------------------------------------
      const horizon = h * 0.34
      const span = h - horizon
      const riverT = (y: number) => clamp01((y - horizon) / span)
      const centerX = (y: number) => {
        const r = riverT(y)
        return w * 0.5 + Math.sin(r * 2.4 + 0.8) * w * 0.09 * r
      }
      const halfWidth = (y: number) => lerp(w * 0.01, w * 0.3, riverT(y) ** 1.4)
      const ground = (v: number) => horizon + v * span
      const wind = Math.sin(t * 0.0011) * (0.3 + sev * 1.4) + sev * 0.9

      // --- sky ------------------------------------------------------------
      const sky = ctx.createLinearGradient(0, 0, 0, horizon)
      sky.addColorStop(0, rgbCss(p.skyTop))
      sky.addColorStop(1, rgbCss(p.skyBottom))
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, horizon + 4)

      // sun — a warm low light that severity slowly puts away
      if (p.sun > 0.02) {
        const sx = w * 0.74
        const sy = horizon * 0.42
        const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, w * 0.11)
        glow.addColorStop(0, `rgba(232, 200, 126, ${0.9 * p.sun})`)
        glow.addColorStop(1, 'rgba(232, 200, 126, 0)')
        ctx.fillStyle = glow
        ctx.fillRect(sx - w * 0.12, sy - w * 0.12, w * 0.24, w * 0.24)
        ctx.fillStyle = `rgba(240, 214, 150, ${p.sun})`
        ctx.beginPath()
        ctx.arc(sx, sy, 13, 0, Math.PI * 2)
        ctx.fill()
      }

      // clouds — count, mass, and darkness scale with cover and severity
      const cloudCount = Math.round(p.clouds * 7)
      for (let i = 0; i < cloudCount; i++) {
        const cx = ((rnd(i, 20) * (w + 260) + t * 0.01 * (1 + sev)) % (w + 260)) - 130
        const cy = horizon * (0.16 + rnd(i, 21) * 0.5)
        const scale = (0.7 + rnd(i, 22) * 0.8) * (1 + sev * 0.5)
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

      // distant hills, hazier the farther back
      for (let k = 0; k < 2; k++) {
        ctx.fillStyle = rgbCss(lerpRgb(p.hill, p.skyBottom, k === 0 ? 0.45 : 0.15))
        ctx.beginPath()
        ctx.moveTo(0, horizon + 6)
        for (let x = 0; x <= w; x += 8) {
          const y =
            horizon -
            (10 + k * 7) +
            Math.sin(x * 0.011 + k * 2.1) * 7 +
            Math.sin(x * 0.027 + k) * 3 +
            (k ? Math.sin(x * 0.005) * 9 : Math.sin(x * 0.004 + 1) * 12)
          ctx.lineTo(x, y)
        }
        ctx.lineTo(w, horizon + 6)
        ctx.closePath()
        ctx.fill()
      }

      // --- land -----------------------------------------------------------
      const land = ctx.createLinearGradient(0, horizon, 0, h)
      land.addColorStop(0, rgbCss(lerpRgb(p.bank, p.skyBottom, 0.4)))
      land.addColorStop(1, rgbCss(lerpRgb(p.bank, [0, 0, 0], 0.12)))
      ctx.fillStyle = land
      ctx.fillRect(0, horizon, w, span)

      // grass — short strokes, denser and longer toward the viewer
      ctx.lineCap = 'round'
      for (const g of scenery.grass) {
        const y = ground(g.v)
        const x = g.u * w
        if (Math.abs(x - centerX(y)) < halfWidth(y) + 6) continue
        const r = riverT(y)
        const len = (2 + r * 9) * g.len
        ctx.strokeStyle = rgbCss(lerpRgb(p.foliage, p.bank, g.shade * 0.7), 0.55 + 0.35 * g.shade)
        ctx.lineWidth = 1 + r * 0.8
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + wind * len * 0.35, y - len)
        ctx.stroke()
      }

      // trees on the outskirts, far ones first
      for (const tr of scenery.trees) {
        const y = ground(tr.v)
        const r = riverT(y)
        const x = centerX(y) + tr.side * (halfWidth(y) + 28 * r + tr.off * w * 0.22 + 14)
        if (x < -30 || x > w + 30) continue
        const s = (0.45 + r * 0.9) * tr.size
        ctx.fillStyle = rgbCss(lerpRgb(p.foliage, [0, 0, 0], 0.45))
        ctx.fillRect(x - 1.6 * s, y - 13 * s, 3.2 * s, 13 * s)
        const sway = wind * 2 * s
        ctx.fillStyle = rgbCss(lerpRgb(p.foliage, p.bank, tr.shade * 0.4))
        for (const [dx, dy, rad] of [
          [0, -19, 9.5],
          [-7.5, -13.5, 7],
          [7.5, -14.5, 7.2],
        ]) {
          ctx.beginPath()
          ctx.arc(x + dx * s + sway, y + dy * s, rad * s, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // --- water ----------------------------------------------------------
      const chopAmp = 0.6 + sev * 3.5
      ctx.beginPath()
      for (let y = horizon; y <= h + 6; y += 6) {
        const chop = Math.sin(y * 0.12 + t * 0.003 + 1) * chopAmp * riverT(y)
        ctx.lineTo(centerX(y) - halfWidth(y) + chop, y)
      }
      for (let y = h + 6; y >= horizon; y -= 6) {
        const chop = Math.sin(y * 0.1 - t * 0.0025 + 3) * chopAmp * riverT(y)
        ctx.lineTo(centerX(y) + halfWidth(y) - chop, y)
      }
      ctx.closePath()
      const water = ctx.createLinearGradient(0, horizon, 0, h)
      water.addColorStop(0, rgbCss(lerpRgb(p.water, p.skyBottom, 0.3)))
      water.addColorStop(1, rgbCss(p.waterDeep))
      ctx.fillStyle = water
      ctx.fill()

      // the deep channel down the middle
      ctx.beginPath()
      for (let y = horizon; y <= h + 6; y += 8) ctx.lineTo(centerX(y) - halfWidth(y) * 0.5, y)
      for (let y = h + 6; y >= horizon; y -= 8) ctx.lineTo(centerX(y) + halfWidth(y) * 0.5, y)
      ctx.closePath()
      ctx.fillStyle = rgbCss(p.waterDeep, 0.35)
      ctx.fill()

      // flow streaks — the current, moving toward the viewer
      const speed = 0.00006 + sev * 0.00022
      for (let i = 0; i < scenery.streaks.length; i++) {
        const s = scenery.streaks[i]
        const prog = (s.phase + t * speed) % 1
        const y = horizon + prog * span
        const r = riverT(y)
        const x = centerX(y) + s.lane * halfWidth(y) * 0.92
        const len = (4 + r * 24) * s.len
        const whitecap = sev > 0.5 && i % 3 === 0
        ctx.strokeStyle = rgbCss(FOAM, (whitecap ? 0.55 : 0.18 + sev * 0.22) * (0.3 + r))
        ctx.lineWidth = 0.8 + r * 1.2
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + wind * 0.5, y + len)
        ctx.stroke()
        if (whitecap) {
          ctx.beginPath()
          ctx.moveTo(x - 4 * r, y + len * 0.3)
          ctx.lineTo(x + 4 * r, y + len * 0.3 + 1)
          ctx.stroke()
        }
      }

      // rocks, with foam once the water gets pushy
      const foamAlpha = clamp01((sev - 0.35) * 1.6)
      const rockColor = lerpRgb(p.waterDeep, [0, 0, 0], 0.4)
      for (const rk of scenery.rocks) {
        const y = ground(rk.v)
        const r = riverT(y)
        const x = centerX(y) + rk.lane * halfWidth(y) * 0.8
        const size = (3 + r * 11) * rk.size
        ctx.fillStyle = rgbCss(rockColor)
        ctx.beginPath()
        ctx.ellipse(x, y, size, size * 0.6, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = rgbCss(lerpRgb(rockColor, FOAM, 0.12))
        ctx.beginPath()
        ctx.ellipse(x - size * 0.3, y - size * 0.25, size * 0.35, size * 0.15, 0, 0, Math.PI * 2)
        ctx.fill()
        if (foamAlpha > 0.01) {
          const wobble = Math.sin(t * 0.008 + rk.v * 9) * 0.8
          // A soft bow-wave upstream (toward the horizon) and two wake streaks
          // downstream. Never a ring around the rock — that reads as an eye.
          ctx.fillStyle = rgbCss(FOAM, foamAlpha * 0.45)
          ctx.beginPath()
          ctx.ellipse(x, y - size * 0.75 + wobble, size * 0.9, size * 0.28, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = rgbCss(FOAM, foamAlpha * 0.5)
          ctx.lineWidth = 1 + r
          for (const dir of [-1, 1]) {
            ctx.beginPath()
            ctx.moveTo(x + dir * size * 0.9, y + size * 0.2)
            ctx.lineTo(x + dir * size * 1.4 + wobble, y + size * 2.4)
            ctx.stroke()
          }
        }
      }

      // reeds along both banks, leaning with the wind
      ctx.lineCap = 'round'
      for (const rd of scenery.reeds) {
        const y = ground(rd.v)
        const r = riverT(y)
        const x = centerX(y) + rd.side * (halfWidth(y) + 3 + rd.off * 16 * (0.5 + r))
        const hgt = (6 + r * 28) * rd.h
        const bend = (wind + Math.sin(t * 0.002 + rd.phase) * 0.4) * hgt * 0.35
        ctx.strokeStyle = rgbCss(lerpRgb(p.foliage, FOAM, 0.12), 0.9)
        ctx.lineWidth = 1 + r
        for (const b of [-1, 0, 1]) {
          ctx.beginPath()
          ctx.moveTo(x + b * 1.5, y)
          ctx.quadraticCurveTo(
            x + bend * 0.5 + b * 2,
            y - hgt * 0.55,
            x + bend + b * 4 * r,
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
            ctx.moveTo(bx, horizon * 0.2)
            ctx.lineTo(bx - 12, horizon * 0.5)
            ctx.lineTo(bx + 6, horizon * 0.65)
            ctx.lineTo(bx - 8, horizon * 1.02)
            ctx.stroke()
          }
          lightningFlash *= 0.86
        }
      }

      // --- avatars: fixed slots down the stream, far ones first ------------
      // The bottom third of the frame belongs to the scene name, so slots stop
      // short of it. Narrow frames zig-zag across the stream to keep names apart.
      const list = membersRef.current
      const narrow = w < 600
      const lanes = narrow ? [-0.6, 0.6, 0] : [-0.42, 0.4, 0, -0.22, 0.24, -0.48, 0.46]
      const vStart = narrow ? 0.16 : 0.2
      const vSpan = narrow ? 0.48 : 0.48
      list.forEach((m, i) => {
        const v = vStart + ((i + 0.5) / list.length) * vSpan
        const y = ground(v)
        const r = riverT(y)
        const x = centerX(y) + lanes[i % lanes.length] * halfWidth(y) * 0.8
        const s = 0.55 + r * 0.8
        const bob = reducedMotion.matches
          ? 0
          : Math.sin(t * 0.002 * (1 + sev * 2) + i * 1.7) * (1 + sev * 6) * s
        // On a phone, six name tags in a 140px stream can't all fit — keep
        // yours; the team tab names everyone.
        drawAvatar(ctx, m, x, y + bob, t, i, s, !narrow || m.isMe)
      })
    }

    const drawStatic = () => {
      // Reduced motion: crossfade between stills instead of animating.
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
      // Jump the tween to its end and draw one settled frame.
      tweenRef.current.start = -TWEEN_MS
      draw(performance.now())
    }
    drawStaticRef.current = drawStatic

    let lastFrame = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (now - lastFrame < FRAME_MS) return
      lastFrame = now
      // Self-heal on zoom / monitor moves: dpr changes don't fire ResizeObserver.
      if (currentDpr() !== dpr) size()
      draw(now)
    }

    size()
    const ro = new ResizeObserver(() => {
      size()
      if (reducedMotion.matches) drawStatic()
    })
    ro.observe(wrap)

    // Don't burn frames nobody can see: background tab or scrolled away.
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

  // Under reduced motion the loop isn't running, so scene/member changes
  // need an explicit still-frame redraw (with the old frame crossfading out).
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
      // a periodic re-strike, because comedy is timing
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

  // name tag, unscaled so it stays legible at the far end
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
