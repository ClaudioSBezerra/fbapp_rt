-- Recriar materialized view para incluir TODOS os registros de mercadorias
-- Tratando cod_part NULL como 'NAOINFORMADO'

DROP MATERIALIZED VIEW IF EXISTS extensions.mv_mercadorias_participante;

CREATE MATERIALIZED VIEW extensions.mv_mercadorias_participante AS
SELECT 
    m.filial_id,
    COALESCE(m.cod_part, 'NAOINFORMADO')::varchar as cod_part,
    CASE 
        WHEN m.cod_part IS NULL THEN 'NÃO INFORMADO'
        WHEN p.nome IS NOT NULL THEN p.nome::varchar
        ELSE ('Participante ' || m.cod_part)::varchar
    END as participante_nome,
    p.cnpj as participante_cnpj,
    m.mes_ano,
    m.tipo,
    SUM(m.valor) as valor,
    SUM(m.pis) as pis,
    SUM(m.cofins) as cofins,
    SUM(COALESCE(m.icms, 0)) as icms
FROM public.mercadorias m
LEFT JOIN public.participantes p 
    ON p.filial_id = m.filial_id 
    AND p.cod_part = m.cod_part
GROUP BY 
    m.filial_id, 
    COALESCE(m.cod_part, 'NAOINFORMADO'), 
    CASE 
        WHEN m.cod_part IS NULL THEN 'NÃO INFORMADO'
        WHEN p.nome IS NOT NULL THEN p.nome::varchar
        ELSE ('Participante ' || m.cod_part)::varchar
    END,
    p.cnpj, 
    m.mes_ano, 
    m.tipo;

-- Recriar índice único
CREATE UNIQUE INDEX idx_mv_mercadorias_part_pk 
ON extensions.mv_mercadorias_participante(filial_id, cod_part, mes_ano, tipo);

-- Atualizar função RPC para corresponder à nova estrutura
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

-- Refresh para popular com dados existentes
REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;