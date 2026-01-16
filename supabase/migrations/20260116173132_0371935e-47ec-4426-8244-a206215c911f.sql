-- Criar tabela simples_nacional para armazenar fornecedores optantes
CREATE TABLE public.simples_nacional (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  cnpj VARCHAR(14) NOT NULL,
  is_simples BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT simples_nacional_tenant_cnpj_unique UNIQUE (tenant_id, cnpj)
);

-- Índice para buscas rápidas por CNPJ
CREATE INDEX idx_simples_nacional_cnpj ON public.simples_nacional(cnpj);
CREATE INDEX idx_simples_nacional_tenant ON public.simples_nacional(tenant_id);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_simples_nacional_updated_at
  BEFORE UPDATE ON public.simples_nacional
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.simples_nacional ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view simples_nacional of their tenant"
  ON public.simples_nacional FOR SELECT
  USING (has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Admins can insert simples_nacional for their tenant"
  ON public.simples_nacional FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Admins can update simples_nacional of their tenant"
  ON public.simples_nacional FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) AND has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Admins can delete simples_nacional of their tenant"
  ON public.simples_nacional FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role) AND has_tenant_access(auth.uid(), tenant_id));

-- Atualizar Materialized View mv_mercadorias_participante para incluir is_simples
DROP MATERIALIZED VIEW IF EXISTS extensions.mv_mercadorias_participante CASCADE;

CREATE MATERIALIZED VIEW extensions.mv_mercadorias_participante AS
SELECT 
    m.filial_id,
    f.razao_social as filial_nome,
    f.cod_est as filial_cod_est,
    f.cnpj as filial_cnpj,
    m.mes_ano,
    m.tipo,
    m.cod_part,
    COALESCE(p.nome, 'Não identificado') as participante_nome,
    COALESCE(p.cnpj, p.cpf, '') as participante_cnpj,
    SUM(m.valor) as valor,
    SUM(m.pis) as pis,
    SUM(m.cofins) as cofins,
    SUM(COALESCE(m.icms, 0)) as icms,
    COALESCE(sn.is_simples, false) as is_simples
FROM public.mercadorias m
JOIN public.filiais f ON f.id = m.filial_id
JOIN public.empresas e ON e.id = f.empresa_id
JOIN public.grupos_empresas g ON g.id = e.grupo_id
LEFT JOIN public.participantes p ON p.cod_part = m.cod_part AND p.filial_id = m.filial_id
LEFT JOIN public.simples_nacional sn 
    ON REPLACE(REPLACE(REPLACE(COALESCE(p.cnpj, ''), '.', ''), '-', ''), '/', '') = sn.cnpj
    AND sn.tenant_id = g.tenant_id
WHERE m.cod_part IS NOT NULL
GROUP BY m.filial_id, f.razao_social, f.cod_est, f.cnpj, m.mes_ano, m.tipo, m.cod_part, p.nome, p.cnpj, p.cpf, sn.is_simples;

CREATE INDEX idx_mv_mercadorias_participante_filial ON extensions.mv_mercadorias_participante(filial_id);
CREATE INDEX idx_mv_mercadorias_participante_mes ON extensions.mv_mercadorias_participante(mes_ano);
CREATE INDEX idx_mv_mercadorias_participante_cod_part ON extensions.mv_mercadorias_participante(cod_part);
CREATE INDEX idx_mv_mercadorias_participante_simples ON extensions.mv_mercadorias_participante(is_simples);

-- Atualizar Materialized View mv_uso_consumo_detailed para incluir is_simples
DROP MATERIALIZED VIEW IF EXISTS extensions.mv_uso_consumo_detailed CASCADE;

CREATE MATERIALIZED VIEW extensions.mv_uso_consumo_detailed AS
SELECT 
    md5(uci.filial_id::text || uci.mes_ano::text || uci.tipo_operacao || uci.cfop || COALESCE(uci.cod_part, '')) as row_id,
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
LEFT JOIN public.participantes p ON p.cod_part = uci.cod_part AND p.filial_id = uci.filial_id
LEFT JOIN public.simples_nacional sn 
    ON REPLACE(REPLACE(REPLACE(COALESCE(p.cnpj, ''), '.', ''), '-', ''), '/', '') = sn.cnpj
    AND sn.tenant_id = g.tenant_id
