// app/api/share/generate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = session.user

    const body = await request.json()
    const { docId, permission } = body

    if (!docId || !permission || !['view', 'edit'].includes(permission)) {
      return NextResponse.json({ error: 'Invalid docId or permission' }, { status: 400 })
    }

    // Delete any existing link for this doc + permission pair
    const { error: deleteError } = await supabaseAdmin
      .from('share_links')
      .delete()
      .eq('doc_id', docId)
      .eq('permission', permission)

    if (deleteError) {
      console.error('[share_links] Delete existing link failed:', deleteError)
    }

    const token = crypto.randomUUID()

    const { data, error } = await supabaseAdmin
      .from('share_links')
      .insert({ doc_id: docId, permission, created_by: user.id, token })
      .select()
      .single()

    if (error) {
      console.error('[share_links] Insert failed:', error)
      return NextResponse.json({ error: `Failed to create share link: ${error.message}` }, { status: 500 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const shareUrl = `${baseUrl}/share/${token}`

    return NextResponse.json({ success: true, link: data, shareUrl })
  } catch (err) {
    console.error('[API] /api/share/generate error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}