-- Add p_empresa_id parameter to RPCs to filter by selected company

DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text, boolean);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_totals(date, text, boolean);

-- Recreate Page RPC
CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_page(
    p_limit integer DEFAULT 100, 
    p_offset integer DEFAULT 0, 
    p_mes_ano date DEFAULT NULL, 
    p_participante text DEFAULT NULL, 
    p_tipo text DEFAULT NULL,
    p_only_simples boolean DEFAULT NULL,
    p_empresa_id uuid DEFAULT NULL -- New parameter
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

    -- OPTIMIZATION: If no text filter and no Simples filter, paginate FIRST, then join.
    IF (p_participante IS NULL OR p_participante = '') AND p_only_simples IS NULL THEN
        RETURN QUERY
        WITH top_rows AS (
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
            JOIN public.filiais f_filter ON f_filter.id = mv.filial_id -- Join to filter by empresa
            WHERE has_filial_access(auth.uid(), mv.filial_id)
              AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
              AND (p_tipo IS NULL OR p_tipo = '' OR mv.tipo = p_tipo)
              AND (p_empresa_id IS NULL OR f_filter.empresa_id = p_empresa_id) -- Filter by empresa
            ORDER BY mv.valor DESC
            LIMIT p_limit OFFSET p_offset
        )
        SELECT 
            tr.cod_part::varchar,
            tr.cofins,
            tr.filial_id,
            tr.icms,
            tr.mes_ano,
            p.cnpj::varchar as participante_cnpj,
            COALESCE(p.nome, 'Participante ' || tr.cod_part)::varchar as participante_nome,
            tr.pis,
            tr.tipo::varchar,
            tr.valor,
            COALESCE(sn.is_simples, false) as is_simples
        FROM top_rows tr
        JOIN public.filiais f ON f.id = tr.filial_id
        JOIN public.empresas e ON e.id = f.empresa_id
        JOIN public.grupos_empresas g ON g.id = e.grupo_id
        LEFT JOIN LATERAL (
            SELECT p2.nome, p2.cnpj
            FROM public.participantes p2 
            WHERE p2.filial_id = tr.filial_id 
              AND TRIM(p2.cod_part) = tr.cod_part
            ORDER BY p2.created_at DESC
            LIMIT 1
        ) p ON true
        LEFT JOIN public.simples_nacional sn 
            ON sn.tenant_id = g.tenant_id 
            AND sn.cnpj = regexp_replace(p.cnpj, '[^0-9]', '', 'g')
        ORDER BY tr.valor DESC;
    ELSE
        -- Standard Path
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
            JOIN public.filiais f_filter ON f_filter.id = mv.filial_id -- Join to filter by empresa
            WHERE has_filial_access(auth.uid(), mv.filial_id)
              AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
              AND (p_tipo IS NULL OR p_tipo = '' OR mv.tipo = p_tipo)
              AND (p_empresa_id IS NULL OR f_filter.empresa_id = p_empresa_id) -- Filter by empresa
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
        LEFT JOIN LATERAL (
            SELECT p2.nome, p2.cnpj
            FROM public.participantes p2 
            WHERE p2.filial_id = bd.filial_id 
              AND TRIM(p2.cod_part) = bd.cod_part
            ORDER BY p2.created_at DESC
            LIMIT 1
        ) p ON true
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
    END IF;
END;
$function$;

-- Recreate Totals RPC
CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_totals(
    p_mes_ano date DEFAULT NULL, 
    p_participante text DEFAULT NULL,
    p_only_simples boolean DEFAULT NULL,
    p_empresa_id uuid DEFAULT NULL -- New parameter
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
    -- OPTIMIZATION
    IF (p_participante IS NULL OR p_participante = '') AND p_only_simples IS NULL THEN
        RETURN QUERY
        SELECT 
            COUNT(*)::bigint as total_registros,
            COALESCE(SUM(mv.valor), 0) as total_valor,
            COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.valor ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.pis ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.cofins ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.icms ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.valor ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.pis ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.cofins ELSE 0 END), 0),
            COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.icms ELSE 0 END), 0)
        FROM extensions.mv_mercadorias_participante mv
        JOIN public.filiais f_filter ON f_filter.id = mv.filial_id
        WHERE has_filial_access(auth.uid(), mv.filial_id)
          AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
          AND (p_empresa_id IS NULL OR f_filter.empresa_id = p_empresa_id);
    ELSE
        -- Standard Path
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
            LEFT JOIN public.simples_nacional sn ON sn.tenant_id = g.tenant_id AND sn.cnpj = regexp_replace(p.cnpj, '[^0-9]', '', 'g')
            WHERE has_filial_access(auth.uid(), mv.filial_id)
              AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
              AND (p_participante IS NULL OR p_participante = '' OR 
                   p.nome ILIKE '%' || p_participante || '%' OR
                   mv.cod_part ILIKE '%' || p_participante || '%')
              AND (p_only_simples IS NULL OR COALESCE(sn.is_simples, false) = p_only_simples)
              AND (p_empresa_id IS NULL OR f.empresa_id = p_empresa_id)
        ) sub;
    END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_page TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_totals TO authenticated;
