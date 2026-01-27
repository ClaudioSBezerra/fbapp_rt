-- Ensure advisory lock functions are available via RPC
CREATE OR REPLACE FUNCTION public.pg_try_advisory_lock(key bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT pg_try_advisory_lock(key);
$$;

CREATE OR REPLACE FUNCTION public.pg_advisory_unlock(key bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT pg_advisory_unlock(key);
$$;

-- Function to refresh a specific materialized view
CREATE OR REPLACE FUNCTION public.refresh_specific_materialized_view(p_view_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '300s'
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- Validate view name to prevent SQL injection
  IF p_view_name NOT IN (
    'mv_mercadorias_aggregated',
    'mv_fretes_aggregated',
    'mv_energia_agua_aggregated',
    'mv_servicos_aggregated',
    'mv_mercadorias_participante',
    'mv_dashboard_stats'
  ) THEN
    RAISE EXCEPTION 'Invalid view name: %', p_view_name;
  END IF;

  -- Refresh the specific view (non-concurrently for RPC compatibility)
  -- Note: We assume the view is in 'extensions' schema
  EXECUTE 'REFRESH MATERIALIZED VIEW extensions.' || quote_ident(p_view_name);
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.pg_try_advisory_lock(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pg_advisory_unlock(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_specific_materialized_view(text) TO authenticated;
