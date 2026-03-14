'use client'
// hooks/usePomodoro.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { POMODORO } from '@/lib/constants'
import { playChime } from '@/lib/utils'
import type { PomodoroState } from '@/types'

interface PomodoroReturn {
    state: PomodoroState
    timeDisplay: string
    cycle: number
    start: () => void
    stop: () => void
}

function pad(n: number) {
    return String(n).padStart(2, '0')
}

export function usePomodoro(): PomodoroReturn {
    const [state, setState] = useState<PomodoroState>('idle')
    const [seconds, setSeconds] = useState(POMODORO.WORK_MINUTES * 60)
    const [cycle, setCycle] = useState(0)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const getDuration = useCallback((s: PomodoroState) => {
        if (s === 'working') return POMODORO.WORK_MINUTES * 60
        if (s === 'longBreak') return POMODORO.LONG_BREAK_MINUTES * 60
        return POMODORO.BREAK_MINUTES * 60
    }, [])

    const advance = useCallback((currentCycle: number) => {
        const nextCycle = currentCycle + 1
        setCycle(nextCycle)
        if (nextCycle % POMODORO.CYCLES_BEFORE_LONG === 0) {
            setState('longBreak')
            setSeconds(POMODORO.LONG_BREAK_MINUTES * 60)
        } else {
            setState('break')
            setSeconds(POMODORO.BREAK_MINUTES * 60)
        }
        playChime(528, 200, 0.15)
    }, [])

    useEffect(() => {
        if (state === 'idle') return

        timerRef.current = setInterval(() => {
            setSeconds((prev) => {
                if (prev <= 1) {
                    if (state === 'working') {
                        advance(cycle)
                    } else {
                        // break ended → back to working
                        setState('working')
                        return POMODORO.WORK_MINUTES * 60
                    }
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
        }
    }, [state, cycle, advance])

    const start = useCallback(() => {
        setState('working')
        setCycle(0)
        setSeconds(getDuration('working'))
    }, [getDuration])

    const stop = useCallback(() => {
        setState('idle')
        if (timerRef.current) clearInterval(timerRef.current)
        setSeconds(POMODORO.WORK_MINUTES * 60)
    }, [])

    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    const timeDisplay = `${pad(mins)}:${pad(secs)}`

    return { state, timeDisplay, cycle, start, stop }
}
