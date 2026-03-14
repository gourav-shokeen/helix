// store/themeStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Theme } from '@/types'

interface ThemeState {
    theme: Theme
    toggleTheme: () => void
    setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            theme: 'dark',
            toggleTheme: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
            setTheme: (theme) => set({ theme }),
        }),
        {
            name: 'helix-theme',
            partialize: (state) => ({ theme: state.theme }),
        }
    )
)
