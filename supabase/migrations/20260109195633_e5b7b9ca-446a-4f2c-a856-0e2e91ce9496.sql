-- Corrigir função get_mercadorias_participante_totals removendo o LIMIT 1000
-- que estava causando perda de ~23% dos dados nos totalizadores

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
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
      AND (p_participante IS NULL OR p_participante = '' OR 
           mv.participante_nome ILIKE '%' || p_participante || '%' OR
           mv.cod_part ILIKE '%' || p_participante || '%');
END;
$function$;

-- Garantir permissões
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_totals(date, text) TO authenticated;