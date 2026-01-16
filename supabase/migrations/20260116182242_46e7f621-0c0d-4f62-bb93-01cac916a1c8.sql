-- Função para retornar dados agregados por regime tributário (Simples Nacional vs Regime Normal)
CREATE OR REPLACE FUNCTION public.get_mv_uso_consumo_by_simples(
  p_filial_id uuid DEFAULT NULL,
  p_mes_ano text DEFAULT NULL
)
RETURNS TABLE(
    is_simples boolean,
    valor numeric,
    icms numeric,
    pis numeric,
    cofins numeric,
    quantidade_docs bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mv.is_simples,
        SUM(mv.valor) as valor,
        SUM(mv.icms) as icms,
        SUM(mv.pis) as pis,
        SUM(mv.cofins) as cofins,
        SUM(mv.quantidade_docs) as quantidade_docs
    FROM extensions.mv_uso_consumo_detailed mv
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND (p_filial_id IS NULL OR mv.filial_id = p_filial_id)
      AND (p_mes_ano IS NULL OR mv.mes_ano::text LIKE p_mes_ano || '%')
    GROUP BY mv.is_simples
    ORDER BY mv.is_simples DESC;
END;
$$;