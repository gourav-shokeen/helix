'use client'
// components/ui/ProfileDropdown.tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/store/authStore'
import { Avatar } from './Avatar'

export function ProfileDropdown() {
  const { user, clearUser } = useAuthStore()
  const [open, setOpen] = useState(false)
  const router = useRouter()

  if (!user) return null

  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    clearUser()
    router.push('/login')
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <Avatar name={user.name} avatarUrl={user.avatar_url} size={28} />
      </button>

      {open && (
        <div
          className="helix-fade-in"
          style={{
            position: 'absolute',
            top: '36px',
            right: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            width: '200px',
            zIndex: 200,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {user.name}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{user.email}</div>
          </div>
          <button
            onClick={signOut}
            style={{
              width: '100%',
              padding: '0.6rem 0.75rem',
              background: 'none',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              color: 'var(--red)',
              fontSize: '12px',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            ⎋ Sign out
          </button>
        </div>
      )}

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 199 }}
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  )
}
