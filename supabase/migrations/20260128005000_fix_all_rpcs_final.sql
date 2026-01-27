-- Ultimate Fix for RPCs and Permissions
-- This migration drops ALL variations of the problematic functions and recreates them cleanly.

-- ==============================================================================
-- 1. Drop EVERYTHING first to avoid ambiguity
-- ==============================================================================

-- Drop get_mercadorias_participante_page (all variations)
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text, boolean, uuid);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text, boolean);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text);

-- Drop get_mercadorias_participante_totals (all variations)
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_totals(date, text, boolean, uuid);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_totals(date, text, boolean);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_totals(date, text);

-- Drop get_mercadorias_participante_lista (all variations)
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_lista(uuid);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_lista();

-- Drop get_mercadorias_participante_meses (all variations)
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_meses(uuid);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_meses();

-- ==============================================================================
-- 2. Recreate Functions with Explicit Types and Aliases
-- ==============================================================================

-- 2.1 get_mercadorias_participante_page
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
BEGIN
    -- Force valid limits
    IF p_limit > 100 THEN p_limit := 100; END IF;
    IF p_offset < 0 THEN p_offset := 0; END IF;

    -- Case 1: Optimized path (No complex filters)
    IF (p_participante IS NULL OR p_participante = '') AND p_only_simples IS NULL THEN
        RETURN QUERY
        SELECT 
            mv.cod_part::varchar,
            mv.cofins,
            mv.filial_id,
            mv.icms,
            mv.mes_ano,
            p.cnpj::varchar as participante_cnpj,
            COALESCE(p.nome, 'Participante ' || mv.cod_part)::varchar as participante_nome,
            mv.pis,
            mv.tipo::varchar,
            mv.valor,
            COALESCE(sn.is_simples, false) as is_simples
        FROM extensions.mv_mercadorias_participante mv
        JOIN public.filiais f ON f.id = mv.filial_id
        JOIN public.empresas e ON e.id = f.empresa_id
        JOIN public.grupos_empresas g ON g.id = e.grupo_id
        LEFT JOIN LATERAL (
            SELECT p2.nome, p2.cnpj
            FROM public.participantes p2 
            WHERE p2.filial_id = mv.filial_id 
              AND TRIM(p2.cod_part) = mv.cod_part
            ORDER BY p2.created_at DESC
            LIMIT 1
        ) p ON true
        LEFT JOIN public.simples_nacional sn 
            ON sn.tenant_id = g.tenant_id 
            AND sn.cnpj = regexp_replace(p.cnpj, '[^0-9]', '', 'g')
        WHERE has_filial_access(auth.uid(), mv.filial_id)
          AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
          AND (p_tipo IS NULL OR p_tipo = '' OR mv.tipo = p_tipo)
          AND (p_empresa_id IS NULL OR f.empresa_id = p_empresa_id)
        ORDER BY mv.valor DESC
        LIMIT p_limit OFFSET p_offset;
    
    -- Case 2: Filtered path (Needs full join)
    ELSE
        RETURN QUERY
        SELECT 
            mv.cod_part::varchar,
            mv.cofins,
            mv.filial_id,
            mv.icms,
            mv.mes_ano,
            p.cnpj::varchar as participante_cnpj,
            COALESCE(p.nome, 'Participante ' || mv.cod_part)::varchar as participante_nome,
            mv.pis,
            mv.tipo::varchar,
            mv.valor,
            COALESCE(sn.is_simples, false) as is_simples
        FROM extensions.mv_mercadorias_participante mv
        JOIN public.filiais f ON f.id = mv.filial_id
        JOIN public.empresas e ON e.id = f.empresa_id
        JOIN public.grupos_empresas g ON g.id = e.grupo_id
        LEFT JOIN LATERAL (
            SELECT p2.nome, p2.cnpj
            FROM public.participantes p2 
            WHERE p2.filial_id = mv.filial_id 
              AND TRIM(p2.cod_part) = mv.cod_part
            ORDER BY p2.created_at DESC
            LIMIT 1
        ) p ON true
        LEFT JOIN public.simples_nacional sn 
            ON sn.tenant_id = g.tenant_id 
            AND sn.cnpj = regexp_replace(p.cnpj, '[^0-9]', '', 'g')
        WHERE has_filial_access(auth.uid(), mv.filial_id)
          AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
          AND (p_tipo IS NULL OR p_tipo = '' OR mv.tipo = p_tipo)
          AND (p_empresa_id IS NULL OR f.empresa_id = p_empresa_id)
          AND (p_participante IS NULL OR p_participante = '' OR 
               COALESCE(p.nome, '') ILIKE '%' || p_participante || '%' OR
               COALESCE(mv.cod_part, '') ILIKE '%' || p_participante || '%')
          AND (p_only_simples IS NULL OR COALESCE(sn.is_simples, false) = p_only_simples)
        ORDER BY mv.valor DESC
        LIMIT p_limit OFFSET p_offset;
    END IF;
