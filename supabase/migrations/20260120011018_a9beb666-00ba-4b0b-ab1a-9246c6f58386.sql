-- =====================================================
-- PARTE 1: LIMPEZA DAS TABELAS RAW (TRUNCATE)
-- =====================================================
TRUNCATE TABLE efd_raw_c100;
TRUNCATE TABLE efd_raw_c500;
TRUNCATE TABLE efd_raw_fretes;
TRUNCATE TABLE efd_raw_a100;

-- Limpar import_jobs com status problemáticos
DELETE FROM import_jobs WHERE status IN ('failed', 'cancelled', 'processing');

-- =====================================================
-- PARTE 2: FUNÇÕES DE CONSOLIDAÇÃO STANDALONE
-- =====================================================

-- Função para consolidar efd_raw_c100 -> mercadorias
CREATE OR REPLACE FUNCTION consolidar_raw_c100_batch(
  p_batch_size INTEGER DEFAULT 10000
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_inserted INTEGER := 0;
  v_updated INTEGER := 0;
  v_remaining INTEGER;
  v_batch_ids UUID[];
BEGIN
  -- Buscar IDs do próximo batch
  SELECT ARRAY_AGG(id) INTO v_batch_ids
  FROM (
    SELECT id FROM efd_raw_c100 LIMIT p_batch_size
  ) sub;
  
  IF v_batch_ids IS NULL OR array_length(v_batch_ids, 1) IS NULL THEN
    SELECT COUNT(*) INTO v_remaining FROM efd_raw_c100;
    RETURN json_build_object(
      'success', true,
      'processed', 0,
      'inserted', 0,
      'updated', 0,
      'remaining', v_remaining,
      'has_more', false
    );
  END IF;
  
  v_processed := array_length(v_batch_ids, 1);
  
  -- UPSERT agregado para mercadorias
  WITH aggregated AS (
    SELECT 
      filial_id,
      mes_ano,
      tipo,
      cod_part,
      SUM(valor) as total_valor,
      SUM(pis) as total_pis,
      SUM(cofins) as total_cofins,
      SUM(COALESCE(icms, 0)) as total_icms,
      SUM(COALESCE(ipi, 0)) as total_ipi
    FROM efd_raw_c100
    WHERE id = ANY(v_batch_ids)
    GROUP BY filial_id, mes_ano, tipo, cod_part
  ),
  upserted AS (
    INSERT INTO mercadorias (filial_id, mes_ano, tipo, cod_part, valor, pis, cofins, icms, ipi)
    SELECT 
      filial_id, mes_ano, tipo, cod_part,
      total_valor, total_pis, total_cofins, total_icms, total_ipi
    FROM aggregated
    ON CONFLICT (filial_id, mes_ano, tipo, COALESCE(cod_part, '__NULL__'))
    DO UPDATE SET
      valor = mercadorias.valor + EXCLUDED.valor,
      pis = mercadorias.pis + EXCLUDED.pis,
      cofins = mercadorias.cofins + EXCLUDED.cofins,
      icms = COALESCE(mercadorias.icms, 0) + COALESCE(EXCLUDED.icms, 0),
      ipi = COALESCE(mercadorias.ipi, 0) + COALESCE(EXCLUDED.ipi, 0),
      updated_at = NOW()
    RETURNING (xmax = 0) as was_inserted
  )
  SELECT 
    COUNT(*) FILTER (WHERE was_inserted) as ins,
    COUNT(*) FILTER (WHERE NOT was_inserted) as upd
  INTO v_inserted, v_updated
  FROM upserted;
  
  -- Deletar registros processados
  DELETE FROM efd_raw_c100 WHERE id = ANY(v_batch_ids);
  
  -- Contar restantes
  SELECT COUNT(*) INTO v_remaining FROM efd_raw_c100;
  
  RETURN json_build_object(
    'success', true,
    'processed', v_processed,
    'inserted', v_inserted,
    'updated', v_updated,
    'remaining', v_remaining,
    'has_more', v_remaining > 0
  );
END;
$$;

-- Função para consolidar efd_raw_c500 -> energia_agua
CREATE OR REPLACE FUNCTION consolidar_raw_c500_batch(
  p_batch_size INTEGER DEFAULT 10000
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_inserted INTEGER := 0;
  v_remaining INTEGER;
  v_batch_ids UUID[];
BEGIN
  SELECT ARRAY_AGG(id) INTO v_batch_ids
  FROM (
    SELECT id FROM efd_raw_c500 LIMIT p_batch_size
  ) sub;
  
  IF v_batch_ids IS NULL OR array_length(v_batch_ids, 1) IS NULL THEN
    SELECT COUNT(*) INTO v_remaining FROM efd_raw_c500;
    RETURN json_build_object(
      'success', true,
      'processed', 0,
      'inserted', 0,
      'remaining', v_remaining,
      'has_more', false
    );
  END IF;
  
  v_processed := array_length(v_batch_ids, 1);
  
  -- Inserir diretamente (energia_agua não tem unique constraint para UPSERT)
  INSERT INTO energia_agua (filial_id, mes_ano, tipo_operacao, tipo_servico, cnpj_fornecedor, valor, pis, cofins, icms)
  SELECT 
    filial_id, mes_ano, tipo_operacao, tipo_servico, cnpj_fornecedor,
    valor, pis, cofins, COALESCE(icms, 0)
  FROM efd_raw_c500
  WHERE id = ANY(v_batch_ids);
  
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  
  DELETE FROM efd_raw_c500 WHERE id = ANY(v_batch_ids);
  
  SELECT COUNT(*) INTO v_remaining FROM efd_raw_c500;
  
  RETURN json_build_object(
    'success', true,
    'processed', v_processed,
    'inserted', v_inserted,
    'remaining', v_remaining,
    'has_more', v_remaining > 0
  );
END;
$$;

-- Função para consolidar efd_raw_fretes -> fretes
CREATE OR REPLACE FUNCTION consolidar_raw_fretes_batch(
  p_batch_size INTEGER DEFAULT 10000
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_inserted INTEGER := 0;
  v_remaining INTEGER;
  v_batch_ids UUID[];
BEGIN
  SELECT ARRAY_AGG(id) INTO v_batch_ids
  FROM (
    SELECT id FROM efd_raw_fretes LIMIT p_batch_size
  ) sub;
  
  IF v_batch_ids IS NULL OR array_length(v_batch_ids, 1) IS NULL THEN
    SELECT COUNT(*) INTO v_remaining FROM efd_raw_fretes;
    RETURN json_build_object(
      'success', true,
      'processed', 0,
      'inserted', 0,
      'remaining', v_remaining,
      'has_more', false
    );
  END IF;
  
  v_processed := array_length(v_batch_ids, 1);
  
  INSERT INTO fretes (filial_id, mes_ano, tipo, cnpj_transportadora, valor, pis, cofins, icms)
  SELECT 
    filial_id, mes_ano, tipo, cnpj_transportadora,
    valor, pis, cofins, COALESCE(icms, 0)
  FROM efd_raw_fretes
  WHERE id = ANY(v_batch_ids);
  
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  
  DELETE FROM efd_raw_fretes WHERE id = ANY(v_batch_ids);
  
  SELECT COUNT(*) INTO v_remaining FROM efd_raw_fretes;
  
  RETURN json_build_object(
    'success', true,
    'processed', v_processed,
    'inserted', v_inserted,
    'remaining', v_remaining,
    'has_more', v_remaining > 0
  );
END;
$$;

-- Função para consolidar efd_raw_a100 -> servicos
CREATE OR REPLACE FUNCTION consolidar_raw_a100_batch(
  p_batch_size INTEGER DEFAULT 10000
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_processed INTEGER := 0;
  v_inserted INTEGER := 0;
  v_remaining INTEGER;
  v_batch_ids UUID[];
BEGIN
  SELECT ARRAY_AGG(id) INTO v_batch_ids
  FROM (
    SELECT id FROM efd_raw_a100 LIMIT p_batch_size
  ) sub;
  
  IF v_batch_ids IS NULL OR array_length(v_batch_ids, 1) IS NULL THEN
    SELECT COUNT(*) INTO v_remaining FROM efd_raw_a100;
    RETURN json_build_object(
      'success', true,
      'processed', 0,
      'inserted', 0,
      'remaining', v_remaining,
      'has_more', false
    );
  END IF;
  
  v_processed := array_length(v_batch_ids, 1);
  
  INSERT INTO servicos (filial_id, mes_ano, tipo, valor, pis, cofins, iss)
  SELECT 
    filial_id, mes_ano, tipo,
    valor, pis, cofins, COALESCE(iss, 0)
  FROM efd_raw_a100
  WHERE id = ANY(v_batch_ids);
  
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  
  DELETE FROM efd_raw_a100 WHERE id = ANY(v_batch_ids);
  
  SELECT COUNT(*) INTO v_remaining FROM efd_raw_a100;
  
  RETURN json_build_object(
    'success', true,
    'processed', v_processed,
    'inserted', v_inserted,
    'remaining', v_remaining,
    'has_more', v_remaining > 0
  );
END;
$$;

-- =====================================================
-- PARTE 3: GARANTIR ÍNDICE ÚNICO PARA MERCADORIAS
-- =====================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_mercadorias_aggregate_key 
ON mercadorias (filial_id, mes_ano, tipo, COALESCE(cod_part, '__NULL__'));

-- =====================================================
-- PARTE 4: GRANTS DE PERMISSÃO
-- =====================================================
GRANT EXECUTE ON FUNCTION consolidar_raw_c100_batch(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION consolidar_raw_c500_batch(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION consolidar_raw_fretes_batch(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION consolidar_raw_a100_batch(INTEGER) TO authenticated;