'use client'
// components/ui/Avatar.tsx
import { getInitials } from '@/lib/utils'

interface AvatarProps {
  name: string
  avatarUrl?: string
  color?: string
  size?: number
}

export function Avatar({ name, avatarUrl, color = 'var(--accent)', size = 28 }: AvatarProps) {
  return (
    <div
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        border: `2px solid ${color}`,
        flexShrink: 0,
        background: avatarUrl ? 'transparent' : color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.35,
        fontWeight: 700,
        color: '#001a13',
      }}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        getInitials(name)
      )}
    </div>
  )
}
