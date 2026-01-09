-- Function 1: Get distinct months for filters (lightweight)
CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_meses()
RETURNS TABLE(mes_ano date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT mv.mes_ano
    FROM extensions.mv_mercadorias_participante mv
    WHERE has_filial_access(auth.uid(), mv.filial_id)
    ORDER BY mv.mes_ano DESC;
END;
$$;

-- Function 2: Get distinct participants for filters (lightweight)
CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_lista()
RETURNS TABLE(
    cod_part varchar,
    nome varchar,
    cnpj varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (COALESCE(mv.participante_nome, 'NAO INFORMADO'))
        COALESCE(mv.cod_part, 'NAO INFORMADO')::varchar as cod_part,
        COALESCE(mv.participante_nome, 'NAO INFORMADO')::varchar as nome,
        mv.participante_cnpj::varchar as cnpj
    FROM extensions.mv_mercadorias_participante mv
    WHERE has_filial_access(auth.uid(), mv.filial_id)
    ORDER BY COALESCE(mv.participante_nome, 'NAO INFORMADO');
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_meses() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_lista() TO authenticated;