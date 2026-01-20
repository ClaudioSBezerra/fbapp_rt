-- Função para limpar dados (filiais e movimentos) de uma Empresa, mantendo o registro da Empresa
CREATE OR REPLACE FUNCTION public.clean_empresa_data(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_filial_ids uuid[];
BEGIN
    -- Verifica permissão (Admin ou Dono do Tenant)
    IF NOT EXISTS (
        SELECT 1 
        FROM public.empresas e
        JOIN public.grupos_empresas ge ON ge.id = e.grupo_id
        JOIN public.user_tenants ut ON ut.tenant_id = ge.tenant_id
        WHERE e.id = p_empresa_id
        AND ut.user_id = auth.uid()
        AND (
            EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
            -- Removido 'OR true' inseguro
        )
    ) THEN
        RAISE EXCEPTION 'Acesso negado para limpar dados desta empresa';
    END IF;

    -- Coletar IDs das filiais que serão apagadas
    SELECT array_agg(id) INTO v_filial_ids FROM public.filiais WHERE empresa_id = p_empresa_id;

    IF v_filial_ids IS NOT NULL AND array_length(v_filial_ids, 1) > 0 THEN
        -- Limpeza explícita de tabelas filhas para evitar erros de FK se CASCADE não estiver presente
        -- e para garantir performance usando IDs filtrados
        
        DELETE FROM public.mercadorias WHERE filial_id = ANY(v_filial_ids);
        DELETE FROM public.servicos WHERE filial_id = ANY(v_filial_ids);
        DELETE FROM public.fretes WHERE filial_id = ANY(v_filial_ids);
        DELETE FROM public.energia_agua WHERE filial_id = ANY(v_filial_ids);
        DELETE FROM public.participantes WHERE filial_id = ANY(v_filial_ids);
        
        -- Finalmente, deletar as filiais
        DELETE FROM public.filiais WHERE id = ANY(v_filial_ids);
    END IF;
    
    -- O registro na tabela 'empresas' permanece intacto.
END;
$$;
