-- ==============================================================================
-- Migration: 20260823000002_fix_workspace_knowledge_search.sql
-- Description: Step 5.8 Fix - Enable OR-based FTS matching for conversational queries
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.search_workspace_knowledge(
  p_public_widget_key TEXT,
  p_query TEXT,
  p_match_limit INT DEFAULT 3
)
RETURNS TABLE (
  document_id UUID,
  title TEXT,
  content TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_clean_query TEXT;
  v_query_lexemes TEXT[];
  v_tsquery tsquery;
  v_clamped_limit INT;
BEGIN
  -- 1. Validate public_widget_key parameter
  IF p_public_widget_key IS NULL OR length(p_public_widget_key) < 16 THEN
    RETURN;
  END IF;

  -- 2. Resolve workspace ID strictly from p_public_widget_key
  SELECT w.id INTO v_workspace_id
  FROM public.workspaces w
  WHERE w.public_widget_key = p_public_widget_key;

  IF v_workspace_id IS NULL THEN
    RETURN;
  END IF;

  -- 3. Clean and validate query (bound length, reject empty/whitespace)
  v_clean_query := trim(coalesce(p_query, ''));
  IF length(v_clean_query) < 1 THEN
    RETURN;
  END IF;

  -- Bound query length to max 500 characters
  IF length(v_clean_query) > 500 THEN
    v_clean_query := substr(v_clean_query, 1, 500);
  END IF;

  -- Clamp match limit to safe range 1–5 (default 3)
  v_clamped_limit := GREATEST(1, LEAST(COALESCE(p_match_limit, 3), 5));

  -- 4. Construct an OR-based tsquery from extracted non-stopword lexemes
  -- This allows conversational natural language queries (e.g. "How long do I have to request a refund?")
  -- to match documents containing any relevant keywords ("refund", "request", "long")
  -- while ranking documents matching more keywords higher via ts_rank.
  BEGIN
    v_query_lexemes := tsvector_to_array(to_tsvector('english', v_clean_query));
    
    IF v_query_lexemes IS NULL OR array_length(v_query_lexemes, 1) IS NULL OR array_length(v_query_lexemes, 1) = 0 THEN
      RETURN;
    END IF;

    v_tsquery := to_tsquery('english', array_to_string(v_query_lexemes, ' | '));
  EXCEPTION WHEN OTHERS THEN
    v_tsquery := NULL;
  END;

  -- If parsed tsquery is empty, return zero rows
  IF v_tsquery IS NULL OR v_tsquery = ''::tsquery THEN
    RETURN;
  END IF;

  -- 5. Return top matching documents for the workspace ranked by relevance
  -- Bound content to approx 1,500 characters per result
  -- Return only public-safe fields: document_id, title, content
  RETURN QUERY
  SELECT
    d.id AS document_id,
    d.title,
    substr(d.content, 1, 1500) AS content
  FROM public.documents d
  WHERE d.workspace_id = v_workspace_id
    AND d.status = 'ready'
    AND to_tsvector('english', coalesce(d.title, '') || ' ' || coalesce(d.content, '')) @@ v_tsquery
  ORDER BY
    ts_rank(to_tsvector('english', coalesce(d.title, '') || ' ' || coalesce(d.content, '')), v_tsquery) DESC,
    d.updated_at DESC
  LIMIT v_clamped_limit;
END;
$$;

-- Security Grants: Revoke from PUBLIC, grant to anon, authenticated, service_role
REVOKE EXECUTE ON FUNCTION public.search_workspace_knowledge(TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_workspace_knowledge(TEXT, TEXT, INT) TO anon, authenticated, service_role;
