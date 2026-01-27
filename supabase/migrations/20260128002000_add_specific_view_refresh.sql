CREATE OR REPLACE FUNCTION public.refresh_specific_materialized_view(p_view_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_view_exists boolean;
BEGIN
  -- Validate view name to prevent SQL injection and unauthorized refreshes
  IF p_view_name NOT IN ('mv_mercadorias_participante') THEN
    RAISE EXCEPTION 'View not allowed for specific refresh: %', p_view_name;
  END IF;

  -- Check if view exists
  SELECT EXISTS (
    SELECT 1 
    FROM pg_matviews 
    WHERE schemaname = 'extensions' 
    AND matviewname = p_view_name
  ) INTO v_view_exists;

  IF v_view_exists THEN
    -- Execute refresh
    -- We use EXECUTE to allow dynamic view name (safeguarded by the check above)
    EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.%I', p_view_name);
  ELSE
    RAISE EXCEPTION 'View not found: extensions.%', p_view_name;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_specific_materialized_view(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_specific_materialized_view(text) TO service_role;
