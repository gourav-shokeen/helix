// hooks/useTypewriter.ts
import { useEffect, useRef, useState } from 'react'

/**
 * useTypewriter(text, charDuration, loopEvery)
 * - charDuration: total ms to type the full word (e.g. 1000 for "helix")
 * - loopEvery: ms to wait after finishing before clearing + retyping
 * - The cursor should always be visible; callers render it unconditionally.
 * - Returns { displayText }
 */
export function useTypewriter(
  text: string,
  charDuration: number,
  loopEvery: number
): { displayText: string } {
  const [displayText, setDisplayText] = useState('')
  const indexRef = useRef(0)
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const charDelay = charDuration / text.length

  const startTyping = () => {
    indexRef.current = 0
    setDisplayText('')

    typeTimerRef.current = setInterval(() => {
      indexRef.current += 1
      setDisplayText(text.slice(0, indexRef.current))

      if (indexRef.current >= text.length) {
        clearInterval(typeTimerRef.current!)

        // Wait loopEvery ms, then clear and retype
        loopTimerRef.current = setTimeout(startTyping, loopEvery)
      }
    }, charDelay)
  }

  useEffect(() => {
    startTyping()
    return () => {
      if (typeTimerRef.current) clearInterval(typeTimerRef.current)
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { displayText }
}
