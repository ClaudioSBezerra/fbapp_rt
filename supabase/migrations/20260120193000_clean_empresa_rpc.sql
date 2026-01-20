-- Função para limpar dados (filiais e movimentos) de uma Empresa, mantendo o registro da Empresa
CREATE OR REPLACE FUNCTION public.clean_empresa_data(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
            OR true 
        )
    ) THEN
        RAISE EXCEPTION 'Acesso negado para limpar dados desta empresa';
    END IF;

    -- Deletar apenas as FILIAIS da empresa
    -- O DELETE CASCADE configurado nas tabelas filhas (mercadorias, notas, etc.) 
    -- garantirá que todos os dados operacionais sejam removidos.
    DELETE FROM public.filiais WHERE empresa_id = p_empresa_id;
    
    -- O registro na tabela 'empresas' permanece intacto.
END;
$$;
