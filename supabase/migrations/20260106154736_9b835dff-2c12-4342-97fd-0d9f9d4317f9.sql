-- =====================================================
-- PHASE 1: Create Materialized Views
-- =====================================================

-- 1.1 Materialized View for Mercadorias
CREATE MATERIALIZED VIEW mv_mercadorias_aggregated AS
SELECT 
  m.filial_id,
  COALESCE(f.nome_fantasia, f.razao_social) as filial_nome,
  m.mes_ano,
  m.tipo,
  SUM(m.valor) as valor,
  SUM(m.pis) as pis,
  SUM(m.cofins) as cofins,
  SUM(COALESCE(m.icms, 0)) as icms
FROM mercadorias m
JOIN filiais f ON f.id = m.filial_id
GROUP BY m.filial_id, f.nome_fantasia, f.razao_social, m.mes_ano, m.tipo;

CREATE UNIQUE INDEX idx_mv_mercadorias_unique ON mv_mercadorias_aggregated (filial_id, mes_ano, tipo);

-- 1.2 Materialized View for Fretes
CREATE MATERIALIZED VIEW mv_fretes_aggregated AS
SELECT 
  fr.filial_id,
  COALESCE(f.nome_fantasia, f.razao_social) as filial_nome,
  fr.mes_ano,
  fr.tipo,
  SUM(fr.valor) as valor,
  SUM(fr.pis) as pis,
  SUM(fr.cofins) as cofins,
  SUM(COALESCE(fr.icms, 0)) as icms
FROM fretes fr
JOIN filiais f ON f.id = fr.filial_id
GROUP BY fr.filial_id, f.nome_fantasia, f.razao_social, fr.mes_ano, fr.tipo;

CREATE UNIQUE INDEX idx_mv_fretes_unique ON mv_fretes_aggregated (filial_id, mes_ano, tipo);

-- 1.3 Materialized View for Energia/Agua
CREATE MATERIALIZED VIEW mv_energia_agua_aggregated AS
SELECT 
  e.filial_id,
  COALESCE(f.nome_fantasia, f.razao_social) as filial_nome,
  e.mes_ano,
  e.tipo_operacao,
  e.tipo_servico,
  SUM(e.valor) as valor,
  SUM(e.pis) as pis,
  SUM(e.cofins) as cofins,
  SUM(COALESCE(e.icms, 0)) as icms
FROM energia_agua e
JOIN filiais f ON f.id = e.filial_id
GROUP BY e.filial_id, f.nome_fantasia, f.razao_social, e.mes_ano, e.tipo_operacao, e.tipo_servico;

CREATE UNIQUE INDEX idx_mv_energia_agua_unique ON mv_energia_agua_aggregated (filial_id, mes_ano, tipo_operacao, tipo_servico);

-- 1.4 Materialized View for Dashboard Stats (consolidated totals per filial)
CREATE MATERIALIZED VIEW mv_dashboard_stats AS
SELECT 
  m.filial_id,
  'mercadorias' as categoria,
  m.tipo as subtipo,
  SUM(m.valor) as valor,
  SUM(COALESCE(m.icms, 0)) as icms,
  SUM(m.pis) as pis,
  SUM(m.cofins) as cofins
FROM mercadorias m
GROUP BY m.filial_id, m.tipo
UNION ALL
SELECT 
  fr.filial_id,
  'fretes' as categoria,
  fr.tipo as subtipo,
  SUM(fr.valor) as valor,
  SUM(COALESCE(fr.icms, 0)) as icms,
  SUM(fr.pis) as pis,
  SUM(fr.cofins) as cofins
FROM fretes fr
GROUP BY fr.filial_id, fr.tipo
UNION ALL
SELECT 
  e.filial_id,
  'energia_agua' as categoria,
  e.tipo_operacao as subtipo,
  SUM(e.valor) as valor,
  SUM(COALESCE(e.icms, 0)) as icms,
  SUM(e.pis) as pis,
  SUM(e.cofins) as cofins
FROM energia_agua e
GROUP BY e.filial_id, e.tipo_operacao;

CREATE INDEX idx_mv_dashboard_stats_filial ON mv_dashboard_stats (filial_id);

-- =====================================================
-- PHASE 2: Create Refresh Function
-- =====================================================

CREATE OR REPLACE FUNCTION refresh_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_mercadorias_aggregated;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_fretes_aggregated;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_energia_agua_aggregated;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_stats;
END;
$$;

-- =====================================================
-- PHASE 3: Create RPC Functions with RLS
-- =====================================================

-- 3.1 RPC for Mercadorias Aggregated
CREATE OR REPLACE FUNCTION get_mv_mercadorias_aggregated()
RETURNS TABLE (
  filial_id uuid,
  filial_nome text,
  mes_ano date,
  tipo varchar,
  valor numeric,
  pis numeric,
  cofins numeric,
  icms numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mv.filial_id,
    mv.filial_nome,
    mv.mes_ano,
    mv.tipo::varchar,
    mv.valor,
    mv.pis,
    mv.cofins,
    mv.icms
  FROM mv_mercadorias_aggregated mv
  WHERE has_filial_access(auth.uid(), mv.filial_id)
  ORDER BY mv.mes_ano DESC;
END;
$$;

-- 3.2 RPC for Fretes Aggregated
CREATE OR REPLACE FUNCTION get_mv_fretes_aggregated()
RETURNS TABLE (
  filial_id uuid,
  filial_nome text,
  mes_ano date,
  tipo varchar,
  valor numeric,
  pis numeric,
  cofins numeric,
  icms numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mv.filial_id,
    mv.filial_nome,
    mv.mes_ano,
    mv.tipo::varchar,
    mv.valor,
    mv.pis,
    mv.cofins,
    mv.icms
  FROM mv_fretes_aggregated mv
  WHERE has_filial_access(auth.uid(), mv.filial_id)
  ORDER BY mv.mes_ano DESC;
END;
$$;

-- 3.3 RPC for Energia/Agua Aggregated
CREATE OR REPLACE FUNCTION get_mv_energia_agua_aggregated()
RETURNS TABLE (
  filial_id uuid,
  filial_nome text,
  mes_ano date,
  tipo_operacao varchar,
  tipo_servico varchar,
  valor numeric,
  pis numeric,
  cofins numeric,
  icms numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mv.filial_id,
    mv.filial_nome,
    mv.mes_ano,
    mv.tipo_operacao::varchar,
    mv.tipo_servico::varchar,
    mv.valor,
    mv.pis,
    mv.cofins,
    mv.icms
  FROM mv_energia_agua_aggregated mv
  WHERE has_filial_access(auth.uid(), mv.filial_id)
  ORDER BY mv.mes_ano DESC;
END;
$$;

-- 3.4 RPC for Dashboard Stats
CREATE OR REPLACE FUNCTION get_mv_dashboard_stats()
RETURNS TABLE (
  categoria text,
  subtipo text,
  valor numeric,
  icms numeric,
  pis numeric,
  cofins numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mv.categoria,
    mv.subtipo,
    SUM(mv.valor) as valor,
    SUM(mv.icms) as icms,
    SUM(mv.pis) as pis,
    SUM(mv.cofins) as cofins
  FROM mv_dashboard_stats mv
  WHERE has_filial_access(auth.uid(), mv.filial_id)
  GROUP BY mv.categoria, mv.subtipo;
END;
$$;