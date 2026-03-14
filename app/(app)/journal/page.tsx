'use client'
// app/(app)/journal/page.tsx
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { getTodayJournal, getJournalEntries, createDocument } from '@/lib/supabase/documents'
import { TopBar } from '@/components/layout/TopBar'
import { getTodayDateKey } from '@/lib/utils'
import type { Document } from '@/types'

export default function JournalPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [entries, setEntries] = useState<Document[]>([])
  const [streak, setStreak] = useState(0)
  const [todayLoading, setTodayLoading] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  // Load the entry list — no auto-redirect here
  useEffect(() => {
    if (!user) return
    getJournalEntries(user.id).then(({ data }) => {
      const list = (data as Document[]) ?? []
      setEntries(list)
      let s = 0
      const today = getTodayDateKey()
      const dates = list.map((e) => e.journal_date ?? '').filter(Boolean).sort().reverse()
      for (let i = 0; i < dates.length; i++) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        if (dates[i] === d.toISOString().split('T')[0]) s++
        else break
      }
      setStreak(s)
    })
  }, [user])

  // Called only when user explicitly clicks "Open Today"
  const openToday = useCallback(async () => {
    if (!user) return
    setTodayLoading(true)
    const { data: today } = await getTodayJournal(user.id)
    if (today) {
      router.push(`/doc/${today.id}`)
      return
    }
    const { data: created } = await createDocument(user.id, 'journal', getTodayDateKey())
    if (created) {
      router.push(`/doc/${created.id}`)
      return
    }
    setTodayLoading(false)
  }, [user, router])

  if (loading || !user) return null

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <TopBar docTitle="Journal" onTitleChange={() => {}} showDoc />
      <main style={{ flex: 1, maxWidth: '600px', margin: '0 auto', padding: '2rem 1rem', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>◉ Dev Journal</h1>
          {streak > 0 && <span style={{ fontSize: '13px', color: 'var(--orange)' }}>🔥 {streak} day streak</span>}
          <span style={{ flex: 1 }} />
          <button
            onClick={openToday}
            disabled={todayLoading}
            style={{
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 6,
              color: 'var(--status-text)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              padding: '0.35rem 0.75rem',
              opacity: todayLoading ? 0.6 : 1,
            }}
          >
            {todayLoading ? 'Opening…' : "Today's Entry →"}
          </button>
        </div>
        {entries.map((entry) => (
          <div
            key={entry.id}
            onClick={() => router.push(`/doc/${entry.id}`)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '0.6rem 0.75rem',
              borderBottom: '1px solid var(--border)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{entry.journal_date}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{entry.title}</span>
          </div>
        ))}
      </main>
    </div>
  )
}