-- =====================================================
-- FASE 3: Recriar View Materializada
-- =====================================================

DROP MATERIALIZED VIEW IF EXISTS extensions.mv_mercadorias_participante;

CREATE MATERIALIZED VIEW extensions.mv_mercadorias_participante AS
SELECT 
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
LEFT JOIN public.participantes p 
    ON p.filial_id = m.filial_id AND p.cod_part = m.cod_part
WHERE m.cod_part IS NOT NULL AND TRIM(m.cod_part) != ''
GROUP BY m.filial_id, m.cod_part, p.nome, p.cnpj, m.mes_ano, m.tipo;

CREATE INDEX idx_mv_mercadorias_participante_filial ON extensions.mv_mercadorias_participante(filial_id);
CREATE INDEX idx_mv_mercadorias_participante_mesano ON extensions.mv_mercadorias_participante(mes_ano);
CREATE INDEX idx_mv_mercadorias_participante_tipo ON extensions.mv_mercadorias_participante(tipo);
CREATE INDEX idx_mv_mercadorias_participante_valor ON extensions.mv_mercadorias_participante(valor DESC);

-- =====================================================
-- FASE 5: Atualizar funções de consulta
-- =====================================================

-- Dropar funções existentes
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_totals(date, text);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_lista();

-- Função de listagem de participantes (para dropdown)
CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_lista()
RETURNS TABLE(cod_part varchar, nome varchar, cnpj varchar)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        mv.cod_part::varchar,
        mv.participante_nome::varchar as nome,
        mv.participante_cnpj::varchar as cnpj
    FROM (
        SELECT DISTINCT ON (sub.cod_part)
            sub.cod_part,
            sub.participante_nome,
            sub.participante_cnpj,
            sub.total_valor
        FROM (
            SELECT 
                mv.cod_part,
                mv.participante_nome,
                mv.participante_cnpj,
                SUM(mv.valor) as total_valor
            FROM extensions.mv_mercadorias_participante mv
            WHERE has_filial_access(auth.uid(), mv.filial_id)
            GROUP BY mv.cod_part, mv.participante_nome, mv.participante_cnpj
            ORDER BY SUM(mv.valor) DESC
            LIMIT 500
        ) sub
    ) mv
    ORDER BY mv.total_valor DESC;
END;
$function$;

-- Função de paginação
CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_page(
    p_limit integer DEFAULT 100, 
    p_offset integer DEFAULT 0, 
    p_mes_ano date DEFAULT NULL, 
    p_participante text DEFAULT NULL,
    p_tipo text DEFAULT NULL
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
    valor numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
BEGIN
    -- Limitar para performance
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
        mv.icms,
        mv.mes_ano,
        mv.participante_cnpj::varchar,
        mv.participante_nome::varchar,
        mv.pis,
        mv.tipo::varchar,
        mv.valor
    FROM extensions.mv_mercadorias_participante mv
    WHERE has_filial_access(auth.uid(), mv.filial_id)
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

-- Função de totais
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
BEGIN
    RETURN QUERY
    WITH filtered_data AS (
        SELECT mv.*
        FROM extensions.mv_mercadorias_participante mv
        WHERE has_filial_access(auth.uid(), mv.filial_id)
          AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
          AND (p_participante IS NULL OR p_participante = '' OR 
               mv.participante_nome ILIKE '%' || p_participante || '%' OR
               mv.cod_part ILIKE '%' || p_participante || '%')
        ORDER BY mv.valor DESC
        LIMIT 1000
    )
    SELECT 
        COUNT(*)::bigint as total_registros,
        COALESCE(SUM(fd.valor), 0) as total_valor,
        COALESCE(SUM(CASE WHEN fd.tipo = 'entrada' THEN fd.valor ELSE 0 END), 0) as total_entradas_valor,
        COALESCE(SUM(CASE WHEN fd.tipo = 'entrada' THEN fd.pis ELSE 0 END), 0) as total_entradas_pis,
        COALESCE(SUM(CASE WHEN fd.tipo = 'entrada' THEN fd.cofins ELSE 0 END), 0) as total_entradas_cofins,
        COALESCE(SUM(CASE WHEN fd.tipo = 'entrada' THEN fd.icms ELSE 0 END), 0) as total_entradas_icms,
        COALESCE(SUM(CASE WHEN fd.tipo = 'saida' THEN fd.valor ELSE 0 END), 0) as total_saidas_valor,
        COALESCE(SUM(CASE WHEN fd.tipo = 'saida' THEN fd.pis ELSE 0 END), 0) as total_saidas_pis,
        COALESCE(SUM(CASE WHEN fd.tipo = 'saida' THEN fd.cofins ELSE 0 END), 0) as total_saidas_cofins,
        COALESCE(SUM(CASE WHEN fd.tipo = 'saida' THEN fd.icms ELSE 0 END), 0) as total_saidas_icms
    FROM filtered_data fd;
END;
$function$;

-- Atualizar função de meses disponíveis
CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_meses()
RETURNS TABLE(mes_ano date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
BEGIN
    RETURN QUERY
    SELECT DISTINCT mv.mes_ano
    FROM extensions.mv_mercadorias_participante mv
    WHERE has_filial_access(auth.uid(), mv.filial_id)
    ORDER BY mv.mes_ano DESC;
END;
$function$;