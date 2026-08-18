-- ==============================================================================
-- Migration: 20260818000003_fix_create_or_get_widget_conversation_ambiguity.sql
-- Description: Fix ambiguous column reference 'status' in create_or_get_widget_conversation
-- ==============================================================================

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

  -- 3. Atomic INSERT or conflict resolution using explicitly qualified table reference
  INSERT INTO public.conversations (workspace_id, visitor_id, status)
  VALUES (v_workspace_id, p_visitor_id, 'active')
  ON CONFLICT (workspace_id, visitor_id) WHERE conversations.status = 'active'
  DO UPDATE SET updated_at = public.conversations.updated_at
  RETURNING public.conversations.id, public.conversations.status, public.conversations.created_at
  INTO v_conversation_id, v_status, v_created_at;

  RETURN QUERY SELECT v_conversation_id, v_status, v_created_at;
END;
$$;

-- Security Grants: Revoke from PUBLIC, grant to anon, authenticated, service_role
REVOKE EXECUTE ON FUNCTION public.create_or_get_widget_conversation(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_or_get_widget_conversation(TEXT, TEXT) TO anon, authenticated, service_role;
