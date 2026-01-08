-- Fix refresh_materialized_views to handle empty views
-- CONCURRENTLY fails silently when view is empty, so we need to check first

CREATE OR REPLACE FUNCTION public.refresh_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  mv_count integer;
BEGIN
  -- Check if mv_dashboard_stats is empty
  SELECT COUNT(*) INTO mv_count FROM extensions.mv_dashboard_stats;
  
  -- Use CONCURRENTLY only if view has data (CONCURRENTLY fails on empty views)
  IF mv_count = 0 THEN
    -- First time refresh without CONCURRENTLY
    REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
  ELSE
    -- Subsequent refreshes with CONCURRENTLY for non-blocking
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_mercadorias_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_fretes_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_energia_agua_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_dashboard_stats;
  END IF;
END;
$function$;

-- Execute initial refresh now (without CONCURRENTLY since views are empty)
REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;