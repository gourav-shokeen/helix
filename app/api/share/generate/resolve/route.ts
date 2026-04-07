export const dynamic = 'force-dynamic'
// app/api/share/generate/resolve/route.ts
// Uses the service-role admin client to bypass RLS — unauthenticated share viewers
// have no session, so the normal SSR client is blocked from reading share_links / documents.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'

// Service-role client — bypasses RLS for read-only token resolution.
const adminDb = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const { data: link, error } = await adminDb
      .from('share_links')
      .select('doc_id, permission')
      .eq('token', token)
      .single()

    if (error || !link) {
      return NextResponse.json({ error: 'Invalid or expired share link' }, { status: 404 })
    }

    const { data: doc, error: docError } = await adminDb
      .from('documents')
      .select('id, title')
      .eq('id', link.doc_id)
      .single()

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    return NextResponse.json({
      docId: link.doc_id,
      permission: link.permission,
      title: doc.title,
    })
  } catch (err) {
    console.error('[API] /api/share/resolve error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}