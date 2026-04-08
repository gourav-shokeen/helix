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

-- ── 2. Fix document_members_select ──────────────────────────────────────────
-- Keep simple — only select your own row. This avoids circular RLS:
-- documents_select references document_members,
-- so document_members_select CANNOT reference documents (infinite recursion).
-- Owners always have a row in document_members (inserted by createDocument),
-- so user_id = auth.uid() correctly covers both owners and editors/viewers.

DROP POLICY IF EXISTS "document_members_select" ON public.document_members;

CREATE POLICY "document_members_select" ON public.document_members
  FOR SELECT USING (user_id = auth.uid());

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

-- ── 4. Allow share-link viewers to read project_boards (Kanban) ─────────────
-- The existing "project_boards_auth" policy requires auth.uid() IS NOT NULL,
-- which blocks unauthenticated share-link viewers from loading kanban data.
-- Kanban board nodes are synced via Yjs (WS) so the node renders, but the
-- card data comes from a separate Supabase SELECT keyed by board uuid.
-- We replace the blanket policy with two scoped ones:
--   1. authenticated users  → full read/write (same as before)
--   2. share-link viewers   → SELECT only if the document has a valid share link

DROP POLICY IF EXISTS "project_boards_auth"        ON public.project_boards;
DROP POLICY IF EXISTS "project_boards_auth_rw"     ON public.project_boards;
DROP POLICY IF EXISTS "project_boards_share_read"  ON public.project_boards;

-- Authenticated users retain full access
CREATE POLICY "project_boards_auth_rw" ON public.project_boards
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Anon share-link viewers can read a board if its parent doc has a live share link
-- Anon share-link viewers can read a board if its parent doc has a live share link
CREATE POLICY "project_boards_share_read" ON public.project_boards
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.share_links sl
      WHERE sl.doc_id::text = project_id::text
    )
  );

-- ── 5. Enable Realtime for Kanban Boards ────────────────────────────────────
-- project_boards needs to be added to the supabase_realtime publication
-- otherwise the Kanban board subscription will never receive any postgres_changes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'project_boards'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.project_boards;';
  END IF;
END $$;
