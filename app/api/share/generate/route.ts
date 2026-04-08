// app/api/share/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { docId, permission } = body

    if (!docId || permission !== 'edit') {
      return NextResponse.json({ error: 'Only edit links are supported' }, { status: 400 })
    }

    await supabase.from('share_links').delete().eq('doc_id', docId).eq('permission', 'edit')

    const token = crypto.randomUUID()

    const { data, error } = await supabase
      .from('share_links')
      .insert({ doc_id: docId, permission: 'edit', created_by: user.id, token })
      .select()
      .single()

    if (error) {
      console.error('[share_links] Insert failed:', error)
      return NextResponse.json({ error: `Failed to create share link: ${error.message}` }, { status: 500 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return NextResponse.json({ success: true, link: data, shareUrl: `${baseUrl}/share/${token}` })
  } catch (err) {
    console.error('[API] /api/share/generate error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}