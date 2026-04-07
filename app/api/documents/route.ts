// app/api/documents/route.ts
// Server-side document CRUD — uses Supabase SSR client with cookie-based auth.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/documents?type=document|journal
// Returns docs the user owns + docs they are a member of (shared with them).
export async function GET(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = user.id
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') ?? 'document'

    // Fetch owned docs
    const { data: ownedDocs, error: ownedError } = await supabase
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
    const { data: memberRows, error: memberError } = await supabase
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
        const { data: shared, error: sharedError } = await supabase
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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ownerId = user.id
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
    const { data: doc, error: docError } = await supabase
        .from('documents')
        .insert(docData)
        .select()
        .single()

    if (docError || !doc) {
        console.error('[api/documents POST] insert doc:', docError?.message)
        return NextResponse.json({ error: docError?.message ?? 'Failed to create document' }, { status: 500 })
    }

    // Upsert the owner membership row.
    // The DB trigger (trg_ensure_owner_membership) may have already inserted
    // this row — using upsert ensures we don't get a duplicate-key error.
    const { error: memberError } = await supabase
        .from('document_members')
        .upsert(
            { document_id: doc.id, user_id: ownerId, role: 'owner' },
            { onConflict: 'document_id,user_id' }
        )

    if (memberError) {
        console.error('[api/documents POST] upsert member:', memberError.message)
        // Best-effort: delete the dangling doc if member upsert fails
        await supabase.from('documents').delete().eq('id', doc.id)
        return NextResponse.json({ error: memberError.message }, { status: 500 })
    }

    return NextResponse.json({ document: doc }, { status: 201 })
}

// PATCH /api/documents — update title and/or is_public
// title: any member with owner OR editor role may update
// is_public: only the document owner may toggle
export async function PATCH(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, title, is_public } = body

    if (!id) {
        return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    // Resolve the caller's role for this document
    const { data: membership } = await supabase
        .from('document_members')
        .select('role')
        .eq('document_id', id)
        .eq('user_id', user.id)
        .single()

    const role = membership?.role ?? null
    if (!role) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Build update payload — owners can change anything, editors can only rename
    const updates: Record<string, unknown> = {}
    if (title !== undefined) {
        if (role !== 'owner' && role !== 'editor') {
            return NextResponse.json({ error: 'Forbidden: only owner or editor can rename' }, { status: 403 })
        }
        updates.title = title.trim()
    }
    if (is_public !== undefined) {
        if (role !== 'owner') {
            return NextResponse.json({ error: 'Forbidden: only owner can change visibility' }, { status: 403 })
        }
        updates.is_public = Boolean(is_public)
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
        .from('documents')
        .update(updates)
        .eq('id', id)
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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
        return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', id)
        .eq('owner_id', user.id) // ownership check

    if (error) {
        console.error('[api/documents DELETE]', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
