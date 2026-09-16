-- ==============================================================================
-- Migration: 20260828020000_publish_knowledge_draft_rpc.sql
-- Description: Step 6.4-C - Atomic Knowledge Draft Publishing & Gap Resolution RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.publish_knowledge_draft_and_resolve(
  p_question_id UUID,
  p_title TEXT,
  p_content TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  document_id UUID,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_workspace_id UUID;
  v_question_status public.unanswered_question_status;
  v_new_doc_id UUID;
  v_file_size INT;
  v_clean_title TEXT;
  v_clean_content TEXT;
BEGIN
  -- 1. Validate caller authentication
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Authentication required.'::TEXT;
    RETURN;
  END IF;

  -- 2. Clean and validate inputs
  v_clean_title := trim(coalesce(p_title, ''));
  v_clean_content := trim(coalesce(p_content, ''));

  IF length(v_clean_title) < 2 OR length(v_clean_title) > 150 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Title must be between 2 and 150 characters.'::TEXT;
    RETURN;
  END IF;

  IF length(v_clean_content) < 10 OR length(v_clean_content) > 20000 THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Content must be between 10 and 20,000 characters.'::TEXT;
    RETURN;
  END IF;

  -- 3. Verify question exists and get workspace_id
  SELECT q.workspace_id, q.status 
  INTO v_workspace_id, v_question_status
  FROM public.unanswered_questions q
  WHERE q.id = p_question_id;

  IF v_workspace_id IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Unanswered question not found.'::TEXT;
    RETURN;
  END IF;

  -- 4. Verify caller is owner or admin of the workspace
  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'admin']::public.workspace_role[]) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'Forbidden: Only workspace owners and admins can publish knowledge entries.'::TEXT;
    RETURN;
  END IF;

  -- 5. Verify question is not already resolved (duplicate publishing protection)
  IF v_question_status = 'resolved' THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'This question has already been resolved.'::TEXT;
    RETURN;
  END IF;

  -- 6. Calculate file size in bytes
  v_file_size := octet_length(v_clean_content);

  -- 7. Atomically insert new knowledge document
  INSERT INTO public.documents (
    workspace_id,
    title,
    content,
    source_type,
    status,
    mime_type,
    file_size_bytes,
    created_by
  ) VALUES (
    v_workspace_id,
    v_clean_title,
    v_clean_content,
    'raw_text',
    'ready',
    'text/plain',
    v_file_size,
    v_user_id
  )
  RETURNING id INTO v_new_doc_id;

  -- 8. Atomically resolve the originating unanswered question
  UPDATE public.unanswered_questions
  SET
    status = 'resolved',
    resolved_by_document_id = v_new_doc_id,
    resolved_by = v_user_id,
    resolved_at = now(),
    updated_at = now()
  WHERE id = p_question_id
    AND workspace_id = v_workspace_id;

  -- 9. Return success and document ID
  RETURN QUERY SELECT TRUE, v_new_doc_id, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT FALSE, NULL::UUID, SQLERRM::TEXT;
END;
$$;

-- Security Grants: Revoke from PUBLIC, grant to authenticated and service_role
REVOKE EXECUTE ON FUNCTION public.publish_knowledge_draft_and_resolve(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_knowledge_draft_and_resolve(UUID, TEXT, TEXT) TO authenticated, service_role;
