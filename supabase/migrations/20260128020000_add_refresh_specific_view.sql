
-- Create function to refresh specific materialized view
-- This allows refreshing only the necessary view, improving performance

CREATE OR REPLACE FUNCTION public.refresh_specific_materialized_view(p_view_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '300s'
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    -- Whitelist allowed views to prevent SQL injection and unauthorized refreshes
    IF p_view_name = 'mv_mercadorias_participante' THEN
        REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;
    ELSIF p_view_name = 'mv_mercadorias_aggregated' THEN
        REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
    ELSIF p_view_name = 'mv_fretes_aggregated' THEN
        REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
    ELSIF p_view_name = 'mv_energia_agua_aggregated' THEN
        REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
    ELSIF p_view_name = 'mv_servicos_aggregated' THEN
        REFRESH MATERIALIZED VIEW extensions.mv_servicos_aggregated;
    ELSIF p_view_name = 'mv_dashboard_stats' THEN
        REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
    ELSE
        RAISE EXCEPTION 'View invalid or not allowed for refresh: %', p_view_name;
    END IF;
END;
$function$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.refresh_specific_materialized_view(text) TO authenticated;
