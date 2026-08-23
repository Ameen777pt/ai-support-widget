-- ==============================================================================
-- Migration: 20260823000001_search_workspace_knowledge_rpc.sql
-- Description: Step 5.8 PostgreSQL Full-Text Search Knowledge Retrieval RPC
-- ==============================================================================

-- 1. Create functional GIN index on documents for full-text search performance
CREATE INDEX IF NOT EXISTS idx_documents_fts
ON public.documents
USING gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')));

-- 2. Create search_workspace_knowledge RPC
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

  -- 4. Parse query with websearch_to_tsquery (safe for arbitrary user input)
  BEGIN
    v_tsquery := websearch_to_tsquery('english', v_clean_query);
  EXCEPTION WHEN OTHERS THEN
    v_tsquery := NULL;
  END;

  -- If parsed tsquery is empty, return zero rows
  IF v_tsquery IS NULL OR v_tsquery = ''::tsquery THEN
    RETURN;
  END IF;

  -- 5. Return top matching documents for the workspace
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

-- 3. Security Grants: Revoke from PUBLIC, grant to anon, authenticated, service_role
REVOKE EXECUTE ON FUNCTION public.search_workspace_knowledge(TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_workspace_knowledge(TEXT, TEXT, INT) TO anon, authenticated, service_role;
