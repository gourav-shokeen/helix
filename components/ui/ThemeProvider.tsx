'use client'
// components/ui/ThemeProvider.tsx
import { useEffect } from 'react'
import { useThemeStore } from '@/store/themeStore'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore(state => state.theme)
  const toggleTheme = useThemeStore(state => state.toggleTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    const initMermaid = async () => {
      const mermaid = (await import('mermaid')).default
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          primaryColor: '#00d4a1',
          primaryTextColor: '#e8e8ec',
          primaryBorderColor: '#00d4a1',
          lineColor: '#55556a',
          secondaryColor: '#1a1a2e',
          tertiaryColor: '#0d0d1a'
        }
      })
    }
    initMermaid()
  }, [])

  // ⌘⇧L shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'L') {
        e.preventDefault()
        toggleTheme()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleTheme])

  return <>{children}</>
}