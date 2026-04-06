-- ============================================================
-- Migration: fix_owner_roles.sql
-- Run ONCE in Supabase Dashboard → SQL Editor
-- ============================================================
-- 
-- Step 1: Fix existing rows where the document owner has the
--         wrong role (e.g., 'editor' instead of 'owner').
-- ============================================================
UPDATE document_members dm
SET    role = 'owner'
FROM   documents d
WHERE  dm.document_id = d.id
  AND  dm.user_id     = d.owner_id
  AND  dm.role        != 'owner';

-- ============================================================
-- Step 2: Insert missing owner rows for any document that
--         has no member row at all for its owner_id.
-- ============================================================
INSERT INTO document_members (document_id, user_id, role)
SELECT d.id, d.owner_id, 'owner'
FROM   documents d
WHERE  NOT EXISTS (
    SELECT 1
    FROM   document_members dm
    WHERE  dm.document_id = d.id
      AND  dm.user_id     = d.owner_id
);

-- ============================================================
-- Step 3: Add a trigger so this can NEVER drift again.
--         Every time a document is inserted, the trigger
--         automatically ensures the owner has role = 'owner'.
-- ============================================================

-- The trigger function
CREATE OR REPLACE FUNCTION ensure_owner_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO document_members (document_id, user_id, role)
    VALUES (NEW.id, NEW.owner_id, 'owner')
    ON CONFLICT (document_id, user_id)
    DO UPDATE SET role = 'owner'
    WHERE document_members.role != 'owner';

    RETURN NEW;
END;
$$;

-- Attach it to the documents table (fires after every INSERT)
DROP TRIGGER IF EXISTS trg_ensure_owner_membership ON documents;

CREATE TRIGGER trg_ensure_owner_membership
AFTER INSERT ON documents
FOR EACH ROW
EXECUTE FUNCTION ensure_owner_membership();
