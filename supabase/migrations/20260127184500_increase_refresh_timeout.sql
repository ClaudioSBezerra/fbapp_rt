-- Increase statement_timeout for refresh_materialized_views to prevent 500 errors
-- Also re-apply get_demo_status just in case it was missing or had issues

CREATE OR REPLACE FUNCTION public.refresh_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
SET statement_timeout TO '300s' -- 5 minutes timeout
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

-- Re-ensure get_demo_status exists and has correct permissions
CREATE OR REPLACE FUNCTION public.get_demo_status()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_demo_id uuid := '11111111-1111-1111-1111-111111111111';
    v_has_data boolean;
BEGIN
    -- Check if there is data for the demo tenant
    -- We can check if there are any mercadorias for this tenant's companies
    SELECT EXISTS (
        SELECT 1 
        FROM mercadorias m
        JOIN filiais f ON f.id = m.filial_id
        JOIN empresas e ON e.id = f.empresa_id
        JOIN grupos_empresas g ON g.id = e.grupo_id
        WHERE g.tenant_id = v_demo_id
        LIMIT 1
    ) INTO v_has_data;

    RETURN json_build_object(
        'status', 'ready', 
        'has_data', v_has_data,
        'message', CASE WHEN v_has_data THEN 'Dados de demonstração disponíveis' ELSE 'Ambiente de demonstração vazio' END
    );
END;
$$;

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION public.get_demo_status() TO authenticated;
