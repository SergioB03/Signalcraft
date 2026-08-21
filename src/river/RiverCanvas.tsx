import { useEffect, useRef } from 'react'
import { SCENES, hexToRgb, lerp, lerpRgb, rgbCss } from './scenes'
import type { Rgb, RiverMember, SceneName } from './scenes'

type Props = {
  scene: SceneName | null
  members: RiverMember[]
}

/** Numeric snapshot of everything the renderer needs; tweened, never snapped. */
type Palette = {
  severity: number
  skyTop: Rgb
  skyBottom: Rgb
  water: Rgb
  waterDeep: Rgb
  sun: number
  clouds: number
  rain: number
}

const TWEEN_MS = 2000

function paletteFor(scene: SceneName): Palette {
  const s = SCENES[scene]
  return {
    severity: s.severity,
    skyTop: hexToRgb(s.skyTop),
    skyBottom: hexToRgb(s.skyBottom),
    water: hexToRgb(s.water),
    waterDeep: hexToRgb(s.waterDeep),
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
    sun: lerp(a.sun, b.sun, t),
    clouds: lerp(a.clouds, b.clouds, t),
    rain: lerp(a.rain, b.rain, t),
  }
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

type Raindrop = { x: number; y: number; len: number; speed: number }

export default function RiverCanvas({ scene, members }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)

  // Imperative state lives in refs: the draw loop reads them every frame
  // without re-rendering React.
  const membersRef = useRef<RiverMember[]>(members)
  membersRef.current = members

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
    if (!wrap || !canvas || !overlay) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const drops: Raindrop[] = []
    let raf = 0
    let lightningFlash = 0
    let nextLightningAt = 0

    // The dpr used to size the backing store — draw() must divide by THIS,
    // not the live devicePixelRatio, or browser zoom mid-demo garbles the scene.
    let dpr = window.devicePixelRatio || 1
    const size = () => {
      dpr = window.devicePixelRatio || 1
      const w = wrap.clientWidth
      const h = Math.min(420, Math.max(240, Math.round(w * 0.45)))
      for (const c of [canvas, overlay]) {
        c.width = Math.round(w * dpr)
        c.height = Math.round(h * dpr)
        c.style.height = `${h}px`
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const waveY = (x: number, t: number, base: number, p: Palette, layer: number) => {
      const amp = (1.5 + p.severity * 13) * (1 - layer * 0.25)
      const speed = (0.4 + p.severity * 2.2) * (layer % 2 === 0 ? 1 : -0.7)
      const wl = 90 - layer * 18
      return (
        base +
        layer * 12 +
        amp * Math.sin((x + t * 0.06 * speed * 60) / wl) +
        amp * 0.45 * Math.sin((x * 1.7 - t * 0.05 * speed * 60) / (wl * 0.6))
      )
    }

    const draw = (now: number) => {
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      const tw = tweenRef.current
      const progress = easeInOut(Math.min(1, (now - tw.start) / TWEEN_MS))
      const p = mix(tw.from, tw.to, progress)
      const t = reducedMotion.matches ? 0 : now
      const waterline = h * 0.52

      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, waterline)
      sky.addColorStop(0, rgbCss(p.skyTop))
      sky.addColorStop(1, rgbCss(p.skyBottom))
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, waterline + 20)

      // sun — a warm glow that severity slowly puts away
      if (p.sun > 0.02) {
        const sx = w * 0.78
        const sy = waterline * 0.35
        const glow = ctx.createRadialGradient(sx, sy, 4, sx, sy, 70)
        glow.addColorStop(0, `rgba(232, 200, 126, ${0.95 * p.sun})`)
        glow.addColorStop(1, 'rgba(232, 200, 126, 0)')
        ctx.fillStyle = glow
        ctx.fillRect(sx - 80, sy - 80, 160, 160)
      }

      // clouds — count and darkness scale with cover
      const cloudCount = Math.round(p.clouds * 6)
      for (let i = 0; i < cloudCount; i++) {
        const seed = (i * 137.5) % 97
        const cx = ((seed / 97) * (w + 240) + t * 0.012 * (1 + p.severity)) % (w + 240) - 120
        const cy = waterline * (0.12 + ((seed * 7) % 29) / 100)
        const shade = 235 - p.severity * 150
        ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade + 5}, ${0.35 + p.clouds * 0.3})`
        for (const [dx, dy, r] of [
          [0, 0, 22],
          [18, 4, 16],
          [-19, 5, 15],
        ]) {
          ctx.beginPath()
          ctx.ellipse(cx + dx, cy + dy, r, r * 0.55, 0, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // water body
      const sea = ctx.createLinearGradient(0, waterline - 16, 0, h)
      sea.addColorStop(0, rgbCss(p.water))
      sea.addColorStop(1, rgbCss(p.waterDeep))
      ctx.fillStyle = sea
      ctx.fillRect(0, waterline - 16, w, h - waterline + 16)

      // three wave layers, front-most brightest
      for (let layer = 2; layer >= 0; layer--) {
        ctx.beginPath()
        ctx.moveTo(0, h)
        for (let x = 0; x <= w; x += 4) {
          ctx.lineTo(x, waveY(x, t, waterline, p, layer))
        }
        ctx.lineTo(w, h)
        ctx.closePath()
        const shade = lerpRgb(p.waterDeep, p.water, 1 - layer * 0.35)
        ctx.fillStyle = rgbCss(shade, 0.75)
        ctx.fill()

        // whitecaps ride the crests once the water gets rough
        if (p.severity > 0.55 && layer === 0) {
          ctx.strokeStyle = `rgba(230, 237, 242, ${(p.severity - 0.55) * 1.4})`
          ctx.lineWidth = 1.6
          for (let x = 0; x <= w; x += 7) {
            const y = waveY(x, t, waterline, p, 0)
            const yPrev = waveY(x - 7, t, waterline, p, 0)
            if (y < yPrev - 1.2) {
              ctx.beginPath()
              ctx.moveTo(x - 5, y + 1)
              ctx.lineTo(x, y)
              ctx.stroke()
            }
          }
        }
      }

      // rain — particle pool sized by density
      const targetDrops = reducedMotion.matches ? 0 : Math.round(p.rain * 130)
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
        const slant = 0.25 + p.severity * 0.35
        for (const d of drops) {
          ctx.beginPath()
          ctx.moveTo(d.x, d.y)
          ctx.lineTo(d.x - d.len * slant, d.y + d.len)
          ctx.stroke()
          d.y += (d.speed / 60) * (1 + p.severity)
          d.x -= (d.speed / 60) * slant * 0.6
          if (d.y > h) {
            d.y = -10
            d.x = Math.random() * (w + 60)
          }
        }
      }

      // lightning — storm only, never under reduced motion
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
            ctx.moveTo(bx, 0)
            ctx.lineTo(bx - 12, waterline * 0.4)
            ctx.lineTo(bx + 6, waterline * 0.55)
            ctx.lineTo(bx - 8, waterline * 0.95)
            ctx.stroke()
          }
          lightningFlash *= 0.86
        }
      }

      // avatars in fixed slots, bobbing on the shared severity
      const list = membersRef.current
      list.forEach((m, i) => {
        const x = (w * (i + 1)) / (list.length + 1)
        const bob = reducedMotion.matches
          ? 0
          : Math.sin(t * 0.002 * (1 + p.severity * 2) + i * 1.7) * (2 + p.severity * 9)
        const y = waveY(x, t, waterline, p, 0) + bob
        drawAvatar(ctx, m, x, y, t, i)
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

    const loop = (now: number) => {
      // Self-heal on zoom / monitor moves: dpr changes don't fire ResizeObserver.
      if ((window.devicePixelRatio || 1) !== dpr) size()
      draw(now)
      raf = requestAnimationFrame(loop)
    }

    size()
    const ro = new ResizeObserver(() => {
      size()
      if (reducedMotion.matches) drawStatic()
    })
    ro.observe(wrap)

    const startOrStop = () => {
      cancelAnimationFrame(raf)
      if (reducedMotion.matches) drawStatic()
      else raf = requestAnimationFrame(loop)
    }
    startOrStop()
    reducedMotion.addEventListener('change', startOrStop)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      reducedMotion.removeEventListener('change', startOrStop)
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

const FOAM = '#e6edf2'
const SUN = '#e8c87e'

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  m: RiverMember,
  x: number,
  y: number,
  t: number,
  i: number,
) {
  ctx.save()
  ctx.translate(x, y)

  switch (m.pose) {
    case 'underwater': {
      ctx.globalAlpha = 0.55
      head(ctx, 0, 9)
      ctx.globalAlpha = 0.8
      ctx.fillStyle = FOAM
      for (let b = 0; b < 3; b++) {
        const by = 4 - (((t * 0.04 + b * 14 + i * 5) % 26) + 0)
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
        ctx.strokeStyle = SUN
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(2, -34)
        ctx.lineTo(-3, -22)
        ctx.lineTo(3, -18)
        ctx.lineTo(-1, -11)
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(160, 165, 170, 0.5)'
      for (let s = 0; s < 2; s++) {
        const sy = -16 - (((t * 0.02 + s * 9 + i * 3) % 14) + 0)
        ctx.beginPath()
        ctx.arc(s * 4 - 2, sy, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    }
    case 'coconut': {
      // recliner
      ctx.strokeStyle = SUN
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(-12, 2)
      ctx.lineTo(-2, 2)
      ctx.lineTo(8, -8)
      ctx.stroke()
      head(ctx, 8, -13)
      // the drink
      ctx.fillStyle = SUN
      ctx.fillRect(-14, -8, 4, 6)
      ctx.strokeStyle = FOAM
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
      // floating
      head(ctx, 0, -8)
      arm(ctx, -4, -5, -10, -3)
      arm(ctx, 4, -5, 10, -3)
    }
  }

  // name tag
  ctx.globalAlpha = 1
  ctx.font = '11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillStyle = m.isMe ? SUN : 'rgba(230, 237, 242, 0.85)'
  ctx.fillText(m.displayName.slice(0, 12), 0, 22)

  ctx.restore()
}

function head(ctx: CanvasRenderingContext2D, x: number, y: number, color = FOAM) {
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
  ctx.strokeStyle = FOAM
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}