-- Corrigir função refresh_materialized_views
DROP FUNCTION IF EXISTS public.refresh_materialized_views();

CREATE OR REPLACE FUNCTION public.refresh_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '300s'
SET search_path = public, extensions
AS $$
BEGIN
  -- Always use non-concurrent refresh for RPC compatibility
  REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_servicos_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;
  REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
  REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_aggregated;
END;
$$;