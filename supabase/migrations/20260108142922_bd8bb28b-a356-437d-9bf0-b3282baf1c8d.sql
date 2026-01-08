-- Create async version of refresh_materialized_views with longer timeout
CREATE OR REPLACE FUNCTION public.refresh_materialized_views_async()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '300s'
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  mv_count integer;
BEGIN
  SELECT COUNT(*) INTO mv_count FROM extensions.mv_dashboard_stats;
  
  IF mv_count = 0 THEN
    REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_servicos_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
  ELSE
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_mercadorias_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_fretes_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_energia_agua_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_servicos_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_dashboard_stats;
  END IF;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.refresh_materialized_views_async() TO authenticated;