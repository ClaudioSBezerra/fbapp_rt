-- Atualizar função para retornar apenas os 500 maiores participantes por valor
-- Excluindo participantes genéricos (NÃO INFORMADO)
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
    SELECT 
        sub.cod_part::varchar,
        sub.participante_nome::varchar as nome,
        sub.participante_cnpj::varchar as cnpj
    FROM (
        SELECT 
            COALESCE(mv.cod_part, 'NAO INFORMADO') as cod_part,
            COALESCE(mv.participante_nome, 'NAO INFORMADO') as participante_nome,
            mv.participante_cnpj,
            SUM(mv.valor) as total_valor
        FROM extensions.mv_mercadorias_participante mv
        WHERE has_filial_access(auth.uid(), mv.filial_id)
          AND COALESCE(mv.participante_nome, 'NAO INFORMADO') NOT IN ('NÃO INFORMADO', 'NAO INFORMADO')
          AND mv.participante_nome IS NOT NULL
          AND TRIM(mv.participante_nome) != ''
        GROUP BY mv.cod_part, mv.participante_nome, mv.participante_cnpj
        ORDER BY total_valor DESC
        LIMIT 500
    ) sub;
END;
$$;