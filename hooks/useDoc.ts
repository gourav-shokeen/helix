'use client'
// hooks/useDoc.ts
import { useCallback, useState } from 'react'
import { updateDocumentTitle } from '@/lib/supabase/documents'
import type { Document } from '@/types'

export function useDoc(initialDoc: Document | null) {
    const [doc, setDoc] = useState<Document | null>(initialDoc)
    const [saving, setSaving] = useState(false)

    const saveTitle = useCallback(
        async (title: string) => {
            if (!doc) return
            setSaving(true)
            const { data } = await updateDocumentTitle(doc.id, title)
            if (data) setDoc(data as Document)
            setSaving(false)
        },
        [doc]
    )

    return { doc, setDoc, saving, saveTitle }
}
