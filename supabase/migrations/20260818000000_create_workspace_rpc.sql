-- ==============================================================================
-- Migration: 20260818000000_create_workspace_rpc.sql
-- Description: Day 3B.1 Atomic & Concurrency-Safe Workspace Provisioning RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_workspace_for_user(
  p_name TEXT,
  p_slug TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  public_widget_key TEXT,
  role public.workspace_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_workspace_id UUID;
  v_base_slug TEXT;
  v_candidate_slug TEXT;
  v_clean_name TEXT;
  v_counter INTEGER := 0;
  v_constraint_name TEXT;
  v_existing_id UUID;
  v_existing_name TEXT;
  v_existing_slug TEXT;
  v_existing_key TEXT;
  v_existing_role public.workspace_role;
BEGIN
  -- Derive user ID strictly from auth.uid() context
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: valid authenticated session required';
  END IF;

  -- Validate workspace name
  v_clean_name := trim(coalesce(p_name, ''));
  IF length(v_clean_name) < 2 THEN
    RAISE EXCEPTION 'Workspace name must be at least 2 characters long';
  END IF;

  -- 1. Acquire 64-bit transactional advisory lock keyed to user ID to serialize concurrent requests
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  -- 2. Idempotency check: if user already has an active workspace, return it
  SELECT w.id, w.name, w.slug, w.public_widget_key, wm.role
  INTO v_existing_id, v_existing_name, v_existing_slug, v_existing_key, v_existing_role
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.user_id = v_user_id
  ORDER BY wm.created_at ASC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id, v_existing_name, v_existing_slug, v_existing_key, v_existing_role;
    RETURN;
  END IF;

  -- 3. Base candidate slug preparation
  IF p_slug IS NOT NULL AND length(trim(p_slug)) >= 2 THEN
    v_base_slug := lower(regexp_replace(trim(p_slug), '[^a-zA-Z0-9]+', '-', 'g'));
  ELSE
    v_base_slug := lower(regexp_replace(v_clean_name, '[^a-zA-Z0-9]+', '-', 'g'));
  END IF;

  v_base_slug := trim(both '-' from v_base_slug);
  IF length(v_base_slug) < 2 THEN
    v_base_slug := 'ws';
  END IF;
  v_candidate_slug := v_base_slug;

  -- 4. Atomic Insert Loop with targeted unique_violation handling for workspaces_slug_key
  LOOP
    BEGIN
      INSERT INTO public.workspaces (name, slug)
      VALUES (v_clean_name, v_candidate_slug)
      RETURNING workspaces.id INTO v_workspace_id;

      EXIT; -- Success
    EXCEPTION
      WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
        IF v_constraint_name = 'workspaces_slug_key' THEN
          v_counter := v_counter + 1;
          v_candidate_slug := v_base_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4 + v_counter);
          IF v_counter > 10 THEN
            RAISE EXCEPTION 'Could not generate unique workspace slug after multiple attempts';
          END IF;
        ELSE
          RAISE;
        END IF;
    END;
  END LOOP;

  -- 5. Insert Membership as Owner
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_user_id, 'owner');

  -- 6. Insert Default Widget Settings
  INSERT INTO public.widget_settings (workspace_id, brand_name, welcome_message)
  VALUES (v_workspace_id, v_clean_name, 'Hi! How can we help you today?');

  -- 7. Return created workspace record
  RETURN QUERY
  SELECT w.id, w.name, w.slug, w.public_widget_key, 'owner'::public.workspace_role
  FROM public.workspaces w
  WHERE w.id = v_workspace_id;
END;
$$;

-- Security: Restrict execution to authenticated users and service_role
REVOKE EXECUTE ON FUNCTION public.create_workspace_for_user(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_workspace_for_user(TEXT, TEXT) TO authenticated, service_role;
