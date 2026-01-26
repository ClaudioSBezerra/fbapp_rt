-- Update refresh_materialized_views_async to include ICMS views
-- This ensures automatic refresh works for EFD ICMS imports

CREATE OR REPLACE FUNCTION public.refresh_materialized_views_async()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '300s'
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Always use non-concurrent refresh for RPC compatibility
  -- Refresh Core Views
  REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_servicos_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;
  REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
  
  -- Refresh ICMS Views
  REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_detailed;
END;
$function$;
