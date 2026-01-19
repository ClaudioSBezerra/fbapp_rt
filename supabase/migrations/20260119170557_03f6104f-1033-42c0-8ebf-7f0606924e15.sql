-- ============================================================
-- CORRIGIR ISOLAMENTO DE DADOS: Agrupar por EMPRESA, não TENANT
-- ============================================================

-- Passo 1: Recriar view mv_participantes_cache com empresa_id
DROP MATERIALIZED VIEW IF EXISTS extensions.mv_participantes_cache;

CREATE MATERIALIZED VIEW extensions.mv_participantes_cache AS
SELECT 
    mv.cod_part,
    mv.participante_nome,
    mv.participante_cnpj,
    e.id as empresa_id,
    g.tenant_id,
    SUM(mv.valor) as total_valor,
    COUNT(*) as total_registros,
    BOOL_OR(mv.is_simples) as is_simples
FROM extensions.mv_mercadorias_participante mv
JOIN public.filiais f ON f.id = mv.filial_id
JOIN public.empresas e ON e.id = f.empresa_id
JOIN public.grupos_empresas g ON g.id = e.grupo_id
GROUP BY mv.cod_part, mv.participante_nome, mv.participante_cnpj, e.id, g.tenant_id;

-- Índices otimizados para a nova estrutura
CREATE INDEX idx_mv_part_cache_empresa ON extensions.mv_participantes_cache(empresa_id);
CREATE INDEX idx_mv_part_cache_tenant ON extensions.mv_participantes_cache(tenant_id);
CREATE INDEX idx_mv_part_cache_nome ON extensions.mv_participantes_cache(participante_nome);
CREATE INDEX idx_mv_part_cache_valor ON extensions.mv_participantes_cache(total_valor DESC);
CREATE INDEX idx_mv_part_cache_nome_trgm ON extensions.mv_participantes_cache 
    USING gin(participante_nome gin_trgm_ops);

GRANT SELECT ON extensions.mv_participantes_cache TO authenticated;

-- Passo 2: Corrigir função get_mercadorias_participante_lista
-- Agora filtra por EMPRESAS acessíveis ao usuário, não apenas tenant
CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_lista()
RETURNS TABLE(cod_part varchar, nome varchar, cnpj varchar)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_empresa_ids uuid[];
    v_is_admin boolean := false;
BEGIN
    -- Verificar se é admin
    SELECT EXISTS(
        SELECT 1 FROM user_roles ur 
        WHERE ur.user_id = v_user_id AND ur.role = 'admin'
    ) INTO v_is_admin;

    IF v_is_admin THEN
        -- Admin: ver todas as empresas do tenant
        SELECT ARRAY_AGG(DISTINCT e.id) INTO v_empresa_ids
        FROM empresas e
        JOIN grupos_empresas g ON g.id = e.grupo_id
        JOIN user_tenants ut ON ut.tenant_id = g.tenant_id
        WHERE ut.user_id = v_user_id;
    ELSE
        -- Usuário normal: apenas empresas vinculadas via user_empresas
        SELECT ARRAY_AGG(DISTINCT ue.empresa_id) INTO v_empresa_ids
        FROM user_empresas ue
        WHERE ue.user_id = v_user_id;
    END IF;

    IF v_empresa_ids IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        pc.cod_part::varchar,
        pc.participante_nome::varchar as nome,
        pc.participante_cnpj::varchar as cnpj
    FROM extensions.mv_participantes_cache pc
    WHERE pc.empresa_id = ANY(v_empresa_ids)
    ORDER BY pc.total_valor DESC
    LIMIT 500;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_lista() TO authenticated;