-- ==============================================================================
-- Migration: 20260829000000_widget_customization_fields.sql
-- Description: Step 7.1 - Add launcher_text and suggested_questions to widget_settings
--              and update get_public_widget_config RPC to return them.
-- ==============================================================================

-- 1. Safely add launcher_text and suggested_questions columns with backward-compatible defaults
ALTER TABLE public.widget_settings
  ADD COLUMN IF NOT EXISTS launcher_text TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS suggested_questions TEXT[] NOT NULL DEFAULT '{}';

-- 2. Drop existing get_public_widget_config function to allow changing return table signature
DROP FUNCTION IF EXISTS public.get_public_widget_config(TEXT);

-- 3. Recreate get_public_widget_config with the new presentation fields
CREATE OR REPLACE FUNCTION public.get_public_widget_config(p_public_widget_key TEXT)
RETURNS TABLE (
  brand_name TEXT,
  brand_color TEXT,
  welcome_message TEXT,
  logo_url TEXT,
  "position" TEXT,
  launcher_text TEXT,
  suggested_questions TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Lookup public branding and presentation configuration by public_widget_key
  -- Returns strictly public-safe branding properties and zero rows if key is invalid
  RETURN QUERY
  SELECT
    ws.brand_name,
    ws.brand_color,
    ws.welcome_message,
    ws.logo_url,
    ws."position",
    ws.launcher_text,
    ws.suggested_questions
  FROM public.workspaces w
  JOIN public.widget_settings ws ON ws.workspace_id = w.id
  WHERE w.public_widget_key = p_public_widget_key
  LIMIT 1;
END;
$$;

-- Explicitly revoke from PUBLIC and grant execution to anon, authenticated, and service_role
REVOKE EXECUTE ON FUNCTION public.get_public_widget_config(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_widget_config(TEXT) TO anon, authenticated, service_role;
