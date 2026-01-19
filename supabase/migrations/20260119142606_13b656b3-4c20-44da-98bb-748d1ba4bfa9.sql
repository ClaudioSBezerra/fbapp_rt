-- Função para listar CNPJs de Uso/Consumo pendentes de cadastro no Simples Nacional
CREATE OR REPLACE FUNCTION public.get_cnpjs_uso_consumo_pendentes(p_tenant_id uuid)
RETURNS TABLE (
    cnpj text,
    nome text,
    quantidade_docs bigint,
    valor_total numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.cnpj_normalizado as cnpj,
        p.nome::text as nome,
        COUNT(DISTINCT uci.id) as quantidade_docs,
        SUM(uci.valor) as valor_total
    FROM uso_consumo_imobilizado uci
    JOIN filiais f ON f.id = uci.filial_id
    JOIN empresas e ON e.id = f.empresa_id
    JOIN grupos_empresas g ON g.id = e.grupo_id
    JOIN participantes p ON p.cod_part = uci.cod_part AND p.filial_id = uci.filial_id
    LEFT JOIN simples_nacional sn ON p.cnpj_normalizado = sn.cnpj AND sn.tenant_id = g.tenant_id
    WHERE g.tenant_id = p_tenant_id
      AND p.cnpj_normalizado IS NOT NULL
      AND p.cnpj_normalizado != ''
      AND sn.id IS NULL
    GROUP BY p.cnpj_normalizado, p.nome
    ORDER BY valor_total DESC;
END;
$$;

-- Atualizar função de estatísticas para incluir Uso/Consumo
CREATE OR REPLACE FUNCTION public.get_simples_link_stats(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT jsonb_build_object(
        -- Estatísticas de Mercadorias
        'mercadorias', (
            SELECT jsonb_build_object(
                'total_participantes', COUNT(DISTINCT p.cnpj_normalizado),
                'vinculados', COUNT(DISTINCT CASE WHEN sn.id IS NOT NULL THEN p.cnpj_normalizado END),
                'pendentes', COUNT(DISTINCT CASE WHEN sn.id IS NULL THEN p.cnpj_normalizado END),
                'optantes_simples', COUNT(DISTINCT CASE WHEN sn.is_simples = true THEN p.cnpj_normalizado END),
                'nao_optantes', COUNT(DISTINCT CASE WHEN sn.is_simples = false THEN p.cnpj_normalizado END)
            )
            FROM mercadorias m
            JOIN filiais f ON f.id = m.filial_id
            JOIN empresas e ON e.id = f.empresa_id
            JOIN grupos_empresas g ON g.id = e.grupo_id
            JOIN participantes p ON p.cod_part = m.cod_part AND p.filial_id = m.filial_id
            LEFT JOIN simples_nacional sn ON p.cnpj_normalizado = sn.cnpj AND sn.tenant_id = g.tenant_id
            WHERE g.tenant_id = p_tenant_id
              AND p.cnpj_normalizado IS NOT NULL
              AND p.cnpj_normalizado != ''
        ),
        -- Estatísticas de Uso e Consumo / Imobilizado
        'uso_consumo', (
            SELECT jsonb_build_object(
                'total_participantes', COUNT(DISTINCT p.cnpj_normalizado),
                'vinculados', COUNT(DISTINCT CASE WHEN sn.id IS NOT NULL THEN p.cnpj_normalizado END),
                'pendentes', COUNT(DISTINCT CASE WHEN sn.id IS NULL THEN p.cnpj_normalizado END),
                'optantes_simples', COUNT(DISTINCT CASE WHEN sn.is_simples = true THEN p.cnpj_normalizado END),
                'nao_optantes', COUNT(DISTINCT CASE WHEN sn.is_simples = false THEN p.cnpj_normalizado END)
            )
            FROM uso_consumo_imobilizado uci
            JOIN filiais f ON f.id = uci.filial_id
            JOIN empresas e ON e.id = f.empresa_id
            JOIN grupos_empresas g ON g.id = e.grupo_id
            JOIN participantes p ON p.cod_part = uci.cod_part AND p.filial_id = uci.filial_id
            LEFT JOIN simples_nacional sn ON p.cnpj_normalizado = sn.cnpj AND sn.tenant_id = g.tenant_id
            WHERE g.tenant_id = p_tenant_id
              AND p.cnpj_normalizado IS NOT NULL
              AND p.cnpj_normalizado != ''
        ),
        -- Total de registros no Simples Nacional
        'total_simples_nacional', (
            SELECT COUNT(*) FROM simples_nacional WHERE tenant_id = p_tenant_id
        )
    ) INTO result;
    
    RETURN result;
END;
$$;