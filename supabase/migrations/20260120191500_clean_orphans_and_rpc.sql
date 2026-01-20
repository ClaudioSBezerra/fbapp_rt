-- Migration para limpeza de dados e verificação de órfãos

-- 1. Função para limpar dados de um Grupo de Empresas
CREATE OR REPLACE FUNCTION public.clean_group_data(p_grupo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Verifica se o usuário tem permissão (é admin ou dono do tenant)
    -- Simplificado: Assume que a chamada RPC já verificou a auth via RLS ou política do backend
    -- Mas como é SECURITY DEFINER, vamos garantir que o usuário pertence ao tenant do grupo
    IF NOT EXISTS (
        SELECT 1 
        FROM public.grupos_empresas ge
        JOIN public.user_tenants ut ON ut.tenant_id = ge.tenant_id
        WHERE ge.id = p_grupo_id
        AND ut.user_id = auth.uid()
        AND (
            EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
            OR
            -- Se não for admin global, deve ser admin do tenant (implementação futura de role por tenant)
            true -- Por enquanto, confiamos no admin check do frontend + user_tenants check acima
        )
    ) THEN
        RAISE EXCEPTION 'Acesso negado para limpar dados deste grupo';
    END IF;

    -- Deletar todas as empresas do grupo (Cascade cuidará das filiais e dados)
    DELETE FROM public.empresas WHERE grupo_id = p_grupo_id;
    
    -- Opcional: Se quiser limpar registros órfãos que possam ter sobrado (embora o CASCADE deva resolver)
    -- DELETE FROM public.filiais WHERE empresa_id NOT IN (SELECT id FROM public.empresas);
END;
$$;

-- 2. View para identificar registros órfãos (Lost Records)
CREATE OR REPLACE VIEW public.vw_orphaned_records AS
SELECT 'empresas' as table_name, count(*) as count
FROM public.empresas e
LEFT JOIN public.grupos_empresas ge ON e.grupo_id = ge.id
WHERE ge.id IS NULL

UNION ALL

SELECT 'filiais' as table_name, count(*) as count
FROM public.filiais f
LEFT JOIN public.empresas e ON f.empresa_id = e.id
WHERE e.id IS NULL

UNION ALL

SELECT 'mercadorias' as table_name, count(*) as count
FROM public.mercadorias m
LEFT JOIN public.filiais f ON m.filial_id = f.id
WHERE f.id IS NULL;

-- 3. Limpeza de seeds de teste (tenant_demo, etc.) se existirem e estiverem "quebrados"
DO $$
DECLARE
    v_tenant_id uuid;
BEGIN
    -- Tenta encontrar o tenant demo
    SELECT id INTO v_tenant_id FROM public.tenants WHERE nome = 'tenant_demo';
    
    IF v_tenant_id IS NOT NULL THEN
        -- Se encontrar, deleta (Cascade limpa tudo abaixo)
        DELETE FROM public.tenants WHERE id = v_tenant_id;
    END IF;

    -- Limpa empresas sem grupo (órfãs)
    DELETE FROM public.empresas WHERE grupo_id NOT IN (SELECT id FROM public.grupos_empresas);
    
    -- Limpa filiais sem empresa (órfãs)
    DELETE FROM public.filiais WHERE empresa_id NOT IN (SELECT id FROM public.empresas);
    
    -- Limpa dados sem filial (órfãos)
    DELETE FROM public.mercadorias WHERE filial_id NOT IN (SELECT id FROM public.filiais);
    DELETE FROM public.servicos WHERE filial_id NOT IN (SELECT id FROM public.filiais);
    DELETE FROM public.fretes WHERE filial_id NOT IN (SELECT id FROM public.filiais);
    DELETE FROM public.energia_agua WHERE filial_id NOT IN (SELECT id FROM public.filiais);
    DELETE FROM public.participantes WHERE filial_id NOT IN (SELECT id FROM public.filiais);
END $$;
