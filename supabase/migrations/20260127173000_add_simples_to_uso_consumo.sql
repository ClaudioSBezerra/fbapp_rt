-- Migration: Add is_simples to mv_uso_consumo_detailed

-- 1. Drop dependent RPC first
DROP FUNCTION IF EXISTS public.get_mv_uso_consumo_detailed();

-- 2. Drop the materialized view
DROP MATERIALIZED VIEW IF EXISTS extensions.mv_uso_consumo_detailed;

-- 3. Recreate the materialized view with is_simples
CREATE MATERIALIZED VIEW extensions.mv_uso_consumo_detailed AS
SELECT 
    (uci.filial_id::text || '-' || uci.mes_ano::text || '-' || uci.tipo_operacao || '-' || uci.cfop || '-' || COALESCE(uci.cod_part, ''))::text as row_id,
    uci.filial_id,
    f.razao_social as filial_nome,
    f.cod_est as filial_cod_est,
    f.cnpj as filial_cnpj,
    uci.mes_ano,
    uci.tipo_operacao,
    uci.cfop,
    uci.cod_part,
    p.nome as participante_nome,
    COALESCE(p.cnpj, p.cpf) as participante_doc,
    COALESCE(sn.is_simples, false) as is_simples,
    SUM(uci.valor) as valor,
    SUM(uci.valor_icms) as icms,
    SUM(uci.valor_pis) as pis,
    SUM(uci.valor_cofins) as cofins,
    COUNT(*) as quantidade_docs
FROM public.uso_consumo_imobilizado uci
JOIN public.filiais f ON f.id = uci.filial_id
LEFT JOIN public.participantes p ON p.cod_part = uci.cod_part AND p.filial_id = uci.filial_id
LEFT JOIN public.simples_nacional sn ON sn.tenant_id = uci.tenant_id AND sn.cnpj = COALESCE(p.cnpj, p.cpf)
GROUP BY 
    uci.filial_id,
    f.razao_social,
    f.cod_est,
    f.cnpj,
    uci.mes_ano,
    uci.tipo_operacao,
    uci.cfop,
    uci.cod_part,
    p.nome,
    p.cnpj,
    p.cpf,
    sn.is_simples;

-- 4. Create indices for performance
CREATE UNIQUE INDEX idx_mv_uso_consumo_detailed_row_id ON extensions.mv_uso_consumo_detailed (row_id);
CREATE INDEX idx_mv_uso_consumo_detailed_filial_mes ON extensions.mv_uso_consumo_detailed (filial_id, mes_ano);
CREATE INDEX idx_mv_uso_consumo_detailed_cfop ON extensions.mv_uso_consumo_detailed (cfop);
CREATE INDEX idx_mv_uso_consumo_detailed_tipo ON extensions.mv_uso_consumo_detailed (tipo_operacao);

-- 5. Recreate RPC function
CREATE OR REPLACE FUNCTION public.get_mv_uso_consumo_detailed()
RETURNS TABLE(
    row_id text,
    filial_id uuid,
    filial_nome text,
    filial_cod_est text,
    filial_cnpj text,
    mes_ano date,
    tipo_operacao varchar,
    cfop varchar,
    cod_part varchar,
    participante_nome varchar,
    participante_doc varchar,
    is_simples boolean,
    valor numeric,
    icms numeric,
    pis numeric,
    cofins numeric,
    quantidade_docs bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        mv.row_id,
        mv.filial_id,
        mv.filial_nome::text,
        mv.filial_cod_est::text,
        mv.filial_cnpj::text,
        mv.mes_ano,
        mv.tipo_operacao::varchar,
        mv.cfop::varchar,
        mv.cod_part::varchar,
        mv.participante_nome::varchar,
        mv.participante_doc::varchar,
        mv.is_simples,
        mv.valor,
        mv.icms,
        mv.pis,
        mv.cofins,
        mv.quantidade_docs
    FROM extensions.mv_uso_consumo_detailed mv
    WHERE has_filial_access(auth.uid(), mv.filial_id)
    ORDER BY mv.mes_ano DESC, mv.tipo_operacao, mv.cfop;
END;
$function$;

-- 6. Grant permissions
GRANT EXECUTE ON FUNCTION public.get_mv_uso_consumo_detailed() TO authenticated;
