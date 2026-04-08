// lib/supabase/documents.ts
import { createClient } from './client'
import type { Document } from '@/types'

export async function createDocument(
    ownerId: string,
    type: 'document' | 'journal' = 'document',
    journalDate?: string
) {
    const supabase = createClient()

    const docData: Partial<Document> & { owner_id: string } = {
        title: type === 'journal' ? (journalDate ?? new Date().toISOString().split('T')[0]) : 'Untitled',
        owner_id: ownerId,
        type,
        is_public: false,
    }
    if (journalDate) docData.journal_date = journalDate

    const { data: doc, error: docError } = await supabase
        .from('documents')
        .insert(docData)
        .select()
        .single()

    if (docError || !doc) return { data: null, error: docError }

    // Insert owner member row
    const { error: memberError } = await supabase
        .from('document_members')
        .insert({ document_id: doc.id, user_id: ownerId, role: 'owner' })

    if (memberError) return { data: null, error: memberError }

    return { data: doc, error: null }
}

export async function getMyDocuments(userId: string) {
    const supabase = createClient()
    // Query via document_members so we get both owned docs AND docs the user
    // has been added to as an editor/viewer via a share link.
    // The owner always has a row in document_members (inserted on createDocument),
    // so this returns everything the user should see in their sidebar.
    return supabase
        .from('documents')
        .select('*, document_members!inner(user_id, role)')
        .eq('document_members.user_id', userId)
        .eq('type', 'document')
        .order('updated_at', { ascending: false })
}

export async function updateDocumentTitle(id: string, title: string) {
    const supabase = createClient()
    return supabase.from('documents').update({ title }).eq('id', id).select().single()
}

export async function deleteDocument(id: string) {
    const supabase = createClient()
    return supabase.from('documents').delete().eq('id', id)
}
