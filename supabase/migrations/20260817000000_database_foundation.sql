-- ==============================================================================
-- Migration: 20260817000000_database_foundation.sql
-- Description: Day 2 Database Foundation for AI Support Widget SaaS
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- 2. Create Enums
CREATE TYPE public.workspace_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE public.document_source_type AS ENUM ('file', 'url', 'raw_text');
CREATE TYPE public.document_status AS ENUM ('pending', 'processing', 'ready', 'failed');
CREATE TYPE public.conversation_status AS ENUM ('active', 'escalated', 'resolved', 'closed');
CREATE TYPE public.message_sender_type AS ENUM ('user', 'bot', 'agent');
CREATE TYPE public.escalation_reason AS ENUM ('user_requested', 'unresolved_query', 'negative_sentiment', 'manual');
CREATE TYPE public.escalation_status AS ENUM ('pending', 'assigned', 'resolved', 'dismissed');

-- 3. Utility Trigger for updating updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 4. Create Tables
-- ==============================================================================

-- Table 1: workspaces
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  public_widget_key TEXT NOT NULL UNIQUE DEFAULT ('pk_live_' || replace(gen_random_uuid()::text, '-', '')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspaces_slug_check CHECK (length(slug) >= 2 AND slug ~ '^[a-z0-9-]+$')
);

CREATE TRIGGER trigger_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Table 2: workspace_members
CREATE TABLE public.workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.workspace_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_workspace_members_workspace_user UNIQUE (workspace_id, user_id)
);

CREATE TRIGGER trigger_workspace_members_updated_at
  BEFORE UPDATE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Table 3: documents
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_type public.document_source_type NOT NULL,
  source_url TEXT,
  file_path TEXT,
  file_size_bytes BIGINT,
  mime_type TEXT,
  content_hash TEXT,
  status public.document_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_documents_id_workspace UNIQUE (id, workspace_id)
);

CREATE TRIGGER trigger_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Table 4: document_chunks
CREATE TABLE public.document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  document_id UUID NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_document_chunks_document_index UNIQUE (document_id, chunk_index),
  CONSTRAINT fk_document_chunks_document_workspace FOREIGN KEY (document_id, workspace_id) REFERENCES public.documents(id, workspace_id) ON DELETE CASCADE
);

-- Table 5: widget_settings
CREATE TABLE public.widget_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL DEFAULT 'Support',
  brand_color TEXT NOT NULL DEFAULT '#0F172A',
  welcome_message TEXT NOT NULL DEFAULT 'Hi! How can we help you today?',
  logo_url TEXT,
  position TEXT NOT NULL DEFAULT 'bottom-right',
  allowed_domains TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trigger_widget_settings_updated_at
  BEFORE UPDATE ON public.widget_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Table 6: conversations
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  status public.conversation_status NOT NULL DEFAULT 'active',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_conversations_id_workspace UNIQUE (id, workspace_id)
);

CREATE TRIGGER trigger_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Table 7: messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  sender_type public.message_sender_type NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  grounded BOOLEAN NOT NULL DEFAULT false,
  tokens_prompt INTEGER,
  tokens_completion INTEGER,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_messages_conversation_workspace FOREIGN KEY (conversation_id, workspace_id) REFERENCES public.conversations(id, workspace_id) ON DELETE CASCADE
);

-- Table 8: escalations
CREATE TABLE public.escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  reason public.escalation_reason NOT NULL DEFAULT 'unresolved_query',
  status public.escalation_status NOT NULL DEFAULT 'pending',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_email TEXT,
  notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_escalations_conversation_workspace FOREIGN KEY (conversation_id, workspace_id) REFERENCES public.conversations(id, workspace_id) ON DELETE CASCADE
);

CREATE TRIGGER trigger_escalations_updated_at
  BEFORE UPDATE ON public.escalations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 5. Indexes
-- ==============================================================================

-- workspace_members
CREATE INDEX idx_workspace_members_user_id ON public.workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace_role ON public.workspace_members(workspace_id, role);

-- documents
CREATE INDEX idx_documents_workspace_id ON public.documents(workspace_id);
CREATE INDEX idx_documents_workspace_status ON public.documents(workspace_id, status);
CREATE INDEX idx_documents_content_hash ON public.documents(workspace_id, content_hash);

-- document_chunks
CREATE INDEX idx_document_chunks_workspace_id ON public.document_chunks(workspace_id);
CREATE INDEX idx_document_chunks_document_id ON public.document_chunks(document_id);
CREATE INDEX idx_document_chunks_embedding_hnsw ON public.document_chunks USING hnsw (embedding vector_cosine_ops);

