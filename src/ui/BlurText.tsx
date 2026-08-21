import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'

/** Word-by-word blur-in (after React Bits' BlurText). Honors reduced motion. */
export default function BlurText({
  text,
  className,
  delay = 0,
}: {
  text: string
  className?: string
  delay?: number
}) {
  const ref = useRef<HTMLParagraphElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.word',
        { filter: 'blur(8px)', opacity: 0, y: 6 },
        { filter: 'blur(0px)', opacity: 1, y: 0, duration: 0.7, stagger: 0.08, delay, ease: 'power2.out' },
      )
    }, el)
    return () => ctx.revert()
  }, [text, delay])

  return (
    <p ref={ref} className={className} aria-label={text}>
      {text.split(' ').map((word, i) => (
        <span key={`${word}-${i}`} className="word" aria-hidden="true" style={{ display: 'inline-block' }}>
          {word}
          {' '}
        </span>
      ))}
    </p>
  )
}
