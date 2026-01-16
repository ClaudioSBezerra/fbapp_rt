-- Atualizar a função refresh_materialized_views_async para incluir todas as views
CREATE OR REPLACE FUNCTION public.refresh_materialized_views_async()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Views principais
  REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_servicos_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;
  REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
  
  -- Views de uso e consumo
  REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_detailed;
  
  -- Views detalhadas
  REFRESH MATERIALIZED VIEW extensions.mv_fretes_detailed;
  REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_detailed;
END;
$$;

-- Também atualizar a função síncrona refresh_materialized_views
CREATE OR REPLACE FUNCTION public.refresh_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- Views principais
  REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_servicos_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;
  REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
  
  -- Views de uso e consumo
  REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_detailed;
  
  -- Views detalhadas
  REFRESH MATERIALIZED VIEW extensions.mv_fretes_detailed;
  REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_detailed;
END;
$$;

-- Executar refresh imediato para atualizar os dados existentes
SELECT public.refresh_materialized_views();