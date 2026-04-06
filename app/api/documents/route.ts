// app/api/documents/route.ts
// Server-side document CRUD — uses service role key to bypass RLS,
// since next-auth JWT sessions have no Supabase auth.uid() context.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

// GET /api/documents?type=document|journal
// Returns docs the user owns + docs they are a member of (shared with them).
export async function GET(request: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') ?? 'document'

    // Fetch owned docs
    const { data: ownedDocs, error: ownedError } = await supabaseAdmin
        .from('documents')
        .select('*')
        .eq('owner_id', userId)
        .eq('type', type)
        .order(type === 'journal' ? 'journal_date' : 'updated_at', { ascending: false })

    if (ownedError) {
        console.error('[api/documents GET] owned:', ownedError.message)
        return NextResponse.json({ error: ownedError.message }, { status: 500 })
    }

    // Fetch doc IDs where user is a member (but not the owner)
    const { data: memberRows, error: memberError } = await supabaseAdmin
        .from('document_members')
        .select('document_id')
        .eq('user_id', userId)

    if (memberError) {
        console.error('[api/documents GET] members:', memberError.message)
        // Non-fatal — return owned docs only
        return NextResponse.json({ documents: ownedDocs ?? [] })
    }

    const ownedIds = new Set((ownedDocs ?? []).map((d: any) => d.id))
    const memberDocIds = (memberRows ?? [])
        .map((r: any) => r.document_id)
        .filter((id: string) => !ownedIds.has(id))

    let sharedDocs: any[] = []
    if (memberDocIds.length > 0) {
        const { data: shared, error: sharedError } = await supabaseAdmin
            .from('documents')
            .select('*')
            .in('id', memberDocIds)
            .eq('type', type)
            .order(type === 'journal' ? 'journal_date' : 'updated_at', { ascending: false })

        if (sharedError) {
            console.error('[api/documents GET] shared:', sharedError.message)
        } else {
            sharedDocs = shared ?? []
        }
    }

    return NextResponse.json({ documents: [...(ownedDocs ?? []), ...sharedDocs] })
}

// POST /api/documents — create a new document
export async function POST(request: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ownerId = session.user.id
    const body = await request.json()
    const { title, type = 'document', journalDate } = body

    const docData: Record<string, unknown> = {
        title: title?.trim() || (type === 'journal' ? (journalDate ?? new Date().toISOString().split('T')[0]) : 'Untitled'),
        owner_id: ownerId,
        type,
        is_public: false,
    }
    if (journalDate) docData.journal_date = journalDate

    // Insert the document
    const { data: doc, error: docError } = await supabaseAdmin
        .from('documents')
        .insert(docData)
        .select()
        .single()

    if (docError || !doc) {
        console.error('[api/documents POST] insert doc:', docError?.message)
        return NextResponse.json({ error: docError?.message ?? 'Failed to create document' }, { status: 500 })
    }

    // Insert the owner membership row
    const { error: memberError } = await supabaseAdmin
        .from('document_members')
        .insert({ document_id: doc.id, user_id: ownerId, role: 'owner' })

    if (memberError) {
        console.error('[api/documents POST] insert member:', memberError.message)
        // Best-effort: delete the dangling doc if member insert fails
        await supabaseAdmin.from('documents').delete().eq('id', doc.id)
        return NextResponse.json({ error: memberError.message }, { status: 500 })
    }

    return NextResponse.json({ document: doc }, { status: 201 })
}

// PATCH /api/documents — update title
export async function PATCH(request: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, title } = body

    if (!id || !title?.trim()) {
        return NextResponse.json({ error: 'Missing id or title' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
        .from('documents')
        .update({ title: title.trim() })
        .eq('id', id)
        .eq('owner_id', session.user.id) // ownership check
        .select()
        .single()

    if (error) {
        console.error('[api/documents PATCH]', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ document: data })
}

// DELETE /api/documents?id=<uuid>
export async function DELETE(request: NextRequest) {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
        return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
        .from('documents')
        .delete()
        .eq('id', id)
        .eq('owner_id', session.user.id) // ownership check

    if (error) {
        console.error('[api/documents DELETE]', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
