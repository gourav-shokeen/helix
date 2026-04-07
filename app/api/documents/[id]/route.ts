// app/api/documents/[id]/route.ts
// Server-side fetch for a single document — uses cookie-based SSR auth so
// the RLS member check (document_members) works reliably for collaborators.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const supabase = await createClient()

  // Verify the caller is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS policy allows SELECT for owner, member, or if is_public
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('[api/documents/[id]] fetch error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  return NextResponse.json({ document: data })
}
