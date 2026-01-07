-- Drop the existing materialized view and recreate with mes_ano
DROP MATERIALIZED VIEW IF EXISTS extensions.mv_dashboard_stats;

CREATE MATERIALIZED VIEW extensions.mv_dashboard_stats AS
-- Mercadorias
SELECT 
  m.filial_id,
  'mercadorias'::text as categoria,
  m.tipo::text as subtipo,
  m.mes_ano,
  SUM(m.valor) as valor,
  SUM(COALESCE(m.icms, 0)) as icms,
  SUM(m.pis) as pis,
  SUM(m.cofins) as cofins
FROM mercadorias m
GROUP BY m.filial_id, m.tipo, m.mes_ano

UNION ALL

-- Fretes
SELECT 
  fr.filial_id,
  'fretes'::text as categoria,
  fr.tipo::text as subtipo,
  fr.mes_ano,
  SUM(fr.valor) as valor,
  SUM(COALESCE(fr.icms, 0)) as icms,
  SUM(fr.pis) as pis,
  SUM(fr.cofins) as cofins
FROM fretes fr
GROUP BY fr.filial_id, fr.tipo, fr.mes_ano

UNION ALL

-- Energia/Água
SELECT 
  e.filial_id,
  'energia_agua'::text as categoria,
  e.tipo_operacao::text as subtipo,
  e.mes_ano,
  SUM(e.valor) as valor,
  SUM(COALESCE(e.icms, 0)) as icms,
  SUM(e.pis) as pis,
  SUM(e.cofins) as cofins
FROM energia_agua e
GROUP BY e.filial_id, e.tipo_operacao, e.mes_ano;

-- Create unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_mv_dashboard_stats_unique 
ON extensions.mv_dashboard_stats (filial_id, categoria, subtipo, mes_ano);

-- Drop and recreate the RPC function with optional mes_ano filter
DROP FUNCTION IF EXISTS public.get_mv_dashboard_stats();

CREATE OR REPLACE FUNCTION public.get_mv_dashboard_stats(_mes_ano date DEFAULT NULL)
 RETURNS TABLE(categoria text, subtipo text, mes_ano date, valor numeric, icms numeric, pis numeric, cofins numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    mv.categoria,
    mv.subtipo,
    mv.mes_ano,
    SUM(mv.valor) as valor,
    SUM(mv.icms) as icms,
    SUM(mv.pis) as pis,
    SUM(mv.cofins) as cofins
  FROM extensions.mv_dashboard_stats mv
  WHERE has_filial_access(auth.uid(), mv.filial_id)
    AND (_mes_ano IS NULL OR mv.mes_ano = _mes_ano)
  GROUP BY mv.categoria, mv.subtipo, mv.mes_ano;
END;
$function$;

-- Refresh the materialized view
REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;