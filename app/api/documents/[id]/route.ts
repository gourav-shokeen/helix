// app/api/documents/[id]/route.ts
// GET /api/documents/[id] — fetch a single document by ID.
// Requires the caller to be a member of the document (any role).
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

export async function GET(
    _req: Request,
    { params }: { params: { id: string } }
) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Membership check — user must have at least one row in document_members ──
    const { data: membership, error: memberError } = await supabaseAdmin
        .from('document_members')
        .select('role')
        .eq('document_id', params.id)
        .eq('user_id', session.user.id)
        .single()

    if (memberError || !membership) {
        // No membership row → user has no right to view this document
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // ── Fetch the document ─────────────────────────────────────────────────────
    const { data: document, error: docError } = await supabaseAdmin
        .from('documents')
        .select('*')
        .eq('id', params.id)
        .single()

    if (docError || !document) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Return document + the caller's role so the client can gate read-only access
    return NextResponse.json({ document, role: membership.role })
}
