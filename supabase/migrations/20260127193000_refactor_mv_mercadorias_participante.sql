-- 1. Drop functions that depend on the view columns/types
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text, boolean);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_totals(date, text, boolean);

-- 2. Drop the view
DROP MATERIALIZED VIEW IF EXISTS extensions.mv_mercadorias_participante;

-- 3. Recreate the view with tenant_id (joined via empresas -> grupos_empresas)
CREATE MATERIALIZED VIEW extensions.mv_mercadorias_participante AS
SELECT 
    g.tenant_id,
    m.filial_id,
    m.cod_part,
    COALESCE(p.nome, 'Participante ' || m.cod_part) as participante_nome,
    p.cnpj as participante_cnpj,
    m.mes_ano,
    m.tipo,
    SUM(m.valor) as valor,
    SUM(m.pis) as pis,
    SUM(m.cofins) as cofins,
    SUM(COALESCE(m.icms, 0)) as icms
FROM public.mercadorias m
JOIN public.filiais f ON f.id = m.filial_id
JOIN public.empresas e ON e.id = f.empresa_id
JOIN public.grupos_empresas g ON g.id = e.grupo_id
LEFT JOIN public.participantes p 
    ON p.filial_id = m.filial_id AND p.cod_part = m.cod_part
WHERE m.cod_part IS NOT NULL AND TRIM(m.cod_part) != ''
GROUP BY g.tenant_id, m.filial_id, m.cod_part, p.nome, p.cnpj, m.mes_ano, m.tipo;

-- Indices
CREATE UNIQUE INDEX idx_mv_mercadorias_part_pk 
ON extensions.mv_mercadorias_participante(filial_id, cod_part, mes_ano, tipo);

CREATE INDEX idx_mv_mercadorias_participante_tenant 
ON extensions.mv_mercadorias_participante(tenant_id);

-- 4. Recreate functions
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
    LEFT JOIN public.simples_nacional sn ON 
        sn.tenant_id = mv.tenant_id AND 
        sn.cnpj = regexp_replace(mv.participante_cnpj, '[^0-9]', '', 'g')
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
      AND (p_participante IS NULL OR p_participante = '' OR 
           mv.participante_nome ILIKE '%' || p_participante || '%' OR
           mv.cod_part ILIKE '%' || p_participante || '%')
      AND (p_tipo IS NULL OR p_tipo = '' OR mv.tipo = p_tipo)
      AND (p_only_simples IS NULL OR COALESCE(sn.is_simples, false) = p_only_simples)
    ORDER BY mv.valor DESC
    LIMIT p_limit OFFSET p_offset;
END;
$function$;

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
    LEFT JOIN public.simples_nacional sn ON 
        sn.tenant_id = mv.tenant_id AND 
        sn.cnpj = regexp_replace(mv.participante_cnpj, '[^0-9]', '', 'g')
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
      AND (p_participante IS NULL OR p_participante = '' OR 
           mv.participante_nome ILIKE '%' || p_participante || '%' OR
           mv.cod_part ILIKE '%' || p_participante || '%')
      AND (p_only_simples IS NULL OR COALESCE(sn.is_simples, false) = p_only_simples);
END;
$function$;

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_page TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_totals TO authenticated;