GROUP BY uci.filial_id, f.razao_social, f.cod_est, f.cnpj, uci.mes_ano, uci.tipo_operacao, uci.cfop, uci.cod_part, p.nome, p.cnpj, p.cpf, sn.is_simples;

CREATE INDEX idx_mv_uso_consumo_detailed_filial ON extensions.mv_uso_consumo_detailed(filial_id);
CREATE INDEX idx_mv_uso_consumo_detailed_mes ON extensions.mv_uso_consumo_detailed(mes_ano);
CREATE INDEX idx_mv_uso_consumo_detailed_simples ON extensions.mv_uso_consumo_detailed(is_simples);

-- Atualizar função get_mercadorias_participante_page para incluir is_simples
CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_page(
    p_limit integer DEFAULT 100, 
    p_offset integer DEFAULT 0, 
    p_mes_ano date DEFAULT NULL::date, 
    p_participante text DEFAULT NULL::text, 
    p_tipo text DEFAULT NULL::text,
    p_is_simples boolean DEFAULT NULL::boolean
)
RETURNS TABLE(
    cod_part character varying, 
    cofins numeric, 
    filial_id uuid, 
    filial_cod_est text, 
    filial_cnpj text, 
    icms numeric, 
    mes_ano date, 
    participante_cnpj character varying, 
    participante_nome character varying, 
    pis numeric, 
    tipo character varying, 
    valor numeric,
    is_simples boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF p_limit > 100 THEN
        p_limit := 100;
    END IF;
    
    IF p_offset > 900 THEN
        p_offset := 900;
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
    WHERE mv.filial_id IN (
        SELECT fil.id 
        FROM public.filiais fil
        JOIN public.empresas e ON e.id = fil.empresa_id
        JOIN public.grupos_empresas g ON g.id = e.grupo_id
        JOIN public.user_tenants ut ON ut.tenant_id = g.tenant_id AND ut.user_id = v_user_id
        LEFT JOIN public.user_empresas ue ON ue.user_id = v_user_id AND ue.empresa_id = e.id
        LEFT JOIN public.user_roles ur ON ur.user_id = v_user_id
        WHERE ur.role = 'admin' OR ue.user_id IS NOT NULL
    )
      AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
      AND (p_participante IS NULL OR p_participante = '' OR 
           mv.participante_nome ILIKE '%' || p_participante || '%' OR
           mv.cod_part ILIKE '%' || p_participante || '%')
      AND (p_tipo IS NULL OR p_tipo = '' OR mv.tipo = p_tipo)
      AND (p_is_simples IS NULL OR mv.is_simples = p_is_simples)
    ORDER BY mv.valor DESC, mv.cod_part, mv.mes_ano
    LIMIT p_limit
    OFFSET p_offset;
END;
$function$;

-- Atualizar função get_mv_uso_consumo_detailed para incluir is_simples
CREATE OR REPLACE FUNCTION public.get_mv_uso_consumo_detailed(
    p_is_simples boolean DEFAULT NULL::boolean
)
RETURNS TABLE(
    row_id text, 
    filial_id uuid, 
    filial_nome text, 
    filial_cod_est text, 
    filial_cnpj text, 
    mes_ano date, 
    tipo_operacao character varying, 
    cfop character varying, 
    cod_part character varying, 
    participante_nome character varying, 
    participante_doc character varying, 
    valor numeric, 
    icms numeric, 
    pis numeric, 
    cofins numeric, 
    quantidade_docs bigint,
    is_simples boolean
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
        mv.valor,
        mv.icms,
        mv.pis,
        mv.cofins,
        mv.quantidade_docs,
        mv.is_simples
    FROM extensions.mv_uso_consumo_detailed mv
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND (p_is_simples IS NULL OR mv.is_simples = p_is_simples)
    ORDER BY mv.mes_ano DESC, mv.tipo_operacao, mv.cfop;
END;
$function$;

-- Atualizar função refresh_materialized_views para incluir as novas views
CREATE OR REPLACE FUNCTION public.refresh_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '300s'
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_servicos_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;
  REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
  REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_detailed;
END;
$function$;