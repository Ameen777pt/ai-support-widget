-- ==============================================================================
-- Migration: 20260823000000_knowledge_database_foundation.sql
-- Description: Step 5.6 Knowledge Database Foundation
-- 1. Add content TEXT NOT NULL column to public.documents safely
-- 2. Refine INSERT and UPDATE RLS policies on public.documents to owner and admin roles
-- ==============================================================================

-- 1. Safely add content column to public.documents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'documents' 
      AND column_name = 'content'
  ) THEN
    ALTER TABLE public.documents ADD COLUMN content TEXT NOT NULL DEFAULT '';
    ALTER TABLE public.documents ALTER COLUMN content DROP DEFAULT;
  END IF;
END $$;

-- 2. Refine RLS Policies on public.documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Drop previous broader member creation and update policies if they exist
DROP POLICY IF EXISTS "Members can create workspace documents" ON public.documents;
DROP POLICY IF EXISTS "Members can update workspace documents" ON public.documents;

-- Create strict owner/admin creation and update policies
CREATE POLICY "Admins and owners can create workspace documents"
  ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']::public.workspace_role[]));

CREATE POLICY "Admins and owners can update workspace documents"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']::public.workspace_role[]));
