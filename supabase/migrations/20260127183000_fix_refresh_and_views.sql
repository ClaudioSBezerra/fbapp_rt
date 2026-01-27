-- Fix refresh_materialized_views to include mv_uso_consumo_detailed and fix potential sync issues

CREATE OR REPLACE FUNCTION public.refresh_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  mv_count integer;
BEGIN
  -- Check if views are populated by checking one of them
  SELECT COUNT(*) INTO mv_count FROM extensions.mv_dashboard_stats;
  
  IF mv_count = 0 THEN
    -- Initial refresh (non-concurrent)
    REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_servicos_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;
    REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_aggregated;
    -- Check if mv_uso_consumo_detailed exists before refreshing (it should, but safety first)
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'extensions' AND matviewname = 'mv_uso_consumo_detailed') THEN
        REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_detailed;
    END IF;
    REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
  ELSE
    -- Concurrent refresh
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_mercadorias_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_fretes_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_energia_agua_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_servicos_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_mercadorias_participante;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_uso_consumo_aggregated;
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'extensions' AND matviewname = 'mv_uso_consumo_detailed') THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_uso_consumo_detailed;
    END IF;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_dashboard_stats;
  END IF;
END;
$function$;

-- Update async version too
CREATE OR REPLACE FUNCTION public.refresh_materialized_views_async()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '300s'
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  mv_count integer;
BEGIN
  SELECT COUNT(*) INTO mv_count FROM extensions.mv_dashboard_stats;
  
  IF mv_count = 0 THEN
    REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_servicos_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;
    REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_aggregated;
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'extensions' AND matviewname = 'mv_uso_consumo_detailed') THEN
        REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_detailed;
    END IF;
    REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
  ELSE
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_mercadorias_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_fretes_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_energia_agua_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_servicos_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_mercadorias_participante;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_uso_consumo_aggregated;
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'extensions' AND matviewname = 'mv_uso_consumo_detailed') THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_uso_consumo_detailed;
    END IF;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_dashboard_stats;
  END IF;
END;
$function$;

-- Force a refresh now to ensure data is visible
-- Using DO block to handle errors gracefully if one view fails
DO $$
BEGIN
    REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_servicos_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;
    REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_aggregated;
    IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'extensions' AND matviewname = 'mv_uso_consumo_detailed') THEN
        REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_detailed;
    END IF;
    REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error refreshing views: %', SQLERRM;
END;
$$;
