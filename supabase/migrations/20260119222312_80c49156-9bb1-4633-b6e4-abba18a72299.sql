-- Criar função de consolidação em lotes para evitar timeout
CREATE OR REPLACE FUNCTION consolidar_mercadorias_batch(
    p_job_id uuid,
    p_batch_size integer DEFAULT 50000
) RETURNS jsonb AS $$
DECLARE
    v_inserted integer := 0;
    v_raw_count integer := 0;
    v_batch_count integer := 0;
    v_offset integer := 0;
BEGIN
    -- Contar registros RAW
    SELECT COUNT(*) INTO v_raw_count FROM efd_raw_c100 WHERE import_job_id = p_job_id;
    
    IF v_raw_count = 0 THEN
        RETURN jsonb_build_object('inserted', 0, 'raw_count', 0, 'message', 'No raw records');
    END IF;
    
    -- Processar em lotes usando IDs ordenados
    WHILE v_offset < v_raw_count LOOP
        WITH batch_ids AS (
            SELECT id FROM efd_raw_c100 
            WHERE import_job_id = p_job_id 
            ORDER BY id 
            LIMIT p_batch_size OFFSET v_offset
        ),
        aggregated AS (
            SELECT 
                r.filial_id, r.mes_ano, r.tipo, r.cod_part,
                SUM(r.valor) as total_valor,
                SUM(r.pis) as total_pis,
                SUM(r.cofins) as total_cofins,
                SUM(COALESCE(r.icms, 0)) as total_icms,
                SUM(COALESCE(r.ipi, 0)) as total_ipi
            FROM efd_raw_c100 r
            WHERE r.id IN (SELECT id FROM batch_ids)
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
        SELECT COUNT(*) INTO v_batch_count FROM upserted;
        
        v_inserted := v_inserted + v_batch_count;
        v_offset := v_offset + p_batch_size;
    END LOOP;
    
    -- Limpar RAW após consolidação
    DELETE FROM efd_raw_c100 WHERE import_job_id = p_job_id;
    
    RETURN jsonb_build_object('inserted', v_inserted, 'raw_count', v_raw_count, 'message', 'Batch consolidation complete');
END;
$$ LANGUAGE plpgsql;

-- Atualizar consolidar_mercadorias para usar a versão em lotes
CREATE OR REPLACE FUNCTION consolidar_mercadorias(p_job_id uuid) RETURNS jsonb AS $$
BEGIN
    RETURN consolidar_mercadorias_batch(p_job_id, 50000);
END;
$$ LANGUAGE plpgsql;