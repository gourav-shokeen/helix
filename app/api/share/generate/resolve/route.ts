// app/api/share/resolve/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: link, error } = await supabase
      .from('share_links')
      .select('doc_id, permission')
      .eq('token', token)
      .single()

    if (error || !link) {
      return NextResponse.json({ error: 'Invalid or expired share link' }, { status: 404 })
    }

    const { data: doc, error: docError } = await supabase
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