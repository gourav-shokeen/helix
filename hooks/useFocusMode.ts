'use client'
// hooks/useFocusMode.ts
import { useFocusStore } from '@/store/focusStore'

export function useFocusMode() {
    const { isFocused, toggle } = useFocusStore()
    return { isFocused, toggle }
}
