-- Fix get_mv_mercadorias_participante function - type mismatch between TEXT and VARCHAR
DROP FUNCTION IF EXISTS public.get_mv_mercadorias_participante();

CREATE OR REPLACE FUNCTION public.get_mv_mercadorias_participante()
RETURNS TABLE(
    filial_id UUID,
    cod_part VARCHAR,
    participante_nome VARCHAR,
    participante_cnpj VARCHAR,
    mes_ano DATE,
    tipo VARCHAR,
    valor NUMERIC,
    pis NUMERIC,
    cofins NUMERIC,
    icms NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mv.filial_id,
        mv.cod_part,
        mv.participante_nome,
        mv.participante_cnpj,
        mv.mes_ano,
        mv.tipo::varchar,
        mv.valor,
        mv.pis,
        mv.cofins,
        mv.icms
    FROM extensions.mv_mercadorias_participante mv
    WHERE has_filial_access(auth.uid(), mv.filial_id)
    ORDER BY mv.valor DESC;
END;
$$;