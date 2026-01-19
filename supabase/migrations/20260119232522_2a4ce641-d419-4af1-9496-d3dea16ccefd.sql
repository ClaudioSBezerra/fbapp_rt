-- 1) Create index for efficient batch selection by job
CREATE INDEX IF NOT EXISTS idx_efd_raw_c100_import_job_id ON efd_raw_c100(import_job_id);

-- 2) Drop existing functions to allow changing return types
DROP FUNCTION IF EXISTS consolidar_mercadorias_single_batch(UUID, INT);
DROP FUNCTION IF EXISTS consolidar_import_job(UUID);

-- 3) Optimized consolidar_mercadorias_single_batch: no ORDER BY, CTE-based, DELETE USING
CREATE FUNCTION consolidar_mercadorias_single_batch(
  p_job_id UUID,
  p_batch_size INT DEFAULT 10000
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filial_id UUID;
  v_mes_ano DATE;
  v_deleted INT := 0;
  v_has_more BOOLEAN := FALSE;
BEGIN
  -- Get filial_id and mes_ano from the job
  SELECT filial_id, mes_ano INTO v_filial_id, v_mes_ano
  FROM import_jobs
  WHERE id = p_job_id;
  
  IF v_filial_id IS NULL THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Job not found or no filial_id',
      'deleted_rows', 0,
      'has_more', FALSE,
      'batch_size', p_batch_size
    );
  END IF;

  -- Process batch using CTE without ORDER BY for performance
  WITH batch AS (
    SELECT id, tipo, cod_part, valor, pis, cofins, icms
    FROM efd_raw_c100
    WHERE import_job_id = p_job_id
    LIMIT p_batch_size
  ),
  aggregated AS (
    SELECT
      tipo,
      cod_part,
      SUM(valor) as total_valor,
      SUM(pis) as total_pis,
      SUM(cofins) as total_cofins,
      SUM(COALESCE(icms, 0)) as total_icms
    FROM batch
    GROUP BY tipo, cod_part
  ),
  upserted AS (
    INSERT INTO mercadorias (filial_id, mes_ano, tipo, cod_part, valor, pis, cofins, icms)
    SELECT 
      v_filial_id,
      v_mes_ano,
      a.tipo,
      a.cod_part,
      a.total_valor,
      a.total_pis,
      a.total_cofins,
      a.total_icms
    FROM aggregated a
    ON CONFLICT (filial_id, mes_ano, tipo, COALESCE(cod_part, '__NULL__'))
    DO UPDATE SET
      valor = mercadorias.valor + EXCLUDED.valor,
      pis = mercadorias.pis + EXCLUDED.pis,
      cofins = mercadorias.cofins + EXCLUDED.cofins,
      icms = mercadorias.icms + EXCLUDED.icms,
      updated_at = now()
    RETURNING 1
  ),
  deleted AS (
    DELETE FROM efd_raw_c100
    WHERE id IN (SELECT id FROM batch)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  -- Check if more records exist (lightweight EXISTS check)
  SELECT EXISTS(
    SELECT 1 FROM efd_raw_c100 WHERE import_job_id = p_job_id LIMIT 1
  ) INTO v_has_more;

  RETURN json_build_object(
    'success', TRUE,
    'deleted_rows', v_deleted,
    'has_more', v_has_more,
    'batch_size', p_batch_size
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', FALSE,
    'error', SQLERRM,
    'deleted_rows', 0,
    'has_more', TRUE,
    'batch_size', p_batch_size
  );
END;
$$;

-- 4) Update consolidar_import_job to NOT have dangerous C100 fallback
CREATE FUNCTION consolidar_import_job(p_job_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_energia_result JSON;
  v_fretes_result JSON;
  v_servicos_result JSON;
  v_c100_remaining INT;
BEGIN
  -- Check if there are still C100 records (should have been processed incrementally by edge function)
  SELECT COUNT(*) INTO v_c100_remaining FROM efd_raw_c100 WHERE import_job_id = p_job_id;
  
  IF v_c100_remaining > 0 THEN
    -- Do NOT try to consolidate C100 here - return warning instead
    -- The edge function should handle this incrementally
    RETURN json_build_object(
      'success', FALSE,
      'error', format('C100 records still pending: %s. Use incremental consolidation.', v_c100_remaining),
      'c100_remaining', v_c100_remaining
    );
  END IF;

  -- Consolidate other record types (these are typically much smaller)
  SELECT consolidar_energia_agua(p_job_id) INTO v_energia_result;
  SELECT consolidar_fretes(p_job_id) INTO v_fretes_result;
  SELECT consolidar_servicos(p_job_id) INTO v_servicos_result;

  RETURN json_build_object(
    'success', TRUE,
    'energia_agua', v_energia_result,
    'fretes', v_fretes_result,
    'servicos', v_servicos_result
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', FALSE,
    'error', SQLERRM
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION consolidar_mercadorias_single_batch(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION consolidar_import_job(UUID) TO authenticated;