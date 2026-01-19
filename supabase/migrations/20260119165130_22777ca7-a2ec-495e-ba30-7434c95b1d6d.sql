-- Habilitar extensão pg_trgm para busca por texto
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Índices para a view mv_mercadorias_participante
CREATE INDEX IF NOT EXISTS idx_mv_part_cod_part 
ON extensions.mv_mercadorias_participante(cod_part);

CREATE INDEX IF NOT EXISTS idx_mv_part_nome 
ON extensions.mv_mercadorias_participante(participante_nome);

CREATE INDEX IF NOT EXISTS idx_mv_part_valor_desc 
ON extensions.mv_mercadorias_participante(valor DESC);

CREATE INDEX IF NOT EXISTS idx_mv_part_filial_valor 
ON extensions.mv_mercadorias_participante(filial_id, valor DESC);

CREATE INDEX IF NOT EXISTS idx_mv_part_mes_ano 
ON extensions.mv_mercadorias_participante(mes_ano);

CREATE INDEX IF NOT EXISTS idx_mv_part_tipo 
ON extensions.mv_mercadorias_participante(tipo);

CREATE INDEX IF NOT EXISTS idx_mv_part_nome_trgm 
ON extensions.mv_mercadorias_participante 
USING gin(participante_nome gin_trgm_ops);

-- View materializada de cache para participantes únicos
CREATE MATERIALIZED VIEW IF NOT EXISTS extensions.mv_participantes_cache AS
SELECT 
    mv.cod_part,
    mv.participante_nome,
    mv.participante_cnpj,
    g.tenant_id,
    SUM(mv.valor) as total_valor,
    COUNT(*) as total_registros,
    BOOL_OR(mv.is_simples) as is_simples
FROM extensions.mv_mercadorias_participante mv
JOIN public.filiais f ON f.id = mv.filial_id
JOIN public.empresas e ON e.id = f.empresa_id
JOIN public.grupos_empresas g ON g.id = e.grupo_id
GROUP BY mv.cod_part, mv.participante_nome, mv.participante_cnpj, g.tenant_id;

-- Índices para a view de cache
CREATE INDEX IF NOT EXISTS idx_mv_part_cache_tenant 
ON extensions.mv_participantes_cache(tenant_id);

CREATE INDEX IF NOT EXISTS idx_mv_part_cache_nome 
ON extensions.mv_participantes_cache(participante_nome);

CREATE INDEX IF NOT EXISTS idx_mv_part_cache_valor 
ON extensions.mv_participantes_cache(total_valor DESC);

CREATE INDEX IF NOT EXISTS idx_mv_part_cache_nome_trgm 
ON extensions.mv_participantes_cache 
USING gin(participante_nome gin_trgm_ops);

-- Função otimizada para listar participantes (usa cache)
CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_lista()
RETURNS TABLE(cod_part varchar, nome varchar, cnpj varchar)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_tenant_ids uuid[];
BEGIN
    SELECT ARRAY_AGG(DISTINCT ut.tenant_id) INTO v_tenant_ids
    FROM user_tenants ut
    WHERE ut.user_id = v_user_id;

    IF v_tenant_ids IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        pc.cod_part::varchar,
        pc.participante_nome::varchar as nome,
        pc.participante_cnpj::varchar as cnpj
    FROM extensions.mv_participantes_cache pc
    WHERE pc.tenant_id = ANY(v_tenant_ids)
    ORDER BY pc.total_valor DESC
    LIMIT 500;
END;
$$;

-- Função otimizada para buscar página de dados
CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_page(
    p_limit integer DEFAULT 100,
    p_offset integer DEFAULT 0,
    p_mes_ano date DEFAULT NULL,
    p_participante text DEFAULT NULL,
    p_tipo text DEFAULT NULL,
    p_is_simples boolean DEFAULT NULL
)
RETURNS TABLE(
    cod_part varchar,
    cofins numeric,
    filial_id uuid,
    filial_cod_est text,
    filial_cnpj text,
    icms numeric,
    mes_ano date,
    participante_cnpj varchar,
    participante_nome varchar,
    pis numeric,
    tipo varchar,
    valor numeric,
    is_simples boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_filial_ids uuid[];
BEGIN
    IF p_limit > 100 THEN
        p_limit := 100;
    END IF;
    
    IF p_offset > 900 THEN
        p_offset := 900;
    END IF;
    
    SELECT ARRAY_AGG(fil.id) INTO v_filial_ids
    FROM public.filiais fil
    JOIN public.empresas e ON e.id = fil.empresa_id
    JOIN public.grupos_empresas g ON g.id = e.grupo_id
    JOIN public.user_tenants ut ON ut.tenant_id = g.tenant_id AND ut.user_id = v_user_id
    LEFT JOIN public.user_empresas ue ON ue.user_id = v_user_id AND ue.empresa_id = e.id
    LEFT JOIN public.user_roles ur ON ur.user_id = v_user_id
    WHERE ur.role = 'admin' OR ue.user_id IS NOT NULL;

    IF v_filial_ids IS NULL THEN
        RETURN;
    END IF;
    
    RETURN QUERY
    SELECT 
        mv.cod_part::varchar,
        mv.cofins,
        mv.filial_id,
        f.cod_est::text as filial_cod_est,
        f.cnpj::text as filial_cnpj,
        mv.icms,
        mv.mes_ano,
        mv.participante_cnpj::varchar,
        mv.participante_nome::varchar,
        mv.pis,
        mv.tipo::varchar,
        mv.valor,
        mv.is_simples
    FROM extensions.mv_mercadorias_participante mv
    JOIN public.filiais f ON f.id = mv.filial_id
    WHERE mv.filial_id = ANY(v_filial_ids)
      AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
      AND (p_tipo IS NULL OR p_tipo = '' OR mv.tipo = p_tipo)
      AND (p_is_simples IS NULL OR mv.is_simples = p_is_simples)
      AND (
          p_participante IS NULL 
          OR p_participante = '' 
          OR mv.participante_nome ILIKE '%' || p_participante || '%'
          OR mv.cod_part = p_participante
      )
    ORDER BY mv.valor DESC, mv.cod_part, mv.mes_ano
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Grants
GRANT SELECT ON extensions.mv_participantes_cache TO authenticated;