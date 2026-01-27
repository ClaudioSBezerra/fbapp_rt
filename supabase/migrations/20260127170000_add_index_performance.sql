-- Create index to support "Top 100" query on mv_mercadorias_participante
CREATE INDEX IF NOT EXISTS idx_mv_mercadorias_part_filial_valor 
ON extensions.mv_mercadorias_participante(filial_id, valor DESC);

-- Drop and recreate the page function to ensure it uses the index and has optimal plan
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text);

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
    -- Limitar para performance (safety cap)
    IF p_limit > 100 THEN
        p_limit := 100;
    END IF;
    
    -- Limit offset to prevent deep pagination issues
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
    ORDER BY mv.valor DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$function$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_page(integer, integer, date, text, text) TO authenticated;
