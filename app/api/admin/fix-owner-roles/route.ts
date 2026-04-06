// app/api/admin/fix-owner-roles/route.ts
// ONE-SHOT migration: fix document_members rows where the document owner
// has role 'editor' instead of 'owner'. Safe to call multiple times (idempotent).
// Remove this route after running it once in production.
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST() {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Find all documents where the owner_id user has a member row with role != 'owner'
    const { data: docs, error: docsError } = await supabaseAdmin
        .from('documents')
        .select('id, owner_id')

    if (docsError) {
        return NextResponse.json({ error: docsError.message }, { status: 500 })
    }

    let fixed = 0
    const errors: string[] = []

    for (const doc of docs ?? []) {
        // Check if the owner's member row has a wrong role
        const { data: member } = await supabaseAdmin
            .from('document_members')
            .select('role')
            .eq('document_id', doc.id)
            .eq('user_id', doc.owner_id)
            .single()

        if (!member) {
            // Missing member row — insert it
            const { error } = await supabaseAdmin
                .from('document_members')
                .insert({ document_id: doc.id, user_id: doc.owner_id, role: 'owner' })
            if (error) errors.push(`doc ${doc.id}: insert failed — ${error.message}`)
            else fixed++
        } else if (member.role !== 'owner') {
            // Wrong role — correct it
            const { error } = await supabaseAdmin
                .from('document_members')
                .update({ role: 'owner' })
                .eq('document_id', doc.id)
                .eq('user_id', doc.owner_id)
            if (error) errors.push(`doc ${doc.id}: update failed — ${error.message}`)
            else fixed++
        }
    }

    return NextResponse.json({
        message: `Fixed ${fixed} row(s)`,
        errors: errors.length ? errors : undefined,
        totalDocs: docs?.length ?? 0,
    })
}