END;
$function$;

-- 2.2 get_mercadorias_participante_totals
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
        JOIN public.filiais f ON f.id = mv.filial_id
        JOIN public.empresas e ON e.id = f.empresa_id
        JOIN public.grupos_empresas g ON g.id = e.grupo_id
        LEFT JOIN LATERAL (
            SELECT p2.nome, p2.cnpj
            FROM public.participantes p2 
            WHERE p2.filial_id = mv.filial_id 
              AND TRIM(p2.cod_part) = mv.cod_part
            ORDER BY p2.created_at DESC
            LIMIT 1
        ) p ON true
        LEFT JOIN public.simples_nacional sn 
            ON sn.tenant_id = g.tenant_id 
            AND sn.cnpj = regexp_replace(p.cnpj, '[^0-9]', '', 'g')
        WHERE has_filial_access(auth.uid(), mv.filial_id)
          AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
          AND (p_empresa_id IS NULL OR f.empresa_id = p_empresa_id)
          AND (p_participante IS NULL OR p_participante = '' OR 
               COALESCE(p.nome, '') ILIKE '%' || p_participante || '%' OR
               COALESCE(mv.cod_part, '') ILIKE '%' || p_participante || '%')
          AND (p_only_simples IS NULL OR COALESCE(sn.is_simples, false) = p_only_simples)
    ) sub;
END;
$function$;

-- 2.3 get_mercadorias_participante_lista
CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_lista(
    p_empresa_id uuid DEFAULT NULL
)
RETURNS TABLE(
    cod_part varchar,
    nome varchar,
    cnpj varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (COALESCE(mv.participante_nome, 'NAO INFORMADO'))
        COALESCE(mv.cod_part, 'NAO INFORMADO')::varchar,
        COALESCE(mv.participante_nome, 'NAO INFORMADO')::varchar,
        mv.participante_cnpj::varchar
    FROM extensions.mv_mercadorias_participante mv
    JOIN public.filiais f ON f.id = mv.filial_id
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND (p_empresa_id IS NULL OR f.empresa_id = p_empresa_id)
    ORDER BY COALESCE(mv.participante_nome, 'NAO INFORMADO');
END;
$function$;

-- 2.4 get_mercadorias_participante_meses
CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_meses(
    p_empresa_id uuid DEFAULT NULL
)
RETURNS TABLE(mes_ano date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
BEGIN
    RETURN QUERY
    SELECT DISTINCT mv.mes_ano
    FROM extensions.mv_mercadorias_participante mv
    JOIN public.filiais f ON f.id = mv.filial_id
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND (p_empresa_id IS NULL OR f.empresa_id = p_empresa_id)
    ORDER BY mv.mes_ano DESC;
END;
$function$;

-- ==============================================================================
-- 3. Grants and Refresh
-- ==============================================================================

GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_page TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_totals TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_lista TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_meses TO authenticated;

-- Ensure MV has unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_mercadorias_participante_unique_pk
ON extensions.mv_mercadorias_participante (filial_id, cod_part, mes_ano, tipo);

-- Force a refresh to ensure data is consistent
REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_mercadorias_participante;

-- Reload configuration
NOTIFY pgrst, 'reload config';
