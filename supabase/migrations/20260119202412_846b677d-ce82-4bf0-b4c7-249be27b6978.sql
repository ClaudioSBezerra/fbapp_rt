-- ==============================================================================
-- MIGRATION: Consolidar mercadorias para painel de participantes
-- PROBLEMA: 1.124.072 registros quando deveria haver ~117.125 (9.6x redundância)
-- SOLUÇÃO: Remover constraint antiga, consolidar, criar novo índice por agregação
-- ==============================================================================

-- 0. Remover constraint antiga que estava causando conflito
ALTER TABLE mercadorias DROP CONSTRAINT IF EXISTS mercadorias_unique_record;

-- 1. Criar tabela temporária com dados agregados
CREATE TABLE mercadorias_consolidated AS
SELECT 
    filial_id,
    tipo,
    mes_ano,
    cod_part,
    'Agregado' as descricao,
    NULL::varchar(20) as ncm,
    SUM(valor) as valor,
    SUM(pis) as pis,
    SUM(cofins) as cofins,
    SUM(COALESCE(icms, 0)) as icms,
    SUM(COALESCE(ipi, 0)) as ipi,
    now() as created_at,
    now() as updated_at
FROM mercadorias
GROUP BY filial_id, tipo, mes_ano, cod_part;

-- 2. Truncar tabela original
TRUNCATE TABLE mercadorias CASCADE;

-- 3. Inserir dados consolidados
INSERT INTO mercadorias (filial_id, tipo, mes_ano, cod_part, descricao, ncm, valor, pis, cofins, icms, ipi, created_at, updated_at)
SELECT filial_id, tipo, mes_ano, cod_part, descricao, ncm, valor, pis, cofins, icms, ipi, created_at, updated_at
FROM mercadorias_consolidated;

-- 4. Dropar tabela temporária
DROP TABLE mercadorias_consolidated;

-- 5. Criar índice único para UPSERT no parse (chave de agregação)
CREATE UNIQUE INDEX idx_mercadorias_aggregate_key 
ON mercadorias(filial_id, mes_ano, tipo, COALESCE(cod_part, '__NULL__'));

-- 6. Refresh das views (agora será muito mais rápido)
REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;
REFRESH MATERIALIZED VIEW extensions.mv_participantes_cache;
REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;