-- Fix refresh_materialized_views_async to use non-concurrent refresh
-- This is required because PostgREST executes RPCs inside a transaction,
-- and REFRESH MATERIALIZED VIEW CONCURRENTLY cannot run inside a transaction.
-- This aligns with the operational logic from simula-tribut-rio.

CREATE OR REPLACE FUNCTION public.refresh_materialized_views_async()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '300s'
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Always use non-concurrent refresh for RPC compatibility
  -- Core views (Contribuições)
  REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_servicos_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;
  REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
  
  -- ICMS views (fbapp_rt specific)
  IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'extensions' AND matviewname = 'mv_uso_consumo_aggregated') THEN
      REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_aggregated;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'extensions' AND matviewname = 'mv_uso_consumo_detailed') THEN
      REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_detailed;
  END IF;
END;
$function$;
