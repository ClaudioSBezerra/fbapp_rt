-- Optimize RPC Functions with Direct Join Access Control and Company Filtering
-- Adopts simula-tribut-rio logic for performance while maintaining fbapp_rt features (p_empresa_id, p_only_simples)

-- 1. get_mercadorias_participante_totals
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_totals(date, text, boolean, uuid);

CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_totals(
    p_mes_ano date DEFAULT NULL, 
    p_participante text DEFAULT NULL,
    p_only_simples boolean DEFAULT NULL,
    p_empresa_id uuid DEFAULT NULL
)
RETURNS TABLE(
    total_registros bigint,
    total_valor numeric,
    total_entradas_valor numeric,
    total_entradas_pis numeric,
    total_entradas_cofins numeric,
    total_entradas_icms numeric,
    total_saidas_valor numeric,
    total_saidas_pis numeric,
    total_saidas_cofins numeric,
    total_saidas_icms numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::bigint as total_registros,
        COALESCE(SUM(sub.valor), 0) as total_valor,
        COALESCE(SUM(CASE WHEN sub.tipo = 'entrada' THEN sub.valor ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN sub.tipo = 'entrada' THEN sub.pis ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN sub.tipo = 'entrada' THEN sub.cofins ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN sub.tipo = 'entrada' THEN sub.icms ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN sub.tipo = 'saida' THEN sub.valor ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN sub.tipo = 'saida' THEN sub.pis ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN sub.tipo = 'saida' THEN sub.cofins ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN sub.tipo = 'saida' THEN sub.icms ELSE 0 END), 0)
    FROM (
        SELECT 
            mv.valor, mv.pis, mv.cofins, mv.icms, mv.tipo
        FROM extensions.mv_mercadorias_participante mv
        -- Access Control via Subquery (Optimized)
        WHERE mv.filial_id IN (
            SELECT f.id 
            FROM public.filiais f
            JOIN public.empresas e ON e.id = f.empresa_id
            JOIN public.grupos_empresas g ON g.id = e.grupo_id
            JOIN public.user_tenants ut ON ut.tenant_id = g.tenant_id AND ut.user_id = v_user_id
            LEFT JOIN public.user_empresas ue ON ue.user_id = v_user_id AND ue.empresa_id = e.id
            LEFT JOIN public.user_roles ur ON ur.user_id = v_user_id
            WHERE (ur.role = 'admin' OR ue.user_id IS NOT NULL)
              AND (p_empresa_id IS NULL OR e.id = p_empresa_id)
        )
        -- Filters
        AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
        AND (p_participante IS NULL OR p_participante = '' OR 
             mv.participante_nome ILIKE '%' || p_participante || '%' OR
             mv.cod_part ILIKE '%' || p_participante || '%')
        -- Simples Nacional Filter (Requires Join? No, can use subquery or join on mv)
        AND (p_only_simples IS NULL OR EXISTS (
            SELECT 1 
            FROM public.simples_nacional sn
            JOIN public.filiais f ON f.id = mv.filial_id
            JOIN public.empresas e ON e.id = f.empresa_id
            JOIN public.grupos_empresas g ON g.id = e.grupo_id
            WHERE sn.tenant_id = g.tenant_id 
              AND sn.cnpj = regexp_replace(mv.participante_cnpj, '[^0-9]', '', 'g')
              AND COALESCE(sn.is_simples, false) = p_only_simples
        ))
    ) sub;
END;
$function$;

-- 2. get_mercadorias_participante_page
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text, boolean, uuid);

CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_page(
    p_limit integer DEFAULT 100, 
    p_offset integer DEFAULT 0, 
    p_mes_ano date DEFAULT NULL, 
    p_participante text DEFAULT NULL, 
    p_tipo text DEFAULT NULL,
    p_only_simples boolean DEFAULT NULL,
    p_empresa_id uuid DEFAULT NULL
)
RETURNS TABLE(
    cod_part varchar,
    cofins numeric,
    filial_id uuid,
    icms numeric,
    mes_ano date,
    participante_cnpj varchar,
    participante_nome varchar,
    pis numeric,
    tipo varchar,
    valor numeric,
    is_simples boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    -- Force valid limits
    IF p_limit > 100 THEN p_limit := 100; END IF;
    IF p_offset < 0 THEN p_offset := 0; END IF;

    RETURN QUERY
    SELECT 
        mv.cod_part::varchar,
        mv.cofins,
        mv.filial_id,
        mv.icms,
        mv.mes_ano,
        mv.participante_cnpj::varchar,
        mv.participante_nome::varchar,
        mv.pis,
        mv.tipo::varchar,
        mv.valor,
        COALESCE(sn.is_simples, false) as is_simples
    FROM extensions.mv_mercadorias_participante mv
    -- Joins for Simples Nacional
    JOIN public.filiais f ON f.id = mv.filial_id
    JOIN public.empresas e ON e.id = f.empresa_id
    JOIN public.grupos_empresas g ON g.id = e.grupo_id
    LEFT JOIN public.simples_nacional sn 
        ON sn.tenant_id = g.tenant_id 
        AND sn.cnpj = regexp_replace(mv.participante_cnpj, '[^0-9]', '', 'g')
    -- Access Control via Subquery (Optimized)
    WHERE mv.filial_id IN (
        SELECT f_inner.id 
        FROM public.filiais f_inner
        JOIN public.empresas e_inner ON e_inner.id = f_inner.empresa_id
        JOIN public.grupos_empresas g_inner ON g_inner.id = e_inner.grupo_id
        JOIN public.user_tenants ut ON ut.tenant_id = g_inner.tenant_id AND ut.user_id = v_user_id
        LEFT JOIN public.user_empresas ue ON ue.user_id = v_user_id AND ue.empresa_id = e_inner.id
        LEFT JOIN public.user_roles ur ON ur.user_id = v_user_id
        WHERE (ur.role = 'admin' OR ue.user_id IS NOT NULL)
          AND (p_empresa_id IS NULL OR e_inner.id = p_empresa_id)
    )
    -- Filters
    AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
    AND (p_tipo IS NULL OR p_tipo = '' OR mv.tipo = p_tipo)
    AND (p_participante IS NULL OR p_participante = '' OR 
         mv.participante_nome ILIKE '%' || p_participante || '%' OR
         mv.cod_part ILIKE '%' || p_participante || '%')
    AND (p_only_simples IS NULL OR COALESCE(sn.is_simples, false) = p_only_simples)
    ORDER BY mv.valor DESC
    LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- 3. Grants
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_totals(date, text, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_page(integer, integer, date, text, text, boolean, uuid) TO authenticated;
