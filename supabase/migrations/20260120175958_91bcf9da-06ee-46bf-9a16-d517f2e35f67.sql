-- ============================================
-- CONSOLIDAR DUPLICADOS EM SERVICOS
-- ============================================

-- Primeiro, criar tabela temporária com dados agregados
CREATE TEMP TABLE servicos_aggregated AS
SELECT 
  filial_id, 
  mes_ano, 
  tipo, 
  valor, 
  pis, 
  cofins, 
  iss,
  MAX(descricao) as descricao,
  MAX(ncm) as ncm,
  MIN(created_at) as created_at,
  MAX(updated_at) as updated_at
FROM servicos
GROUP BY filial_id, mes_ano, tipo, valor, pis, cofins, iss;

-- Deletar todos os registros originais
DELETE FROM servicos;

-- Reinserir dados consolidados
INSERT INTO servicos (filial_id, mes_ano, tipo, valor, pis, cofins, iss, descricao, ncm, created_at, updated_at)
SELECT filial_id, mes_ano, tipo, valor, pis, cofins, iss, descricao, ncm, created_at, updated_at
FROM servicos_aggregated;

-- Limpar tabela temporária
DROP TABLE IF EXISTS servicos_aggregated;

-- Agora criar o índice único
CREATE UNIQUE INDEX IF NOT EXISTS idx_servicos_upsert_key 
ON public.servicos (filial_id, mes_ano, tipo, valor, pis, cofins, iss);