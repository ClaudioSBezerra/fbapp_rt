
-- Primeiro DROP das funções existentes
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_totals(date, text);

-- Recriar get_mercadorias_participante_page: limite global de 1000 e excluir NÃO INFORMADO
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
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
    -- Limitar p_limit a no máximo 100 para evitar queries pesadas
    IF p_limit > 100 THEN
        p_limit := 100;
    END IF;
    
    -- Limitar p_offset para não ultrapassar 1000 registros totais
    IF p_offset > 900 THEN
        p_offset := 900;
    END IF;
    
    RETURN QUERY
    SELECT 
        COALESCE(mv.cod_part, 'NAO INFORMADO')::varchar as cod_part,
        mv.cofins,
        mv.filial_id,
        mv.icms,
        mv.mes_ano,
        mv.participante_cnpj::varchar,
        COALESCE(mv.participante_nome, 'NAO INFORMADO')::varchar as participante_nome,
        mv.pis,
        mv.tipo::varchar,
        mv.valor
    FROM extensions.mv_mercadorias_participante mv
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND COALESCE(mv.participante_nome, 'NAO INFORMADO') NOT IN ('NÃO INFORMADO', 'NAO INFORMADO')
      AND mv.participante_nome IS NOT NULL
      AND TRIM(mv.participante_nome) != ''
      AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
      AND (p_participante IS NULL OR p_participante = '' OR 
           mv.participante_nome ILIKE '%' || p_participante || '%' OR
           mv.cod_part ILIKE '%' || p_participante || '%')
      AND (p_tipo IS NULL OR p_tipo = '' OR mv.tipo = p_tipo)
    ORDER BY mv.valor DESC, mv.cod_part, mv.mes_ano
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Recriar get_mercadorias_participante_totals: excluir NÃO INFORMADO e limitar contagem
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
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
    RETURN QUERY
    WITH filtered_data AS (
        SELECT mv.*
        FROM extensions.mv_mercadorias_participante mv
        WHERE has_filial_access(auth.uid(), mv.filial_id)
          AND COALESCE(mv.participante_nome, 'NAO INFORMADO') NOT IN ('NÃO INFORMADO', 'NAO INFORMADO')
          AND mv.participante_nome IS NOT NULL
          AND TRIM(mv.participante_nome) != ''
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
$$;
