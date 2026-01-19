-- Create single-batch consolidation function for incremental processing
-- Each call processes exactly one batch of 50k records, staying within timeout limits

CREATE OR REPLACE FUNCTION consolidar_mercadorias_single_batch(
    p_job_id uuid,
    p_batch_size integer DEFAULT 50000
) RETURNS jsonb 
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_processed integer := 0;
    v_remaining integer := 0;
    v_batch_ids uuid[];
    v_filial_id uuid;
BEGIN
    -- Get filial_id from job for filtering
    SELECT filial_id INTO v_filial_id FROM import_jobs WHERE id = p_job_id;
    
    -- Get IDs of next batch to process
    SELECT ARRAY_AGG(id) INTO v_batch_ids
    FROM (
        SELECT id FROM efd_raw_c100 
        WHERE import_job_id = p_job_id 
        ORDER BY id 
        LIMIT p_batch_size
    ) sub;
    
    -- If no records, return early
    IF v_batch_ids IS NULL OR array_length(v_batch_ids, 1) = 0 THEN
        RETURN jsonb_build_object(
            'processed', 0, 
            'remaining', 0, 
            'has_more', false,
            'message', 'No raw records to process'
        );
    END IF;
    
    -- Aggregate and upsert into mercadorias
    WITH aggregated AS (
        SELECT 
            r.filial_id, 
            r.mes_ano, 
            r.tipo, 
            r.cod_part,
            SUM(r.valor) as total_valor,
            SUM(r.pis) as total_pis,
            SUM(r.cofins) as total_cofins,
            SUM(COALESCE(r.icms, 0)) as total_icms,
            SUM(COALESCE(r.ipi, 0)) as total_ipi
        FROM efd_raw_c100 r
        WHERE r.id = ANY(v_batch_ids)
        GROUP BY r.filial_id, r.mes_ano, r.tipo, r.cod_part
    ),
    upserted AS (
        INSERT INTO mercadorias (filial_id, mes_ano, tipo, cod_part, descricao, valor, pis, cofins, icms, ipi)
        SELECT filial_id, mes_ano, tipo, cod_part, 'Agregado', total_valor, total_pis, total_cofins, total_icms, total_ipi
        FROM aggregated
        ON CONFLICT (filial_id, mes_ano, tipo, COALESCE(cod_part, '__NULL__'))
        DO UPDATE SET 
            valor = mercadorias.valor + EXCLUDED.valor,
            pis = mercadorias.pis + EXCLUDED.pis,
            cofins = mercadorias.cofins + EXCLUDED.cofins,
            icms = COALESCE(mercadorias.icms, 0) + EXCLUDED.icms,
            ipi = COALESCE(mercadorias.ipi, 0) + EXCLUDED.ipi,
            updated_at = now()
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_processed FROM upserted;
    
    -- Delete processed raw records
    DELETE FROM efd_raw_c100 WHERE id = ANY(v_batch_ids);
    
    -- Count remaining records
    SELECT COUNT(*) INTO v_remaining FROM efd_raw_c100 WHERE import_job_id = p_job_id;
    
    RETURN jsonb_build_object(
        'processed', v_processed, 
        'remaining', v_remaining, 
        'has_more', v_remaining > 0,
        'batch_size', array_length(v_batch_ids, 1)
    );
END;
$$;

-- Update consolidar_import_job to call single batch for C100 in a loop-like manner
-- But since we can't do external RPC loops from SQL, we'll let the edge function handle the loop
-- This function now handles only non-C100 consolidations

CREATE OR REPLACE FUNCTION consolidar_import_job(p_job_id uuid) RETURNS jsonb 
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_mercadorias_result jsonb;
    v_energia_result jsonb;
    v_fretes_result jsonb;
    v_servicos_result jsonb;
    v_raw_c100_count integer;
BEGIN
    -- Check if there are still raw C100 records (should be 0 if edge function processed them)
    SELECT COUNT(*) INTO v_raw_c100_count FROM efd_raw_c100 WHERE import_job_id = p_job_id;
    
    IF v_raw_c100_count > 0 THEN
        -- Fallback: process remaining C100 in batches (for backwards compatibility)
        -- This will likely timeout for large files, but edge function should handle this
        v_mercadorias_result := consolidar_mercadorias_batch(p_job_id, 50000);
    ELSE
        v_mercadorias_result := jsonb_build_object('inserted', 0, 'message', 'Already processed by edge function');
    END IF;
    
    -- Consolidate other record types (these are typically much smaller)
    v_energia_result := consolidar_energia_agua(p_job_id);
    v_fretes_result := consolidar_fretes(p_job_id);
    v_servicos_result := consolidar_servicos(p_job_id);
    
    RETURN jsonb_build_object(
        'mercadorias', v_mercadorias_result,
        'energia_agua', v_energia_result,
        'fretes', v_fretes_result,
        'servicos', v_servicos_result
    );
END;
$$;