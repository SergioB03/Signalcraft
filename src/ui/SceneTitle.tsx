import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'

/**
 * Split-text reveal for the scene name (after React Bits' SplitText, trimmed
 * to what we need): each character rises in when the text changes, so a
 * weather shift reads as an event, not a re-render. Reduced motion: no
 * animation — the new word simply appears.
 */
export default function SceneTitle({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.char',
        { yPercent: 60, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: 0.55, stagger: 0.035, ease: 'power3.out' },
      )
    }, el)
    return () => ctx.revert()
  }, [text])

  return (
    <h1 ref={ref} className={className} aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <span
          key={`${text}-${i}`}
          className="char"
          aria-hidden="true"
          style={{ display: 'inline-block', whiteSpace: 'pre' }}
        >
          {ch}
        </span>
      ))}
    </h1>
  )
}
