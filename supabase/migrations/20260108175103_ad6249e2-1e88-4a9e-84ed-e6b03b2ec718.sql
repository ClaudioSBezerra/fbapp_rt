-- Função RPC para TOTAIS (retorna 1 linha com somas agregadas)
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
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::bigint as total_registros,
        COALESCE(SUM(mv.valor), 0) as total_valor,
        COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.valor ELSE 0 END), 0) as total_entradas_valor,
        COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.pis ELSE 0 END), 0) as total_entradas_pis,
        COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.cofins ELSE 0 END), 0) as total_entradas_cofins,
        COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.icms ELSE 0 END), 0) as total_entradas_icms,
        COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.valor ELSE 0 END), 0) as total_saidas_valor,
        COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.pis ELSE 0 END), 0) as total_saidas_pis,
        COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.cofins ELSE 0 END), 0) as total_saidas_cofins,
        COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.icms ELSE 0 END), 0) as total_saidas_icms
    FROM extensions.mv_mercadorias_participante mv
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
      AND (p_participante IS NULL OR p_participante = '' OR 
           COALESCE(mv.participante_nome, 'NAO INFORMADO') ILIKE '%' || p_participante || '%' OR
           COALESCE(mv.cod_part, 'NAO INFORMADO') ILIKE '%' || p_participante || '%');
END;
$$;

-- Função RPC paginada para LISTAGEM
CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_page(
    p_limit int DEFAULT 50,
    p_offset int DEFAULT 0,
    p_mes_ano date DEFAULT NULL,
    p_participante text DEFAULT NULL,
    p_tipo text DEFAULT NULL
)
RETURNS TABLE(
    filial_id uuid,
    cod_part varchar,
    participante_nome varchar,
    participante_cnpj varchar,
    mes_ano date,
    tipo varchar,
    valor numeric,
    pis numeric,
    cofins numeric,
    icms numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mv.filial_id,
        COALESCE(mv.cod_part, 'NAO INFORMADO')::varchar as cod_part,
        COALESCE(mv.participante_nome, 'NAO INFORMADO')::varchar as participante_nome,
        mv.participante_cnpj,
        mv.mes_ano,
        mv.tipo::varchar,
        mv.valor,
        mv.pis,
        mv.cofins,
        mv.icms
    FROM extensions.mv_mercadorias_participante mv
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
      AND (p_participante IS NULL OR p_participante = '' OR 
           COALESCE(mv.participante_nome, 'NAO INFORMADO') ILIKE '%' || p_participante || '%' OR
           COALESCE(mv.cod_part, 'NAO INFORMADO') ILIKE '%' || p_participante || '%')
      AND (p_tipo IS NULL OR p_tipo = '' OR mv.tipo = p_tipo)
    ORDER BY mv.valor DESC, mv.cod_part, mv.mes_ano
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_totals TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_page TO authenticated;