// app/api/documents/[id]/route.ts
// GET /api/documents/[id] — fetch a single document by ID.
// Uses supabaseAdmin + next-auth session — works for both owners and
// shared members (who have no Supabase auth session).
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

    const { data, error } = await supabaseAdmin
        .from('documents')
        .select('*')
        .eq('id', params.id)
        .single()

    if (error || !data) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ document: data })
}
