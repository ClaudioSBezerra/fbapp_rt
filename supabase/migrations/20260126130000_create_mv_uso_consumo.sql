-- Create materialized view for Uso/Consumo and Imobilizado aggregation
-- This view aggregates data by filial, period, operation type, CFOP, and participant
-- It includes participant details (name, CNPJ) for filtering in the dashboard

DROP MATERIALIZED VIEW IF EXISTS extensions.mv_uso_consumo_aggregated CASCADE;

CREATE MATERIALIZED VIEW extensions.mv_uso_consumo_aggregated AS
SELECT 
    uci.filial_id,
    COALESCE(f.nome_fantasia, f.razao_social) as filial_nome,
    uci.mes_ano,
    uci.tipo_operacao,
    uci.cfop,
    uci.cod_part,
    COALESCE(p.nome, 'Participante ' || uci.cod_part) as participante_nome,
    p.cnpj as participante_cnpj,
    SUM(uci.valor) as valor,
    SUM(uci.valor_icms) as icms,
    SUM(uci.valor_pis) as pis,
    SUM(uci.valor_cofins) as cofins
FROM public.uso_consumo_imobilizado uci
JOIN public.filiais f ON f.id = uci.filial_id
LEFT JOIN public.participantes p ON p.filial_id = uci.filial_id AND p.cod_part = uci.cod_part
GROUP BY 
    uci.filial_id, 
    COALESCE(f.nome_fantasia, f.razao_social), 
    uci.mes_ano, 
    uci.tipo_operacao, 
    uci.cfop, 
    uci.cod_part, 
    p.nome, 
    p.cnpj;

-- Create unique index for concurrent refreshes
CREATE UNIQUE INDEX idx_mv_uso_consumo_agg_pk 
ON extensions.mv_uso_consumo_aggregated(filial_id, mes_ano, tipo_operacao, cfop, cod_part);

-- Create indexes for performance
CREATE INDEX idx_mv_uso_consumo_agg_filial ON extensions.mv_uso_consumo_aggregated(filial_id);
CREATE INDEX idx_mv_uso_consumo_agg_mesano ON extensions.mv_uso_consumo_aggregated(mes_ano);
CREATE INDEX idx_mv_uso_consumo_agg_tipo ON extensions.mv_uso_consumo_aggregated(tipo_operacao);

-- Grant access to authenticated users
GRANT SELECT ON extensions.mv_uso_consumo_aggregated TO authenticated;

-- Create RPC function to access the view with RLS
DROP FUNCTION IF EXISTS public.get_mv_uso_consumo_aggregated();

CREATE OR REPLACE FUNCTION public.get_mv_uso_consumo_aggregated()
RETURNS TABLE (
    filial_id uuid,
    filial_nome text,
    mes_ano date,
    tipo_operacao varchar,
    cfop varchar,
    cod_part varchar,
    participante_nome varchar,
    participante_cnpj varchar,
    valor numeric,
    icms numeric,
    pis numeric,
    cofins numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mv.filial_id,
        mv.filial_nome,
        mv.mes_ano,
        mv.tipo_operacao::varchar,
        mv.cfop::varchar,
        mv.cod_part::varchar,
        mv.participante_nome::varchar,
        mv.participante_cnpj::varchar,
        mv.valor,
        mv.icms,
        mv.pis,
        mv.cofins
    FROM extensions.mv_uso_consumo_aggregated mv
    WHERE has_filial_access(auth.uid(), mv.filial_id)
    ORDER BY mv.mes_ano DESC, mv.valor DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mv_uso_consumo_aggregated() TO authenticated;

-- Update refresh functions to include the new view

CREATE OR REPLACE FUNCTION public.refresh_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
    REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
  ELSE
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_mercadorias_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_fretes_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_energia_agua_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_servicos_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_mercadorias_participante;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_uso_consumo_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_dashboard_stats;
  END IF;
END;
$function$;

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
    REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
  ELSE
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_mercadorias_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_fretes_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_energia_agua_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_servicos_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_mercadorias_participante;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_uso_consumo_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_dashboard_stats;
  END IF;
END;
$function$;
