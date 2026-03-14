// store/focusStore.ts
import { create } from 'zustand'

interface FocusState {
    isFocused: boolean
    toggle: () => void
}

export const useFocusStore = create<FocusState>((set, get) => ({
    isFocused: false,
    toggle: () => set({ isFocused: !get().isFocused }),
}))
