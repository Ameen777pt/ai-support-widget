-- ==============================================================================
-- Migration: 20260828010000_unanswered_questions.sql
-- Description: Step 6.3-A - Unanswered Questions & Knowledge Gaps Database Foundation
-- ==============================================================================

-- 1. Create Enum for Unanswered Question Status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'unanswered_question_status') THEN
    CREATE TYPE public.unanswered_question_status AS ENUM ('open', 'resolved', 'ignored');
  END IF;
END $$;

-- 2. Create public.unanswered_questions Table
CREATE TABLE IF NOT EXISTS public.unanswered_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  sample_conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  status public.unanswered_question_status NOT NULL DEFAULT 'open',
  resolved_by_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_unanswered_questions_workspace_normalized UNIQUE (workspace_id, normalized_query)
);

-- 3. Create Indexes
CREATE INDEX IF NOT EXISTS idx_unanswered_questions_workspace_id 
  ON public.unanswered_questions(workspace_id);

CREATE INDEX IF NOT EXISTS idx_unanswered_questions_workspace_status 
  ON public.unanswered_questions(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_unanswered_questions_workspace_last_seen 
  ON public.unanswered_questions(workspace_id, last_seen_at DESC);

-- 4. Create Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_unanswered_questions_updated_at ON public.unanswered_questions;
CREATE TRIGGER trigger_unanswered_questions_updated_at
  BEFORE UPDATE ON public.unanswered_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.unanswered_questions ENABLE ROW LEVEL SECURITY;

-- 6. Authenticated Member RLS Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'unanswered_questions' 
      AND policyname = 'Members can view workspace unanswered questions'
  ) THEN
    CREATE POLICY "Members can view workspace unanswered questions"
      ON public.unanswered_questions
      FOR SELECT
      TO authenticated
      USING (public.is_workspace_member(workspace_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'unanswered_questions' 
      AND policyname = 'Members can insert workspace unanswered questions'
  ) THEN
    CREATE POLICY "Members can insert workspace unanswered questions"
      ON public.unanswered_questions
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_workspace_member(workspace_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'unanswered_questions' 
      AND policyname = 'Members can update workspace unanswered questions'
  ) THEN
    CREATE POLICY "Members can update workspace unanswered questions"
      ON public.unanswered_questions
      FOR UPDATE
      TO authenticated
      USING (public.is_workspace_member(workspace_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'unanswered_questions' 
      AND policyname = 'Admins and owners can delete workspace unanswered questions'
  ) THEN
    CREATE POLICY "Admins and owners can delete workspace unanswered questions"
      ON public.unanswered_questions
      FOR DELETE
      TO authenticated
      USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']::public.workspace_role[]));
  END IF;
END $$;
