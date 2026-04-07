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

export async function getJournalEntries(userId: string) {
    const supabase = createClient()
    return supabase
        .from('documents')
        .select('*')
        .eq('owner_id', userId)
        .eq('type', 'journal')
        .order('journal_date', { ascending: false })
}

export async function getTodayJournal(userId: string) {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    return supabase
        .from('documents')
        .select('*')
        .eq('owner_id', userId)
        .eq('type', 'journal')
        .eq('journal_date', today)
        .maybeSingle()
}

export async function getDocument(id: string) {
    const supabase = createClient()
    return supabase.from('documents').select('*').eq('id', id).single()
}

export async function updateDocumentTitle(id: string, title: string) {
    const supabase = createClient()
    return supabase.from('documents').update({ title }).eq('id', id).select().single()
}

export async function getDocumentUpdates(documentId: string) {
    const supabase = createClient()
    return supabase
        .from('document_updates')
        .select('update_data, created_at')
        .eq('document_id', documentId)
        .order('created_at', { ascending: true })
}

export async function makeDocumentPublic(id: string, isPublic: boolean) {
    const supabase = createClient()
    return supabase
        .from('documents')
        .update({ is_public: isPublic })
        .eq('id', id)
        .select()
        .single()
}

export async function deleteDocument(id: string) {
    const supabase = createClient()
    return supabase.from('documents').delete().eq('id', id)
}

// ── Share links ───────────────────────────────────────────────

export interface ShareLink {
  id: string
  doc_id: string
  token: string
  permission: 'view' | 'edit'
  created_by: string
  expires_at: string | null
  created_at: string
}

/** Create or replace a share link for `docId` with the given permission. */
export async function createShareLink(
  docId: string,
  permission: 'view' | 'edit',
  createdBy: string
): Promise<ShareLink | null> {
  const supabase = createClient()
  try {
    // Delete any existing link for this doc + permission pair to keep things clean
    await supabase
      .from('share_links')
      .delete()
      .eq('doc_id', docId)
      .eq('permission', permission)

    const { data, error } = await supabase
      .from('share_links')
      .insert({ doc_id: docId, permission, created_by: createdBy })
      .select()
      .single()
    if (error) throw error
    return data as ShareLink
  } catch (err) {
    console.error('[share_links] createShareLink failed:', err)
    return null
  }
}

/** Fetch an active share link by token (for server-side use — imports server client separately). */
export async function getShareLinkByToken(token: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('share_links')
    .select('*, documents!inner(*)')
    .eq('token', token)
    .maybeSingle()
  return { data, error }
}

