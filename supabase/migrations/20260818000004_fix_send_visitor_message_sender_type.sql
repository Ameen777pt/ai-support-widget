-- ==============================================================================
-- Migration: 20260818000004_fix_send_visitor_message_sender_type.sql
-- Description: Fix message_sender_type enum value in send_visitor_message ('user' instead of 'visitor')
-- ==============================================================================

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
  -- 1. Validate visitor_id format (vis_<UUID>, exactly 40 characters)
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

  -- 4. Insert message with correct enum value: 'user'
  INSERT INTO public.messages (workspace_id, conversation_id, sender_type, content)
  VALUES (v_workspace_id, p_conversation_id, 'user', v_clean_content)
  RETURNING public.messages.id, public.messages.created_at INTO v_message_id, v_created_at;

  -- 5. Update conversation last_message_at
  UPDATE public.conversations
  SET last_message_at = now()
  WHERE public.conversations.id = p_conversation_id;

  -- 6. Return created message record with sender_type = 'user'
  RETURN QUERY
  SELECT v_message_id, p_conversation_id, 'user'::public.message_sender_type, v_clean_content, v_created_at;
END;
$$;

-- Security Grants: Revoke from PUBLIC, grant to anon, authenticated, service_role
REVOKE EXECUTE ON FUNCTION public.send_visitor_message(TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_visitor_message(TEXT, TEXT, UUID, TEXT) TO anon, authenticated, service_role;
