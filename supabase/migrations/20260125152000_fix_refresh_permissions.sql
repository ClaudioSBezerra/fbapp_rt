-- Fix permissions for refresh functions
GRANT EXECUTE ON FUNCTION public.refresh_materialized_views() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_materialized_views_async() TO authenticated, service_role;

-- Ensure async function exists and has correct permissions
CREATE OR REPLACE FUNCTION public.refresh_materialized_views_async()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '300s'
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Always use non-concurrent refresh for RPC compatibility
  REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_servicos_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;
  REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
  -- Add newer views if they exist (using dynamic SQL or just listing them if we are sure)
  -- Based on 20260115142347, we have usage consumption views too
  PERFORM 1 FROM pg_matviews WHERE matviewname = 'mv_uso_consumo_aggregated' AND schemaname = 'extensions';
  IF FOUND THEN
    REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_aggregated;
  END IF;
  
  PERFORM 1 FROM pg_matviews WHERE matviewname = 'mv_uso_consumo_detailed' AND schemaname = 'extensions';
  IF FOUND THEN
    REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_detailed;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.refresh_materialized_views_async() TO authenticated, service_role;
