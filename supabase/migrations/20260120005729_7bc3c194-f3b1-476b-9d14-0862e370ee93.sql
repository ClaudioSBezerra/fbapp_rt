-- Fix consolidar_mercadorias_single_batch to use filial_id from raw records, not from job
-- This is needed because EFD files can contain records for multiple filiais

CREATE OR REPLACE FUNCTION consolidar_mercadorias_single_batch(
  p_job_id UUID,
  p_batch_size INT DEFAULT 10000
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT := 0;
  v_has_more BOOLEAN := FALSE;
BEGIN
  -- Process batch using CTE without ORDER BY for performance
  -- Uses filial_id and mes_ano from raw records directly (not from job)
  WITH batch AS (
    SELECT id, filial_id, mes_ano, tipo, cod_part, valor, pis, cofins, icms, ipi
    FROM efd_raw_c100
    WHERE import_job_id = p_job_id
    LIMIT p_batch_size
  ),
  aggregated AS (
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
    FROM batch
    GROUP BY filial_id, mes_ano, tipo, cod_part
  ),
  upserted AS (
    INSERT INTO mercadorias (filial_id, mes_ano, tipo, cod_part, valor, pis, cofins, icms, ipi)
    SELECT 
      a.filial_id,
      a.mes_ano,
      a.tipo,
      a.cod_part,
      a.total_valor,
      a.total_pis,
      a.total_cofins,
      a.total_icms,
      a.total_ipi
    FROM aggregated a
    ON CONFLICT (filial_id, mes_ano, tipo, COALESCE(cod_part, '__NULL__'))
    DO UPDATE SET
      valor = mercadorias.valor + EXCLUDED.valor,
      pis = mercadorias.pis + EXCLUDED.pis,
      cofins = mercadorias.cofins + EXCLUDED.cofins,
      icms = mercadorias.icms + EXCLUDED.icms,
      ipi = COALESCE(mercadorias.ipi, 0) + EXCLUDED.ipi,
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