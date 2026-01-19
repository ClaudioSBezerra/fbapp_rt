-- Remover view existente com estrutura incorreta
DROP MATERIALIZED VIEW IF EXISTS extensions.mv_uso_consumo_detailed;

-- Recriar com estrutura correta (agregada por participante)
CREATE MATERIALIZED VIEW extensions.mv_uso_consumo_detailed AS
SELECT 
    md5(
        uci.filial_id::text || 
        uci.mes_ano::text || 
        uci.tipo_operacao || 
        uci.cfop || 
        COALESCE(uci.cod_part, '')
    ) as row_id,
    uci.filial_id,
    f.razao_social as filial_nome,
    f.cod_est as filial_cod_est,
    f.cnpj as filial_cnpj,
    uci.mes_ano,
    uci.tipo_operacao,
    uci.cfop,
    uci.cod_part,
    COALESCE(p.nome, 'Não identificado') as participante_nome,
    COALESCE(p.cnpj, p.cpf, '') as participante_doc,
    SUM(uci.valor) as valor,
    SUM(uci.valor_icms) as icms,
    SUM(uci.valor_pis) as pis,
    SUM(uci.valor_cofins) as cofins,
    COUNT(*) as quantidade_docs,
    COALESCE(sn.is_simples, false) as is_simples
FROM public.uso_consumo_imobilizado uci
JOIN public.filiais f ON f.id = uci.filial_id
JOIN public.empresas e ON e.id = f.empresa_id
JOIN public.grupos_empresas g ON g.id = e.grupo_id
LEFT JOIN public.participantes p 
    ON p.cod_part = uci.cod_part AND p.filial_id = uci.filial_id
LEFT JOIN public.simples_nacional sn 
    ON p.cnpj_normalizado = sn.cnpj AND sn.tenant_id = g.tenant_id
GROUP BY 
    uci.filial_id, f.razao_social, f.cod_est, f.cnpj, 
    uci.mes_ano, uci.tipo_operacao, uci.cfop, uci.cod_part, 
    p.nome, p.cnpj, p.cpf, sn.is_simples;

-- Índices para performance
CREATE UNIQUE INDEX idx_mv_uso_consumo_detailed_row_id
ON extensions.mv_uso_consumo_detailed (row_id);

CREATE INDEX idx_mv_uso_consumo_detailed_filial_mes
ON extensions.mv_uso_consumo_detailed (filial_id, mes_ano);

CREATE INDEX idx_mv_uso_consumo_detailed_is_simples
ON extensions.mv_uso_consumo_detailed (is_simples);

-- Atualizar a lista de views no edge function refresh-views
-- A view extensions.mv_uso_consumo_detailed já está na lista