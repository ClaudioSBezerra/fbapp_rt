-- Otimizar funções do painel de participantes para evitar timeout
-- Substituindo has_filial_access() por JOINs diretos

-- 1. Recriar get_mercadorias_participante_totals com JOINs otimizados
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_totals(date, text);

CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_totals(
    p_mes_ano date DEFAULT NULL, 
    p_participante text DEFAULT NULL
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
        COUNT(*)::bigint,
        COALESCE(SUM(mv.valor), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.valor ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.pis ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.cofins ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.icms ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.valor ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.pis ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.cofins ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.icms ELSE 0 END), 0)
    FROM extensions.mv_mercadorias_participante mv
    WHERE mv.filial_id IN (
        SELECT f.id 
        FROM public.filiais f
        JOIN public.empresas e ON e.id = f.empresa_id
        JOIN public.grupos_empresas g ON g.id = e.grupo_id
        JOIN public.user_tenants ut ON ut.tenant_id = g.tenant_id AND ut.user_id = v_user_id
        LEFT JOIN public.user_empresas ue ON ue.user_id = v_user_id AND ue.empresa_id = e.id
        LEFT JOIN public.user_roles ur ON ur.user_id = v_user_id
        WHERE ur.role = 'admin' OR ue.user_id IS NOT NULL
    )
      AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
      AND (p_participante IS NULL OR p_participante = '' OR 
           mv.participante_nome ILIKE '%' || p_participante || '%' OR
           mv.cod_part ILIKE '%' || p_participante || '%');
END;
$function$;

-- 2. Recriar get_mercadorias_participante_page com JOINs otimizados
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text);

CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_page(
    p_limit integer DEFAULT 100, 
    p_offset integer DEFAULT 0, 
    p_mes_ano date DEFAULT NULL, 
    p_participante text DEFAULT NULL, 
    p_tipo text DEFAULT NULL
)
RETURNS TABLE(
    cod_part character varying, 
    cofins numeric, 
    filial_id uuid, 
    filial_cod_est text, 
    filial_cnpj text, 
    icms numeric, 
    mes_ano date, 
    participante_cnpj character varying, 
    participante_nome character varying, 
    pis numeric, 
    tipo character varying, 
    valor numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF p_limit > 100 THEN
        p_limit := 100;
    END IF;
    
    IF p_offset > 900 THEN
        p_offset := 900;
    END IF;
    
    RETURN QUERY
    SELECT 
        mv.cod_part::varchar,
        mv.cofins,
        mv.filial_id,
        f.cod_est::text as filial_cod_est,
        f.cnpj::text as filial_cnpj,
        mv.icms,
        mv.mes_ano,
        mv.participante_cnpj::varchar,
        mv.participante_nome::varchar,
        mv.pis,
        mv.tipo::varchar,
        mv.valor
    FROM extensions.mv_mercadorias_participante mv
    JOIN public.filiais f ON f.id = mv.filial_id
    WHERE mv.filial_id IN (
        SELECT fil.id 
        FROM public.filiais fil
        JOIN public.empresas e ON e.id = fil.empresa_id
        JOIN public.grupos_empresas g ON g.id = e.grupo_id
        JOIN public.user_tenants ut ON ut.tenant_id = g.tenant_id AND ut.user_id = v_user_id
        LEFT JOIN public.user_empresas ue ON ue.user_id = v_user_id AND ue.empresa_id = e.id
        LEFT JOIN public.user_roles ur ON ur.user_id = v_user_id
        WHERE ur.role = 'admin' OR ue.user_id IS NOT NULL
    )
      AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
      AND (p_participante IS NULL OR p_participante = '' OR 
           mv.participante_nome ILIKE '%' || p_participante || '%' OR
           mv.cod_part ILIKE '%' || p_participante || '%')
      AND (p_tipo IS NULL OR p_tipo = '' OR mv.tipo = p_tipo)
    ORDER BY mv.valor DESC, mv.cod_part, mv.mes_ano
    LIMIT p_limit
    OFFSET p_offset;
END;
$function$;

-- 3. Recriar get_mercadorias_participante_meses com JOINs otimizados
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_meses();

CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_meses()
RETURNS TABLE(mes_ano date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    RETURN QUERY
    SELECT DISTINCT mv.mes_ano
    FROM extensions.mv_mercadorias_participante mv
    WHERE mv.filial_id IN (
        SELECT f.id 
        FROM public.filiais f
        JOIN public.empresas e ON e.id = f.empresa_id
        JOIN public.grupos_empresas g ON g.id = e.grupo_id
        JOIN public.user_tenants ut ON ut.tenant_id = g.tenant_id AND ut.user_id = v_user_id
        LEFT JOIN public.user_empresas ue ON ue.user_id = v_user_id AND ue.empresa_id = e.id
        LEFT JOIN public.user_roles ur ON ur.user_id = v_user_id
        WHERE ur.role = 'admin' OR ue.user_id IS NOT NULL
    )
    ORDER BY mv.mes_ano DESC;
END;
$function$;

-- 4. Recriar get_mercadorias_participante_lista com JOINs otimizados
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_lista();

CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_lista()
RETURNS TABLE(cod_part character varying, nome character varying, cnpj character varying)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    RETURN QUERY
    SELECT 
        sub.cod_part::varchar,
        sub.participante_nome::varchar as nome,
        sub.participante_cnpj::varchar as cnpj
    FROM (
        SELECT DISTINCT ON (mv.cod_part)
            mv.cod_part,
            mv.participante_nome,
            mv.participante_cnpj,
            SUM(mv.valor) OVER (PARTITION BY mv.cod_part) as total_valor
        FROM extensions.mv_mercadorias_participante mv
        WHERE mv.filial_id IN (
            SELECT f.id 
            FROM public.filiais f
            JOIN public.empresas e ON e.id = f.empresa_id
            JOIN public.grupos_empresas g ON g.id = e.grupo_id
            JOIN public.user_tenants ut ON ut.tenant_id = g.tenant_id AND ut.user_id = v_user_id
            LEFT JOIN public.user_empresas ue ON ue.user_id = v_user_id AND ue.empresa_id = e.id
            LEFT JOIN public.user_roles ur ON ur.user_id = v_user_id
            WHERE ur.role = 'admin' OR ue.user_id IS NOT NULL
        )
        ORDER BY mv.cod_part, mv.valor DESC
    ) sub
    ORDER BY sub.total_valor DESC
    LIMIT 500;
END;
$function$;

-- Garantir permissões
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_totals(date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_page(integer, integer, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_meses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_lista() TO authenticated;