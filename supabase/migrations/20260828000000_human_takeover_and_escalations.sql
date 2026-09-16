-- ==============================================================================
-- Migration: 20260828000000_human_takeover_and_escalations.sql
-- Description: Step 6.2-A - Escalations & Human Agent Takeover Database Foundation
-- ==============================================================================

-- 1. Unique constraint & index on escalations (one escalation record per conversation)
CREATE UNIQUE INDEX IF NOT EXISTS uq_escalations_conversation_id 
ON public.escalations (conversation_id);

-- 2. Update Partial Unique Index on conversations for all open states (active and escalated)
DROP INDEX IF EXISTS public.uq_conversations_active_visitor;

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_open_visitor 
ON public.conversations (workspace_id, visitor_id) 
WHERE status IN ('active', 'escalated');

-- 3. Add missing authenticated workspace-member INSERT policy for public.escalations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename = 'escalations' 
      AND policyname = 'Members can insert workspace escalations'
  ) THEN
    CREATE POLICY "Members can insert workspace escalations"
      ON public.escalations
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_workspace_member(workspace_id));
  END IF;
END $$;

-- 4. Update create_or_get_widget_conversation to reuse open conversation (active OR escalated)
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

  -- 3. Check for existing open conversation (active or escalated)
  SELECT c.id, c.status, c.created_at
  INTO v_conversation_id, v_status, v_created_at
  FROM public.conversations c
  WHERE c.workspace_id = v_workspace_id
    AND c.visitor_id = p_visitor_id
    AND c.status IN ('active', 'escalated')
  ORDER BY c.last_message_at DESC
  LIMIT 1;

  IF v_conversation_id IS NOT NULL THEN
    RETURN QUERY SELECT v_conversation_id, v_status, v_created_at;
    RETURN;
  END IF;

  -- 4. Atomic INSERT or conflict resolution using open conversations partial index
  INSERT INTO public.conversations (workspace_id, visitor_id, status)
  VALUES (v_workspace_id, p_visitor_id, 'active')
  ON CONFLICT (workspace_id, visitor_id) WHERE conversations.status IN ('active', 'escalated')
  DO UPDATE SET updated_at = public.conversations.updated_at
  RETURNING public.conversations.id, public.conversations.status, public.conversations.created_at
  INTO v_conversation_id, v_status, v_created_at;

  RETURN QUERY SELECT v_conversation_id, v_status, v_created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_or_get_widget_conversation(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_or_get_widget_conversation(TEXT, TEXT) TO anon, authenticated, service_role;

-- 5. Update send_visitor_message to allow sending on active OR escalated conversations
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

  -- 3. Verify workspace & active/escalated conversation ownership
  SELECT c.workspace_id INTO v_workspace_id
  FROM public.conversations c
  JOIN public.workspaces w ON w.id = c.workspace_id
  WHERE w.public_widget_key = p_public_widget_key
    AND c.id = p_conversation_id
    AND c.visitor_id = p_visitor_id
    AND c.status IN ('active', 'escalated');

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Active or escalated conversation not found or access denied';
  END IF;

  -- 4. Insert visitor message
  INSERT INTO public.messages (workspace_id, conversation_id, sender_type, content)
  VALUES (v_workspace_id, p_conversation_id, 'user', v_clean_content)
  RETURNING public.messages.id, public.messages.created_at INTO v_message_id, v_created_at;

  -- 5. Update conversation last_message_at
  UPDATE public.conversations
  SET last_message_at = now()
  WHERE public.conversations.id = p_conversation_id;

  -- 6. Return created message record
  RETURN QUERY
  SELECT v_message_id, p_conversation_id, 'user'::public.message_sender_type, v_clean_content, v_created_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_visitor_message(TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_visitor_message(TEXT, TEXT, UUID, TEXT) TO anon, authenticated, service_role;

-- 6. Atomic claim_escalated_conversation RPC for support operators
CREATE OR REPLACE FUNCTION public.claim_escalated_conversation(
  p_conversation_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  assigned_to UUID,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_conv_status public.conversation_status;
  v_current_user UUID := auth.uid();
  v_existing_assigned UUID;
BEGIN
  -- 1. Verify authentication
  IF v_current_user IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Authentication required to claim conversation'::TEXT;
    RETURN;
  END IF;

  -- 2. Atomically lock and verify conversation and workspace membership
  SELECT c.workspace_id, c.status
  INTO v_workspace_id, v_conv_status
  FROM public.conversations c
  WHERE c.id = p_conversation_id
    AND public.is_workspace_member(c.workspace_id)
  FOR UPDATE;

  IF v_workspace_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Conversation not found or access denied'::TEXT;
    RETURN;
  END IF;

  -- 3. Cannot claim closed conversations
  IF v_conv_status = 'closed' THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Cannot claim a closed conversation'::TEXT;
    RETURN;
  END IF;

  -- 4. Check existing escalation assignment under conversation lock
  SELECT e.assigned_to INTO v_existing_assigned
  FROM public.escalations e
  WHERE e.conversation_id = p_conversation_id
    AND e.workspace_id = v_workspace_id
  FOR UPDATE;

  -- 5. If already assigned to another agent, return conflict
  IF v_existing_assigned IS NOT NULL AND v_existing_assigned <> v_current_user THEN
    RETURN QUERY SELECT false, v_existing_assigned, 'Conversation is already claimed by another agent'::TEXT;
    RETURN;
  END IF;

  -- 6. Update conversation status to escalated if not already
  IF v_conv_status <> 'escalated' THEN
    UPDATE public.conversations
    SET status = 'escalated', updated_at = now()
    WHERE id = p_conversation_id AND workspace_id = v_workspace_id;
  END IF;

  -- 7. Upsert escalation record with current agent
  INSERT INTO public.escalations (workspace_id, conversation_id, reason, status, assigned_to)
  VALUES (v_workspace_id, p_conversation_id, 'manual', 'assigned', v_current_user)
  ON CONFLICT (conversation_id)
  DO UPDATE SET 
    status = 'assigned',
    assigned_to = v_current_user,
    updated_at = now();

  RETURN QUERY SELECT true, v_current_user, 'Conversation claimed successfully'::TEXT;
END;
$$;

-- Security Grants: Revoke from PUBLIC, grant to authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.claim_escalated_conversation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_escalated_conversation(UUID) TO authenticated, service_role;
