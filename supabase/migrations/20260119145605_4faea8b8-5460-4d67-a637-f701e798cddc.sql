-- Corrigir função para listar CNPJs pendentes de Uso/Consumo (fix CAST to text)
CREATE OR REPLACE FUNCTION public.get_cnpjs_uso_consumo_pendentes(p_tenant_id uuid)
RETURNS TABLE (cnpj text, nome text, quantidade_docs bigint, valor_total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.cnpj_normalizado::text as cnpj,
        p.nome::text as nome,
        COUNT(DISTINCT uci.id)::bigint as quantidade_docs,
        COALESCE(SUM(uci.valor), 0)::numeric as valor_total
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

-- Criar função para listar CNPJs pendentes de Mercadorias
CREATE OR REPLACE FUNCTION public.get_cnpjs_mercadorias_pendentes(p_tenant_id uuid)
RETURNS TABLE (cnpj text, nome text, quantidade_docs bigint, valor_total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.cnpj_normalizado::text as cnpj,
        p.nome::text as nome,
        COUNT(DISTINCT m.id)::bigint as quantidade_docs,
        COALESCE(SUM(m.valor), 0)::numeric as valor_total
    FROM mercadorias m
    JOIN filiais f ON f.id = m.filial_id
    JOIN empresas e ON e.id = f.empresa_id
    JOIN grupos_empresas g ON g.id = e.grupo_id
    JOIN participantes p ON p.cod_part = m.cod_part AND p.filial_id = m.filial_id
    LEFT JOIN simples_nacional sn ON p.cnpj_normalizado = sn.cnpj AND sn.tenant_id = g.tenant_id
    WHERE g.tenant_id = p_tenant_id
      AND p.cnpj_normalizado IS NOT NULL
      AND p.cnpj_normalizado != ''
      AND sn.id IS NULL
    GROUP BY p.cnpj_normalizado, p.nome
    ORDER BY valor_total DESC;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.get_cnpjs_uso_consumo_pendentes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cnpjs_mercadorias_pendentes(uuid) TO authenticated;