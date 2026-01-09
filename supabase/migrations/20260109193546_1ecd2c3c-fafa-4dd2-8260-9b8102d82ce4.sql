-- 1. Atualizar constraint de status para incluir 'refreshing_views'
ALTER TABLE import_jobs DROP CONSTRAINT IF EXISTS import_jobs_status_check;
ALTER TABLE import_jobs ADD CONSTRAINT import_jobs_status_check 
  CHECK (status = ANY (ARRAY['pending','processing','refreshing_views','completed','failed','cancelled']));

-- 2. Drop e recriar get_mv_mercadorias_aggregated
DROP FUNCTION IF EXISTS public.get_mv_mercadorias_aggregated();
CREATE OR REPLACE FUNCTION public.get_mv_mercadorias_aggregated()
RETURNS TABLE(
  filial_id uuid,
  filial_nome text,
  filial_cod_est text,
  filial_cnpj text,
  mes_ano date,
  tipo character varying,
  valor numeric,
  pis numeric,
  cofins numeric,
  icms numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mv.filial_id,
    mv.filial_nome,
    f.cod_est::text as filial_cod_est,
    f.cnpj::text as filial_cnpj,
    mv.mes_ano,
    mv.tipo::varchar,
    mv.valor,
    mv.pis,
    mv.cofins,
    mv.icms
  FROM extensions.mv_mercadorias_aggregated mv
  JOIN public.filiais f ON f.id = mv.filial_id
  WHERE has_filial_access(auth.uid(), mv.filial_id)
  ORDER BY mv.mes_ano DESC;
END;
$$;

-- 3. Drop e recriar get_mv_fretes_aggregated
DROP FUNCTION IF EXISTS public.get_mv_fretes_aggregated();
CREATE OR REPLACE FUNCTION public.get_mv_fretes_aggregated()
RETURNS TABLE(
  filial_id uuid,
  filial_nome text,
  filial_cod_est text,
  filial_cnpj text,
  mes_ano date,
  tipo character varying,
  valor numeric,
  pis numeric,
  cofins numeric,
  icms numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mv.filial_id,
    mv.filial_nome,
    f.cod_est::text as filial_cod_est,
    f.cnpj::text as filial_cnpj,
    mv.mes_ano,
    mv.tipo::varchar,
    mv.valor,
    mv.pis,
    mv.cofins,
    mv.icms
  FROM extensions.mv_fretes_aggregated mv
  JOIN public.filiais f ON f.id = mv.filial_id
  WHERE has_filial_access(auth.uid(), mv.filial_id)
  ORDER BY mv.mes_ano DESC;
END;
$$;

-- 4. Drop e recriar get_mv_servicos_aggregated
DROP FUNCTION IF EXISTS public.get_mv_servicos_aggregated();
CREATE OR REPLACE FUNCTION public.get_mv_servicos_aggregated()
RETURNS TABLE(
  filial_id uuid,
  filial_nome text,
  filial_cod_est text,
  filial_cnpj text,
  mes_ano date,
  tipo character varying,
  valor numeric,
  pis numeric,
  cofins numeric,
  iss numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mv.filial_id,
    mv.filial_nome,
    f.cod_est::text as filial_cod_est,
    f.cnpj::text as filial_cnpj,
    mv.mes_ano,
    mv.tipo::varchar,
    mv.valor,
    mv.pis,
    mv.cofins,
    mv.iss
  FROM extensions.mv_servicos_aggregated mv
  JOIN public.filiais f ON f.id = mv.filial_id
  WHERE has_filial_access(auth.uid(), mv.filial_id)
  ORDER BY mv.mes_ano DESC;
END;
$$;

-- 5. Drop e recriar get_mv_energia_agua_aggregated
DROP FUNCTION IF EXISTS public.get_mv_energia_agua_aggregated();
CREATE OR REPLACE FUNCTION public.get_mv_energia_agua_aggregated()
RETURNS TABLE(
  filial_id uuid,
  filial_nome text,
  filial_cod_est text,
  filial_cnpj text,
  mes_ano date,
  tipo_operacao character varying,
  tipo_servico character varying,
  valor numeric,
  pis numeric,
  cofins numeric,
  icms numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mv.filial_id,
    mv.filial_nome,
    f.cod_est::text as filial_cod_est,
    f.cnpj::text as filial_cnpj,
    mv.mes_ano,
    mv.tipo_operacao::varchar,
    mv.tipo_servico::varchar,
    mv.valor,
    mv.pis,
    mv.cofins,
    mv.icms
  FROM extensions.mv_energia_agua_aggregated mv
  JOIN public.filiais f ON f.id = mv.filial_id
  WHERE has_filial_access(auth.uid(), mv.filial_id)
  ORDER BY mv.mes_ano DESC;
END;
$$;

-- 6. Drop e recriar get_mv_mercadorias_participante
DROP FUNCTION IF EXISTS public.get_mv_mercadorias_participante();
CREATE OR REPLACE FUNCTION public.get_mv_mercadorias_participante()
RETURNS TABLE(
  filial_id uuid,
  filial_cod_est text,
  filial_cnpj text,
  cod_part character varying,
  participante_nome character varying,
  participante_cnpj character varying,
  mes_ano date,
  tipo character varying,
  valor numeric,
  pis numeric,
  cofins numeric,
  icms numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mv.filial_id,
        f.cod_est::text as filial_cod_est,
        f.cnpj::text as filial_cnpj,
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
    JOIN public.filiais f ON f.id = mv.filial_id
    WHERE has_filial_access(auth.uid(), mv.filial_id)
    ORDER BY mv.valor DESC;
END;
$$;

-- 7. Drop e recriar get_mercadorias_participante_page
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text);
CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_page(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_mes_ano date DEFAULT NULL,
  p_participante text DEFAULT NULL,
  p_tipo text DEFAULT NULL
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
  valor numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
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
        mv.valor
    FROM extensions.mv_mercadorias_participante mv
    JOIN public.filiais f ON f.id = mv.filial_id
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
      AND (p_participante IS NULL OR p_participante = '' OR 
           mv.participante_nome ILIKE '%' || p_participante || '%' OR
           mv.cod_part ILIKE '%' || p_participante || '%')
      AND (p_tipo IS NULL OR p_tipo = '' OR mv.tipo = p_tipo)
    ORDER BY mv.valor DESC, mv.cod_part, mv.mes_ano
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Regrant execute permissions
GRANT EXECUTE ON FUNCTION public.get_mv_mercadorias_aggregated() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mv_fretes_aggregated() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mv_servicos_aggregated() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mv_energia_agua_aggregated() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mv_mercadorias_participante() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_page(integer, integer, date, text, text) TO authenticated;