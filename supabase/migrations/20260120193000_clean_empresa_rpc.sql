-- Função para limpar dados (filiais e movimentos) de uma Empresa, mantendo o registro da Empresa
CREATE OR REPLACE FUNCTION public.clean_empresa_data(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_filial_ids uuid[];
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
        
        -- IMPORTANTE: Ordem de exclusão é crítica devido às FKs
        -- 1. Tabelas de movimento (dependem de Filiais e Participantes)
        DELETE FROM public.mercadorias WHERE filial_id = ANY(v_filial_ids);
        DELETE FROM public.servicos WHERE filial_id = ANY(v_filial_ids);
        DELETE FROM public.fretes WHERE filial_id = ANY(v_filial_ids);
        DELETE FROM public.energia_agua WHERE filial_id = ANY(v_filial_ids);
        DELETE FROM public.import_jobs WHERE filial_id = ANY(v_filial_ids);
        
        -- 2. Participantes (dependem de Filiais, mas Mercadorias dependem deles)
        -- Como já apagamos mercadorias acima, agora é seguro apagar participantes
        DELETE FROM public.participantes WHERE filial_id = ANY(v_filial_ids);
        
        -- 3. Finalmente, deletar as filiais
        DELETE FROM public.filiais WHERE id = ANY(v_filial_ids);
        
        -- Refresh views para refletir a limpeza imediatamente
        PERFORM public.refresh_materialized_views_async();
    END IF;
    
    -- O registro na tabela 'empresas' permanece intacto.
END;
$$;
