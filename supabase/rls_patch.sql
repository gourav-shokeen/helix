-- ============================================================
-- Helix — RLS Policy Patch
-- Run this in the Supabase SQL editor to fix:
--   1. Collaborators being blocked from inserting their own membership row
--   2. Collaborators (editors) being able to update document titles
--   3. document_members_select: owners need to see all members of their docs
-- ============================================================

-- ── 1. Fix document_members_insert ──────────────────────────────────────────
-- Old policy: only doc OWNER can insert member rows.
-- This blocked collaborators from self-inserting via share links.
-- We use adminDb (service role) in the share page to bypass this,
-- but adding this policy as a safety net is still useful.

DROP POLICY IF EXISTS "document_members_insert" ON public.document_members;

CREATE POLICY "document_members_insert" ON public.document_members
  FOR INSERT WITH CHECK (
    -- Doc owner can add anyone
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND d.owner_id = auth.uid()
    )
    OR
    -- A user can insert their OWN membership if a valid edit share link exists for this doc
    (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.share_links sl
        WHERE sl.doc_id = document_id
          AND sl.permission = 'edit'
      )
    )
  );

-- ── 2. Fix document_members_select — owners must see all member rows ─────────
-- Old policy: you can only see your own row.
-- This means the inner join in getMyDocuments is fine for a member,
-- but we also want owners to be able to see who has access to their docs.

DROP POLICY IF EXISTS "document_members_select" ON public.document_members;

CREATE POLICY "document_members_select" ON public.document_members
  FOR SELECT USING (
    -- You can always see your own membership row
    user_id = auth.uid()
    OR
    -- Doc owner can see all members of their documents
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND d.owner_id = auth.uid()
    )
  );

-- ── 3. Fix documents_update — allow editors to update title ─────────────────
-- Old policy: only owner can update.
-- Editors (collaborators with edit permission) should be able to update title.

DROP POLICY IF EXISTS "documents_update" ON public.documents;

CREATE POLICY "documents_update" ON public.documents
  FOR UPDATE USING (
    -- Owner can update anything
    owner_id = auth.uid()
    OR
    -- Editors can update (title, updated_at, etc.)
    EXISTS (
      SELECT 1 FROM public.document_members dm
      WHERE dm.document_id = id
        AND dm.user_id = auth.uid()
        AND dm.role IN ('owner', 'editor')
    )
  );
