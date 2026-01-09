-- Drop and recreate RPC functions to return cod_est and filial_cnpj

-- 1. Update get_mv_mercadorias_aggregated to return cod_est and cnpj
DROP FUNCTION IF EXISTS public.get_mv_mercadorias_aggregated();
CREATE OR REPLACE FUNCTION public.get_mv_mercadorias_aggregated()
 RETURNS TABLE(filial_id uuid, filial_nome text, filial_cod_est text, filial_cnpj text, mes_ano date, tipo character varying, valor numeric, pis numeric, cofins numeric, icms numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    mv.filial_id,
    mv.filial_nome,
    f.cod_est as filial_cod_est,
    f.cnpj as filial_cnpj,
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
$function$;

-- 2. Update get_mv_fretes_aggregated to return cod_est and cnpj
DROP FUNCTION IF EXISTS public.get_mv_fretes_aggregated();
CREATE OR REPLACE FUNCTION public.get_mv_fretes_aggregated()
 RETURNS TABLE(filial_id uuid, filial_nome text, filial_cod_est text, filial_cnpj text, mes_ano date, tipo character varying, valor numeric, pis numeric, cofins numeric, icms numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    mv.filial_id,
    mv.filial_nome,
    f.cod_est as filial_cod_est,
    f.cnpj as filial_cnpj,
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
$function$;

-- 3. Update get_mv_energia_agua_aggregated to return cod_est and cnpj
DROP FUNCTION IF EXISTS public.get_mv_energia_agua_aggregated();
CREATE OR REPLACE FUNCTION public.get_mv_energia_agua_aggregated()
 RETURNS TABLE(filial_id uuid, filial_nome text, filial_cod_est text, filial_cnpj text, mes_ano date, tipo_operacao character varying, tipo_servico character varying, valor numeric, pis numeric, cofins numeric, icms numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    mv.filial_id,
    mv.filial_nome,
    f.cod_est as filial_cod_est,
    f.cnpj as filial_cnpj,
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
$function$;

-- 4. Update get_mv_servicos_aggregated to return cod_est and cnpj
DROP FUNCTION IF EXISTS public.get_mv_servicos_aggregated();
CREATE OR REPLACE FUNCTION public.get_mv_servicos_aggregated()
 RETURNS TABLE(filial_id uuid, filial_nome text, filial_cod_est text, filial_cnpj text, mes_ano date, tipo character varying, valor numeric, pis numeric, cofins numeric, iss numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    mv.filial_id,
    mv.filial_nome,
    f.cod_est as filial_cod_est,
    f.cnpj as filial_cnpj,
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
$function$;

-- 5. Update get_mv_mercadorias_participante to return cod_est and cnpj
DROP FUNCTION IF EXISTS public.get_mv_mercadorias_participante();
CREATE OR REPLACE FUNCTION public.get_mv_mercadorias_participante()
 RETURNS TABLE(filial_id uuid, filial_cod_est text, filial_cnpj text, cod_part character varying, participante_nome character varying, participante_cnpj character varying, mes_ano date, tipo character varying, valor numeric, pis numeric, cofins numeric, icms numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        mv.filial_id,
        f.cod_est as filial_cod_est,
        f.cnpj as filial_cnpj,
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
$function$;

-- 6. Update get_mercadorias_participante_page to return cod_est and cnpj
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text);
CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_page(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_mes_ano date DEFAULT NULL::date, p_participante text DEFAULT NULL::text, p_tipo text DEFAULT NULL::text)
 RETURNS TABLE(cod_part character varying, cofins numeric, filial_id uuid, filial_cod_est text, filial_cnpj text, icms numeric, mes_ano date, participante_cnpj character varying, participante_nome character varying, pis numeric, tipo character varying, valor numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
    -- Limitar para performance
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
        f.cod_est as filial_cod_est,
        f.cnpj as filial_cnpj,
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
$function$;