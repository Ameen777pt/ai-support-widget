-- ==============================================================================
-- Migration: 20260818000002_widget_conversation_rpcs.sql
-- Description: Day 3C Step 5 - Public Widget Conversation & Messaging Foundation
-- ==============================================================================

-- 1. Partial Unique Index: Exactly 1 active conversation per visitor per workspace
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_active_visitor 
ON public.conversations (workspace_id, visitor_id) 
WHERE status = 'active';

-- 2. Atomic Conversation Provisioning / Retrieval RPC
CREATE OR REPLACE FUNCTION public.create_or_get_widget_conversation(
  p_public_widget_key TEXT,
  p_visitor_id TEXT
)
RETURNS TABLE (
  conversation_id UUID,
  status public.conversation_status,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_conversation_id UUID;
  v_status public.conversation_status;
  v_created_at TIMESTAMPTZ;
BEGIN
  -- 1. Validate visitor_id format (vis_<UUID>, exactly 40 characters)
  IF p_visitor_id IS NULL OR length(p_visitor_id) > 40 OR NOT (p_visitor_id ~* '^vis_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'Invalid visitor identifier format';
  END IF;

  -- 2. Resolve workspace ID by public_widget_key
  SELECT w.id INTO v_workspace_id
  FROM public.workspaces w
  WHERE w.public_widget_key = p_public_widget_key;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Invalid public widget key';
  END IF;

  -- 3. Atomic INSERT or conflict resolution using partial unique index
  INSERT INTO public.conversations (workspace_id, visitor_id, status)
  VALUES (v_workspace_id, p_visitor_id, 'active')
  ON CONFLICT (workspace_id, visitor_id) WHERE status = 'active'
  DO UPDATE SET updated_at = public.conversations.updated_at
  RETURNING public.conversations.id, public.conversations.status, public.conversations.created_at
  INTO v_conversation_id, v_status, v_created_at;

  RETURN QUERY SELECT v_conversation_id, v_status, v_created_at;
END;
$$;

-- 3. Public Visitor Send Message RPC
CREATE OR REPLACE FUNCTION public.send_visitor_message(
  p_public_widget_key TEXT,
  p_visitor_id TEXT,
  p_conversation_id UUID,
  p_content TEXT
)
RETURNS TABLE (
  message_id UUID,
  conversation_id UUID,
  sender_type public.message_sender_type,
  content TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_message_id UUID;
  v_clean_content TEXT;
  v_created_at TIMESTAMPTZ;
BEGIN
  -- 1. Validate visitor_id format
  IF p_visitor_id IS NULL OR length(p_visitor_id) > 40 OR NOT (p_visitor_id ~* '^vis_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'Invalid visitor identifier format';
  END IF;

  -- 2. Validate message content
  v_clean_content := trim(coalesce(p_content, ''));
  IF length(v_clean_content) < 1 OR length(v_clean_content) > 3000 THEN
    RAISE EXCEPTION 'Message content must be between 1 and 3000 characters';
  END IF;

  -- 3. Verify workspace & active conversation ownership
  SELECT c.workspace_id INTO v_workspace_id
  FROM public.conversations c
  JOIN public.workspaces w ON w.id = c.workspace_id
  WHERE w.public_widget_key = p_public_widget_key
    AND c.id = p_conversation_id
    AND c.visitor_id = p_visitor_id
    AND c.status = 'active';

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Active conversation not found or access denied';
  END IF;

  -- 4. Insert visitor message
  INSERT INTO public.messages (workspace_id, conversation_id, sender_type, content)
  VALUES (v_workspace_id, p_conversation_id, 'visitor', v_clean_content)
  RETURNING public.messages.id, public.messages.created_at INTO v_message_id, v_created_at;

  -- 5. Update conversation last_message_at
  UPDATE public.conversations
  SET last_message_at = now()
  WHERE public.conversations.id = p_conversation_id;

  RETURN QUERY
  SELECT v_message_id, p_conversation_id, 'visitor'::public.message_sender_type, v_clean_content, v_created_at;
END;
$$;

-- 4. Public Retrieve Conversation Messages RPC (100 Message Cap)
CREATE OR REPLACE FUNCTION public.get_conversation_messages(
  p_public_widget_key TEXT,
  p_visitor_id TEXT,
  p_conversation_id UUID
)
RETURNS TABLE (
  message_id UUID,
  sender_type public.message_sender_type,
  content TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Validate visitor_id format
  IF p_visitor_id IS NULL OR length(p_visitor_id) > 40 OR NOT (p_visitor_id ~* '^vis_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RETURN;
  END IF;

  -- 2. Verify conversation ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.workspaces w ON w.id = c.workspace_id
    WHERE w.public_widget_key = p_public_widget_key
      AND c.id = p_conversation_id
      AND c.visitor_id = p_visitor_id
  ) THEN
    RETURN;
  END IF;

  -- 3. Return up to 100 messages chronologically
  RETURN QUERY
  SELECT m.id, m.sender_type, m.content, m.created_at
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
  ORDER BY m.created_at ASC
  LIMIT 100;
END;
$$;

-- 5. Security Grants: Revoke from PUBLIC, grant to anon, authenticated, service_role
REVOKE EXECUTE ON FUNCTION public.create_or_get_widget_conversation(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_visitor_message(TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_conversation_messages(TEXT, TEXT, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_or_get_widget_conversation(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_visitor_message(TEXT, TEXT, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_conversation_messages(TEXT, TEXT, UUID) TO anon, authenticated, service_role;
