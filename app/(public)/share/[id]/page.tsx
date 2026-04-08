// app/(public)/share/[id]/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

const adminDb = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Props {
  params: Promise<{ id: string }>
}

export default async function SharePage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data: link } = await adminDb
    .from('share_links')
    .select('doc_id, permission')
    .eq('token', id)
    .single()

  if (!link) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0d1a', color: '#888', fontFamily: 'var(--font-sans), system-ui, sans-serif', fontSize: 13 }}>
        🔒 Invalid or expired link.
      </div>
    )
  }

  if (link.permission === 'edit') {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/login?next=/share/${id}`)

    await adminDb
      .from('document_members')
      .upsert(
        { document_id: link.doc_id, user_id: user.id, role: 'editor' },
        { onConflict: 'document_id,user_id', ignoreDuplicates: true }
      )

    redirect(`/doc/${link.doc_id}`)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d0d1a', color: '#888', fontFamily: 'var(--font-sans), system-ui, sans-serif', fontSize: 13 }}>
      🔒 This link is no longer valid.
    </div>
  )
}