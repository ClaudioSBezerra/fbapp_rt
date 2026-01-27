-- Fix Materialized View mv_mercadorias_participante
-- Issue: Previous version grouped by non-unique attributes (nome, cnpj) causing duplication for same cod_part
-- Solution: Aggregate purely by keys (filial_id, cod_part, mes_ano, tipo) and Join metadata in RPC

-- 1. Drop dependent functions
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text, boolean);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_totals(date, text, boolean);

-- 2. Drop the view
DROP MATERIALIZED VIEW IF EXISTS extensions.mv_mercadorias_participante;

-- 3. Recreate View with STRICT aggregation (Keys only)
CREATE MATERIALIZED VIEW extensions.mv_mercadorias_participante AS
SELECT 
    m.filial_id,
    TRIM(m.cod_part) as cod_part, -- Ensure consistent grouping by trimming
    m.mes_ano,
    m.tipo,
    SUM(m.valor) as valor,
    SUM(m.pis) as pis,
    SUM(m.cofins) as cofins,
    SUM(COALESCE(m.icms, 0)) as icms
FROM public.mercadorias m
WHERE m.cod_part IS NOT NULL AND TRIM(m.cod_part) != ''
GROUP BY m.filial_id, TRIM(m.cod_part), m.mes_ano, m.tipo;

-- 4. Create Index for Performance (Covering Filter/Sort columns)
CREATE UNIQUE INDEX idx_mv_mercadorias_part_pk 
ON extensions.mv_mercadorias_participante(filial_id, cod_part, mes_ano, tipo);

CREATE INDEX idx_mv_mercadorias_part_perf 
ON extensions.mv_mercadorias_participante(filial_id, valor DESC);

-- 5. Recreate RPC Function (Page) - Joins Metadata here
CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_page(
    p_limit integer DEFAULT 100, 
    p_offset integer DEFAULT 0, 
    p_mes_ano date DEFAULT NULL, 
    p_participante text DEFAULT NULL, 
    p_tipo text DEFAULT NULL,
    p_only_simples boolean DEFAULT NULL
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
    -- Safety caps
    IF p_limit > 100 THEN p_limit := 100; END IF;
    IF p_offset > 900 THEN p_offset := 900; END IF;

    RETURN QUERY
    WITH base_data AS (
        SELECT 
            mv.filial_id,
            mv.cod_part,
            mv.mes_ano,
            mv.tipo,
            mv.valor,
            mv.pis,
            mv.cofins,
            mv.icms
        FROM extensions.mv_mercadorias_participante mv
        WHERE has_filial_access(auth.uid(), mv.filial_id)
          AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
          AND (p_tipo IS NULL OR p_tipo = '' OR mv.tipo = p_tipo)
    )
    SELECT 
        bd.cod_part::varchar,
        bd.cofins,
        bd.filial_id,
        bd.icms,
        bd.mes_ano,
        p.cnpj::varchar as participante_cnpj,
        COALESCE(p.nome, 'Participante ' || bd.cod_part)::varchar as participante_nome,
        bd.pis,
        bd.tipo::varchar,
        bd.valor,
        COALESCE(sn.is_simples, false) as is_simples
    FROM base_data bd
    JOIN public.filiais f ON f.id = bd.filial_id
    JOIN public.empresas e ON e.id = f.empresa_id
    JOIN public.grupos_empresas g ON g.id = e.grupo_id
    LEFT JOIN public.participantes p 
        ON p.filial_id = bd.filial_id AND p.cod_part = bd.cod_part
    LEFT JOIN public.simples_nacional sn 
        ON sn.tenant_id = g.tenant_id 
        AND sn.cnpj = regexp_replace(p.cnpj, '[^0-9]', '', 'g')
    WHERE 
        (p_participante IS NULL OR p_participante = '' OR 
           p.nome ILIKE '%' || p_participante || '%' OR
           bd.cod_part ILIKE '%' || p_participante || '%')
        AND 
        (p_only_simples IS NULL OR COALESCE(sn.is_simples, false) = p_only_simples)
    ORDER BY bd.valor DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$function$;

-- 6. Recreate RPC Function (Totals)
CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_totals(
    p_mes_ano date DEFAULT NULL, 
    p_participante text DEFAULT NULL,
    p_only_simples boolean DEFAULT NULL
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
        LEFT JOIN public.participantes p ON p.filial_id = mv.filial_id AND p.cod_part = mv.cod_part
        LEFT JOIN public.simples_nacional sn ON sn.tenant_id = g.tenant_id AND sn.cnpj = regexp_replace(p.cnpj, '[^0-9]', '', 'g')
        WHERE has_filial_access(auth.uid(), mv.filial_id)
          AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
          AND (p_participante IS NULL OR p_participante = '' OR 
               p.nome ILIKE '%' || p_participante || '%' OR
               mv.cod_part ILIKE '%' || p_participante || '%')
          AND (p_only_simples IS NULL OR COALESCE(sn.is_simples, false) = p_only_simples)
    ) sub;
END;
$function$;

-- 7. Grant permissions
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_page TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_totals TO authenticated;
