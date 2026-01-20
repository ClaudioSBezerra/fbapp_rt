-- Função para limpar dados (filiais e movimentos) de uma Empresa, mantendo o registro da Empresa
CREATE OR REPLACE FUNCTION public.clean_empresa_data(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '600s' -- Aumentar timeout para 10 minutos
AS $$
DECLARE
    v_filial_ids uuid[];
    v_batch_size int := 5000; -- Tamanho do lote para deleção
    v_rows_deleted int;
BEGIN
    -- Verifica permissão (Admin ou Usuário com acesso ao Tenant)
    IF NOT EXISTS (
        SELECT 1 
        FROM public.empresas e
        JOIN public.grupos_empresas ge ON ge.id = e.grupo_id
        JOIN public.user_tenants ut ON ut.tenant_id = ge.tenant_id
        WHERE e.id = p_empresa_id
        AND ut.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Acesso negado para limpar dados desta empresa';
    END IF;

    -- Coletar IDs das filiais que serão apagadas
    SELECT array_agg(id) INTO v_filial_ids FROM public.filiais WHERE empresa_id = p_empresa_id;

    IF v_filial_ids IS NOT NULL AND array_length(v_filial_ids, 1) > 0 THEN
        
        -- Loop de Deleção para evitar Timeouts e estouro de log de transação
        
        -- 1. Mercadorias
        LOOP
            DELETE FROM public.mercadorias 
            WHERE id IN (
                SELECT id FROM public.mercadorias 
                WHERE filial_id = ANY(v_filial_ids) 
                LIMIT v_batch_size
            );
            GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
            EXIT WHEN v_rows_deleted = 0;
        END LOOP;

        -- 2. Serviços
        LOOP
            DELETE FROM public.servicos 
            WHERE id IN (
                SELECT id FROM public.servicos 
                WHERE filial_id = ANY(v_filial_ids) 
                LIMIT v_batch_size
            );
            GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
            EXIT WHEN v_rows_deleted = 0;
        END LOOP;

        -- 3. Fretes
        LOOP
            DELETE FROM public.fretes 
            WHERE id IN (
                SELECT id FROM public.fretes 
                WHERE filial_id = ANY(v_filial_ids) 
                LIMIT v_batch_size
            );
            GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
            EXIT WHEN v_rows_deleted = 0;
        END LOOP;

        -- 4. Energia e Água
        LOOP
            DELETE FROM public.energia_agua 
            WHERE id IN (
                SELECT id FROM public.energia_agua 
                WHERE filial_id = ANY(v_filial_ids) 
                LIMIT v_batch_size
            );
            GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
            EXIT WHEN v_rows_deleted = 0;
        END LOOP;
        
        -- 5. Uso Consumo Imobilizado (Tabela encontrada na busca)
        LOOP
            DELETE FROM public.uso_consumo_imobilizado 
            WHERE id IN (
                SELECT id FROM public.uso_consumo_imobilizado 
                WHERE filial_id = ANY(v_filial_ids) 
                LIMIT v_batch_size
            );
            GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
            EXIT WHEN v_rows_deleted = 0;
        END LOOP;

        -- 6. Import Jobs (Logs são apagados via Cascade)
        LOOP
            DELETE FROM public.import_jobs 
            WHERE id IN (
                SELECT id FROM public.import_jobs 
                WHERE filial_id = ANY(v_filial_ids) 
                LIMIT v_batch_size
            );
            GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
            EXIT WHEN v_rows_deleted = 0;
        END LOOP;
        
        -- 7. Participantes (Agora seguro apagar pois filhos foram removidos)
        LOOP
            DELETE FROM public.participantes 
            WHERE id IN (
                SELECT id FROM public.participantes 
                WHERE filial_id = ANY(v_filial_ids) 
                LIMIT v_batch_size
            );
            GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
            EXIT WHEN v_rows_deleted = 0;
        END LOOP;
        
        -- 8. Finalmente, deletar as filiais
        DELETE FROM public.filiais WHERE id = ANY(v_filial_ids);
        
        -- Refresh views para refletir a limpeza imediatamente
        PERFORM public.refresh_materialized_views_async();
    END IF;
    
    -- O registro na tabela 'empresas' permanece intacto.
END;
$$;
