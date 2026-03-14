-- ============================================================
-- Helix — Supabase Schema
-- Run this in the Supabase SQL editor
-- ============================================================

-- Block 1: Core tables

CREATE TABLE IF NOT EXISTS public.users (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text NOT NULL,
  name        text NOT NULL DEFAULT '',
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL DEFAULT 'Untitled',
  owner_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  is_public    boolean NOT NULL DEFAULT false,
  type         text NOT NULL DEFAULT 'document' CHECK (type IN ('document', 'journal')),
  journal_date text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.document_members (
  document_id  uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  PRIMARY KEY (document_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.document_updates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  update_data  bytea NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Block 2: RLS Policies
-- ============================================================

ALTER TABLE public.users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_updates ENABLE ROW LEVEL SECURITY;

-- users: only see/edit your own profile
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- Allow users to insert their own profile row (needed for client-side upsert fallback)
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- documents: select if owner OR member OR is_public
CREATE POLICY "documents_select" ON public.documents
  FOR SELECT USING (
    owner_id = auth.uid()
    OR is_public = true
    OR EXISTS (
      SELECT 1 FROM public.document_members dm
      WHERE dm.document_id = id AND dm.user_id = auth.uid()
    )
  );

CREATE POLICY "documents_insert" ON public.documents
  FOR INSERT WITH CHECK (owner_id = auth.uid());

CREATE POLICY "documents_update" ON public.documents
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "documents_delete" ON public.documents
  FOR DELETE USING (owner_id = auth.uid());

-- document_members: select if member; insert if doc owner
CREATE POLICY "document_members_select" ON public.document_members
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "document_members_insert" ON public.document_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND d.owner_id = auth.uid()
    )
  );

-- document_updates: select/insert if member
CREATE POLICY "document_updates_select" ON public.document_updates
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.document_members dm
      WHERE dm.document_id = document_id AND dm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND d.is_public = true
    )
  );

CREATE POLICY "document_updates_insert" ON public.document_updates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.document_members dm
      WHERE dm.document_id = document_id AND dm.user_id = auth.uid()
    )
  );

-- ============================================================
-- Block 3: Project Plan Room tables (Feature 2)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.project_boards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL UNIQUE REFERENCES public.documents(id) ON DELETE CASCADE,
  data        jsonb NOT NULL DEFAULT '{"columns":{"idea":[],"building":[],"testing":[],"done":[]}}',
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sprints (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL,
  name        text NOT NULL,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.decisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meeting_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL,
  content     text NOT NULL,
  sprint_id   uuid REFERENCES public.sprints(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sprints         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decisions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_notes   ENABLE ROW LEVEL SECURITY;

-- Permissive (auth required) — tighten per your project ACL needs
CREATE POLICY "project_boards_auth" ON public.project_boards USING (auth.uid() IS NOT NULL);
CREATE POLICY "sprints_auth"        ON public.sprints         USING (auth.uid() IS NOT NULL);
CREATE POLICY "decisions_auth"      ON public.decisions       USING (auth.uid() IS NOT NULL);
CREATE POLICY "meeting_notes_auth"  ON public.meeting_notes   USING (auth.uid() IS NOT NULL);

-- ============================================================
-- Block 4: Discussion Threads tables (Feature 4)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.threads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id       uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  anchor_text  text NOT NULL,
  resolved     boolean NOT NULL DEFAULT false,
  created_by   uuid NOT NULL REFERENCES public.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  body        text NOT NULL,
  author_id   uuid NOT NULL REFERENCES public.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Simplified policies as per PROMPT 1
CREATE POLICY "doc members can access threads" ON public.threads FOR ALL USING (true);
CREATE POLICY "doc members can access comments" ON public.comments FOR ALL USING (true);

-- ============================================================
-- Block 5b: Dev Logs (Feature 5)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.dev_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  date        date NOT NULL,
  content     text NOT NULL DEFAULT '',
  project_id  uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  mood        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

ALTER TABLE public.dev_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_logs_select" ON public.dev_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "dev_logs_upsert" ON public.dev_logs FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "dev_logs_update" ON public.dev_logs FOR UPDATE USING (user_id = auth.uid());

-- ============================================================
-- Block 6: Share links (Feature 6)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.share_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id      uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  token       uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  permission  text NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
  created_by  uuid NOT NULL REFERENCES public.users(id),
  expires_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner can manage" ON public.share_links FOR ALL USING (created_by = auth.uid());
CREATE POLICY "anyone can read by token" ON public.share_links FOR SELECT USING (true);
CREATE POLICY "allow insert for authenticated users" ON public.share_links 
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Allow anonymous insert to document_updates when a valid edit share_link exists
CREATE POLICY "document_updates_insert_via_share" ON public.document_updates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.share_links sl
      WHERE sl.doc_id = document_id
        AND sl.permission = 'edit'
        AND (sl.expires_at IS NULL OR sl.expires_at > now())
    )
  );

-- ============================================================
-- Block 7: GitHub Integration (Prompt 11)
-- ============================================================

-- GitHub PAT connections per user
CREATE TABLE IF NOT EXISTS public.github_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token           text NOT NULL,            -- GitHub PAT (encrypted at rest by Supabase)
  github_username text NOT NULL DEFAULT '',
  connected_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "github_connections_own" ON public.github_connections
  FOR ALL USING (user_id = auth.uid());

-- Add linked GitHub repo field to documents
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS github_repo text;
