// app/api/share/resolve/route.ts
// No auth required — public endpoint for resolving share tokens.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const { data: link, error } = await supabaseAdmin
      .from('share_links')
      .select('doc_id, permission')
      .eq('token', token)
      .single()

    if (error || !link) {
      return NextResponse.json({ error: 'Invalid or expired share link' }, { status: 404 })
    }

    const { data: doc, error: docError } = await supabaseAdmin
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