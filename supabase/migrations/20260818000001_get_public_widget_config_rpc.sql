-- ==============================================================================
-- Migration: 20260818000001_get_public_widget_config_rpc.sql
-- Description: Day 3C Public Widget Configuration Lookup RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_public_widget_config(p_public_widget_key TEXT)
RETURNS TABLE (
  brand_name TEXT,
  brand_color TEXT,
  welcome_message TEXT,
  logo_url TEXT,
  position TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Lookup public branding configuration by public_widget_key
  -- Returns strictly public-safe branding properties and zero rows if key is invalid
  RETURN QUERY
  SELECT
    ws.brand_name,
    ws.brand_color,
    ws.welcome_message,
    ws.logo_url,
    ws.position
  FROM public.workspaces w
  JOIN public.widget_settings ws ON ws.workspace_id = w.id
  WHERE w.public_widget_key = p_public_widget_key
  LIMIT 1;
END;
$$;

-- Explicitly revoke from PUBLIC and grant execution to anon, authenticated, and service_role
REVOKE EXECUTE ON FUNCTION public.get_public_widget_config(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_widget_config(TEXT) TO anon, authenticated, service_role;