-- conversations
CREATE INDEX idx_conversations_workspace_id ON public.conversations(workspace_id);
CREATE INDEX idx_conversations_workspace_status ON public.conversations(workspace_id, status);
CREATE INDEX idx_conversations_workspace_visitor ON public.conversations(workspace_id, visitor_id);
CREATE INDEX idx_conversations_workspace_last_message ON public.conversations(workspace_id, last_message_at DESC);

-- messages
CREATE INDEX idx_messages_conversation_created ON public.messages(conversation_id, created_at ASC);
CREATE INDEX idx_messages_workspace_id ON public.messages(workspace_id);

-- escalations
CREATE INDEX idx_escalations_workspace_status ON public.escalations(workspace_id, status);
CREATE INDEX idx_escalations_workspace_assigned ON public.escalations(workspace_id, assigned_to);
CREATE INDEX idx_escalations_conversation_id ON public.escalations(conversation_id);

-- ==============================================================================
-- 6. Helper Security Functions for RLS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_user_workspace_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT workspace_id 
  FROM workspace_members 
  WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM workspace_members 
    WHERE workspace_id = _workspace_id 
      AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(_workspace_id UUID, _roles public.workspace_role[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM workspace_members 
    WHERE workspace_id = _workspace_id 
      AND user_id = auth.uid()
      AND role = ANY(_roles)
  );
$$;

-- Explicitly restrict execution of elevated SECURITY DEFINER functions from PUBLIC/anonymous
REVOKE EXECUTE ON FUNCTION public.get_user_workspace_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_workspace_role(UUID, public.workspace_role[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_user_workspace_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_workspace_role(UUID, public.workspace_role[]) TO authenticated, service_role;

-- ==============================================================================
-- 7. Enable Row Level Security (RLS)
-- ==============================================================================

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widget_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 8. Authenticated Member RLS Policies
-- ==============================================================================

-- workspaces policies
CREATE POLICY "Members can view their workspaces"
  ON public.workspaces
  FOR SELECT
  TO authenticated
  USING (id IN (SELECT public.get_user_workspace_ids()));

CREATE POLICY "Admins and owners can update their workspace"
  ON public.workspaces
  FOR UPDATE
  TO authenticated
  USING (public.has_workspace_role(id, ARRAY['owner', 'admin']::public.workspace_role[]));

-- workspace_members policies
CREATE POLICY "Members can view workspace member list"
  ON public.workspace_members
  FOR SELECT
  TO authenticated
  USING (workspace_id IN (SELECT public.get_user_workspace_ids()));

CREATE POLICY "Admins and owners can add members"
  ON public.workspace_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']::public.workspace_role[]));

CREATE POLICY "Admins and owners can update members"
  ON public.workspace_members
  FOR UPDATE
  TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']::public.workspace_role[]));

CREATE POLICY "Admins and owners can delete members"
  ON public.workspace_members
  FOR DELETE
  TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']::public.workspace_role[]));

-- documents policies (Strictly internal to workspace members)
CREATE POLICY "Members can view workspace documents"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Members can create workspace documents"
  ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Members can update workspace documents"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Admins and owners can delete workspace documents"
  ON public.documents
  FOR DELETE
  TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']::public.workspace_role[]));

-- document_chunks policies (Strictly internal to workspace members)
CREATE POLICY "Members can view workspace document chunks"
  ON public.document_chunks
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Members can create workspace document chunks"
  ON public.document_chunks
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "Members can update workspace document chunks"
  ON public.document_chunks
  FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Admins and owners can delete workspace document chunks"
  ON public.document_chunks
  FOR DELETE
  TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']::public.workspace_role[]));

-- widget_settings policies
CREATE POLICY "Members can view workspace widget settings"
  ON public.widget_settings
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Admins and owners can insert widget settings"
  ON public.widget_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']::public.workspace_role[]));

CREATE POLICY "Admins and owners can update widget settings"
  ON public.widget_settings
  FOR UPDATE
  TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']::public.workspace_role[]));

-- conversations policies (Dashboard view)
CREATE POLICY "Members can view workspace conversations"
  ON public.conversations
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Members can update workspace conversations"
  ON public.conversations
  FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Admins and owners can delete workspace conversations"
  ON public.conversations
  FOR DELETE
  TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']::public.workspace_role[]));

-- messages policies (Dashboard view & agent replies)
CREATE POLICY "Members can view workspace messages"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Members can insert agent messages"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id));

-- escalations policies
CREATE POLICY "Members can view workspace escalations"
  ON public.escalations
  FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Members can update workspace escalations"
  ON public.escalations
  FOR UPDATE
  TO authenticated
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "Admins and owners can delete workspace escalations"
  ON public.escalations
  FOR DELETE
  TO authenticated
  USING (public.has_workspace_role(workspace_id, ARRAY['owner', 'admin']::public.workspace_role[]));
