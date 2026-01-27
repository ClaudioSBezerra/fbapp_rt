-- Fix auxiliary RPCs to filter by selected company

-- 1. Update get_mercadorias_participante_meses
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_meses();

CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_meses(
    p_empresa_id uuid DEFAULT NULL
)
RETURNS TABLE(mes_ano date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT mv.mes_ano
    FROM extensions.mv_mercadorias_participante mv
    JOIN public.filiais f_filter ON f_filter.id = mv.filial_id
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND (p_empresa_id IS NULL OR f_filter.empresa_id = p_empresa_id)
    ORDER BY mv.mes_ano DESC;
END;
$$;

-- 2. Update get_mercadorias_participante_lista
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_lista();

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
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (COALESCE(mv.participante_nome, 'NAO INFORMADO'))
        COALESCE(mv.cod_part, 'NAO INFORMADO')::varchar as cod_part,
        COALESCE(mv.participante_nome, 'NAO INFORMADO')::varchar as nome,
        mv.participante_cnpj::varchar as cnpj
    FROM extensions.mv_mercadorias_participante mv
    JOIN public.filiais f_filter ON f_filter.id = mv.filial_id
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND (p_empresa_id IS NULL OR f_filter.empresa_id = p_empresa_id)
    ORDER BY COALESCE(mv.participante_nome, 'NAO INFORMADO');
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_meses(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_lista(uuid) TO authenticated;
