import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'

// A scallop pattern with a 30-unit period; translating by -60 loops seamlessly.
function wave(y: number, amp: number): string {
  let d = `M -60 ${y}`
  for (let x = -60; x < 480; x += 30) d += ` q 15 ${-amp} 30 0`
  return `${d} L 480 140 L -60 140 Z`
}

/**
 * The login card's header: a still river at dusk, gently alive. GSAP drives a
 * floating sun, drifting cloud, and three wave layers at different speeds;
 * all of it sits out under prefers-reduced-motion.
 */
export default function LoginHorizon() {
  const ref = useRef<SVGSVGElement>(null)

  useLayoutEffect(() => {
    const svg = ref.current
    if (!svg) return
    const mm = gsap.matchMedia(svg)
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.to('.lh-sun', { y: -4, duration: 4, yoyo: true, repeat: -1, ease: 'sine.inOut' })
      gsap.to('.lh-cloud', { x: 36, duration: 26, yoyo: true, repeat: -1, ease: 'sine.inOut' })
      gsap.to('.lh-wave-1', { x: -60, duration: 11, repeat: -1, ease: 'none' })
      gsap.to('.lh-wave-2', { x: -60, duration: 8, repeat: -1, ease: 'none' })
      gsap.to('.lh-wave-3', { x: -60, duration: 6, repeat: -1, ease: 'none' })
    })
    return () => mm.revert()
  }, [])

  return (
    <svg
      ref={ref}
      className="login-horizon"
      viewBox="0 0 400 120"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="lh-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6ea9d2" />
          <stop offset="1" stopColor="#dcedf5" />
        </linearGradient>
        <linearGradient id="lh-water" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4f8aa3" />
          <stop offset="1" stopColor="#2f5f78" />
        </linearGradient>
      </defs>
      <rect width="400" height="120" fill="url(#lh-sky)" />
      <circle className="lh-sun" cx="300" cy="34" r="11" fill="#e8c87e" opacity="0.95" />
      <g className="lh-cloud" fill="#f3f6f8" opacity="0.8">
        <ellipse cx="110" cy="30" rx="22" ry="8" />
        <ellipse cx="128" cy="33" rx="15" ry="6" />
        <ellipse cx="94" cy="34" rx="14" ry="6" />
      </g>
      <path d="M -10 70 Q 60 46 130 64 T 260 60 T 410 66 L 410 90 L -10 90 Z" fill="#6f9282" opacity="0.75" />
      <path d="M -10 76 Q 80 60 170 74 T 330 72 T 410 78 L 410 95 L -10 95 Z" fill="#5e7c6b" />
      <rect y="78" width="400" height="42" fill="url(#lh-water)" />
      <path className="lh-wave-1" d={wave(86, 3)} fill="#5f97ae" opacity="0.55" />
      <path className="lh-wave-2" d={wave(96, 4)} fill="#3f7590" opacity="0.6" />
      <path className="lh-wave-3" d={wave(108, 4)} fill="#2f5f78" opacity="0.75" />
    </svg>
  )
}
