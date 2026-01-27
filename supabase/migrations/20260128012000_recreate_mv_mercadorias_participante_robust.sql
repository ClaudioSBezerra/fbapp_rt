-- Recreate MV and RPCs for Robust Null Handling and Data Integrity

-- 1. Drop EVERYTHING first to avoid ambiguity and dependencies
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text, boolean, uuid);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text, boolean);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text);

DROP FUNCTION IF EXISTS public.get_mercadorias_participante_totals(date, text, boolean, uuid);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_totals(date, text, boolean);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_totals(date, text);

DROP FUNCTION IF EXISTS public.get_mercadorias_participante_lista(uuid);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_lista();

DROP FUNCTION IF EXISTS public.get_mercadorias_participante_meses(uuid);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_meses();

-- Drop view CASCADE would be easier but let's be explicit
DROP MATERIALIZED VIEW IF EXISTS extensions.mv_mercadorias_participante CASCADE;

-- 2. Recreate Materialized View with Robust Null Handling
CREATE MATERIALIZED VIEW extensions.mv_mercadorias_participante AS
SELECT 
    g.tenant_id,
    m.filial_id,
    COALESCE(m.cod_part, 'NAOINFORMADO')::varchar as cod_part,
    CASE 
        WHEN m.cod_part IS NULL OR TRIM(m.cod_part) = '' THEN 'NÃO INFORMADO'
        WHEN p.nome IS NOT NULL THEN p.nome
        ELSE 'Participante ' || COALESCE(m.cod_part, 'NAOINFORMADO')
    END::varchar as participante_nome,
    p.cnpj::varchar as participante_cnpj,
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
GROUP BY 
    g.tenant_id, 
    m.filial_id, 
    COALESCE(m.cod_part, 'NAOINFORMADO'), 
    CASE 
        WHEN m.cod_part IS NULL OR TRIM(m.cod_part) = '' THEN 'NÃO INFORMADO'
        WHEN p.nome IS NOT NULL THEN p.nome
        ELSE 'Participante ' || COALESCE(m.cod_part, 'NAOINFORMADO')
    END,
    p.cnpj, 
    m.mes_ano, 
    m.tipo;

-- 3. Create Indices
CREATE UNIQUE INDEX idx_mv_mercadorias_participante_unique_pk 
ON extensions.mv_mercadorias_participante (filial_id, cod_part, mes_ano, tipo);

CREATE INDEX idx_mv_mercadorias_participante_tenant 
ON extensions.mv_mercadorias_participante(tenant_id);

CREATE INDEX idx_mv_mercadorias_participante_valor 
ON extensions.mv_mercadorias_participante(valor DESC);

-- 4. Recreate RPC Functions

-- 4.1 get_mercadorias_participante_page
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
            mv.participante_cnpj::varchar, -- Use View's cached name/cnpj
            mv.participante_nome::varchar, -- Use View's cached name/cnpj
            mv.pis,
            mv.tipo::varchar,
            mv.valor,
            COALESCE(sn.is_simples, false) as is_simples
        FROM extensions.mv_mercadorias_participante mv
        JOIN public.filiais f ON f.id = mv.filial_id
        JOIN public.empresas e ON e.id = f.empresa_id
        JOIN public.grupos_empresas g ON g.id = e.grupo_id
        LEFT JOIN public.simples_nacional sn 
            ON sn.tenant_id = g.tenant_id 
            AND sn.cnpj = regexp_replace(mv.participante_cnpj, '[^0-9]', '', 'g')
        WHERE has_filial_access(auth.uid(), mv.filial_id)
          AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
          AND (p_tipo IS NULL OR p_tipo = '' OR mv.tipo = p_tipo)
          AND (p_empresa_id IS NULL OR f.empresa_id = p_empresa_id)
        ORDER BY mv.valor DESC
        LIMIT p_limit OFFSET p_offset;
    
    -- Case 2: Filtered path
    ELSE
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
        JOIN public.filiais f ON f.id = mv.filial_id
        JOIN public.empresas e ON e.id = f.empresa_id
        JOIN public.grupos_empresas g ON g.id = e.grupo_id
        LEFT JOIN public.simples_nacional sn 
            ON sn.tenant_id = g.tenant_id 
            AND sn.cnpj = regexp_replace(mv.participante_cnpj, '[^0-9]', '', 'g')
        WHERE has_filial_access(auth.uid(), mv.filial_id)
          AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
          AND (p_tipo IS NULL OR p_tipo = '' OR mv.tipo = p_tipo)
          AND (p_empresa_id IS NULL OR f.empresa_id = p_empresa_id)
          AND (p_participante IS NULL OR p_participante = '' OR 
               mv.participante_nome ILIKE '%' || p_participante || '%' OR
               mv.cod_part ILIKE '%' || p_participante || '%')
          AND (p_only_simples IS NULL OR COALESCE(sn.is_simples, false) = p_only_simples)
        ORDER BY mv.valor DESC
        LIMIT p_limit OFFSET p_offset;
    END IF;
END;
$function$;

-- 4.2 get_mercadorias_participante_totals
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
        LEFT JOIN public.simples_nacional sn 
            ON sn.tenant_id = g.tenant_id 
            AND sn.cnpj = regexp_replace(mv.participante_cnpj, '[^0-9]', '', 'g')
        WHERE has_filial_access(auth.uid(), mv.filial_id)
          AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
          AND (p_empresa_id IS NULL OR f.empresa_id = p_empresa_id)
          AND (p_participante IS NULL OR p_participante = '' OR 
               mv.participante_nome ILIKE '%' || p_participante || '%' OR
               mv.cod_part ILIKE '%' || p_participante || '%')
          AND (p_only_simples IS NULL OR COALESCE(sn.is_simples, false) = p_only_simples)
    ) sub;
END;
$function$;

-- 4.3 get_mercadorias_participante_lista
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
    SELECT DISTINCT ON (mv.participante_nome)
        mv.cod_part::varchar,
        mv.participante_nome::varchar,
        mv.participante_cnpj::varchar
    FROM extensions.mv_mercadorias_participante mv
    JOIN public.filiais f ON f.id = mv.filial_id
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND (p_empresa_id IS NULL OR f.empresa_id = p_empresa_id)
    ORDER BY mv.participante_nome;
END;
$function$;

-- 4.4 get_mercadorias_participante_meses
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

-- 5. Grants
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_page TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_totals TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_lista TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_meses TO authenticated;

-- 6. Initial Refresh
REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;
