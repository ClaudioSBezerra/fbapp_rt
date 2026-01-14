CREATE EXTENSION IF NOT EXISTS "pg_graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "plpgsql";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
BEGIN;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'user',
    'viewer'
);


--
-- Name: delete_energia_agua_batch(uuid[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_energia_agua_batch(_filial_ids uuid[], _batch_size integer DEFAULT 10000) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  deleted_count int;
BEGIN
  WITH deleted AS (
    DELETE FROM energia_agua
    WHERE id IN (
      SELECT id FROM energia_agua
      WHERE filial_id = ANY(_filial_ids)
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;


--
-- Name: delete_energia_agua_batch(uuid, uuid[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_energia_agua_batch(_user_id uuid, _filial_ids uuid[], _batch_size integer DEFAULT 10000) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  deleted_count int;
  valid_filial_ids uuid[];
BEGIN
  -- Filtrar apenas filiais que o usuário tem acesso
  SELECT array_agg(id) INTO valid_filial_ids
  FROM unnest(_filial_ids) AS id
  WHERE has_filial_access(_user_id, id);
  
  IF valid_filial_ids IS NULL OR array_length(valid_filial_ids, 1) = 0 THEN
    RETURN 0;
  END IF;
  
  WITH deleted AS (
    DELETE FROM energia_agua
    WHERE id IN (
      SELECT e.id FROM energia_agua e
      WHERE e.filial_id = ANY(valid_filial_ids)
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;


--
-- Name: delete_fretes_batch(uuid[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_fretes_batch(_filial_ids uuid[], _batch_size integer DEFAULT 10000) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  deleted_count int;
BEGIN
  WITH deleted AS (
    DELETE FROM fretes
    WHERE id IN (
      SELECT id FROM fretes
      WHERE filial_id = ANY(_filial_ids)
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;


--
-- Name: delete_fretes_batch(uuid, uuid[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_fretes_batch(_user_id uuid, _filial_ids uuid[], _batch_size integer DEFAULT 10000) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  deleted_count int;
  valid_filial_ids uuid[];
BEGIN
  -- Filtrar apenas filiais que o usuário tem acesso
  SELECT array_agg(id) INTO valid_filial_ids
  FROM unnest(_filial_ids) AS id
  WHERE has_filial_access(_user_id, id);
  
  IF valid_filial_ids IS NULL OR array_length(valid_filial_ids, 1) = 0 THEN
    RETURN 0;
  END IF;
  
  WITH deleted AS (
    DELETE FROM fretes
    WHERE id IN (
      SELECT f.id FROM fretes f
      WHERE f.filial_id = ANY(valid_filial_ids)
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;


--
-- Name: delete_mercadorias_batch(uuid[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_mercadorias_batch(_filial_ids uuid[], _batch_size integer DEFAULT 10000) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  deleted_count int;
BEGIN
  WITH deleted AS (
    DELETE FROM mercadorias
    WHERE id IN (
      SELECT id FROM mercadorias
      WHERE filial_id = ANY(_filial_ids)
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;


--
-- Name: delete_mercadorias_batch(uuid, uuid[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_mercadorias_batch(_user_id uuid, _filial_ids uuid[], _batch_size integer DEFAULT 10000) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  deleted_count int;
  valid_filial_ids uuid[];
BEGIN
  -- Filtrar apenas filiais que o usuário tem acesso
  SELECT array_agg(id) INTO valid_filial_ids
  FROM unnest(_filial_ids) AS id
  WHERE has_filial_access(_user_id, id);
  
  IF valid_filial_ids IS NULL OR array_length(valid_filial_ids, 1) = 0 THEN
    RETURN 0;
  END IF;
  
  WITH deleted AS (
    DELETE FROM mercadorias
    WHERE id IN (
      SELECT m.id FROM mercadorias m
      WHERE m.filial_id = ANY(valid_filial_ids)
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;


--
-- Name: delete_servicos_batch(uuid, uuid[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_servicos_batch(_user_id uuid, _filial_ids uuid[], _batch_size integer DEFAULT 10000) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  deleted_count int;
  valid_filial_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO valid_filial_ids
  FROM unnest(_filial_ids) AS id
  WHERE has_filial_access(_user_id, id);
  
  IF valid_filial_ids IS NULL OR array_length(valid_filial_ids, 1) = 0 THEN
    RETURN 0;
  END IF;
  
  WITH deleted AS (
    DELETE FROM servicos
    WHERE id IN (
      SELECT sv.id FROM servicos sv
      WHERE sv.filial_id = ANY(valid_filial_ids)
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;


--
-- Name: get_mercadorias_aggregated(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_mercadorias_aggregated() RETURNS TABLE(filial_id uuid, filial_nome text, mes_ano date, tipo character varying, valor numeric, pis numeric, cofins numeric, icms numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.filial_id,
    COALESCE(f.nome_fantasia, f.razao_social) as filial_nome,
    m.mes_ano,
    m.tipo,
    SUM(m.valor) as valor,
    SUM(m.pis) as pis,
    SUM(m.cofins) as cofins,
    SUM(COALESCE(m.icms, 0)) as icms
  FROM mercadorias m
  JOIN filiais f ON f.id = m.filial_id
  WHERE has_filial_access(auth.uid(), m.filial_id)
  GROUP BY m.filial_id, f.nome_fantasia, f.razao_social, m.mes_ano, m.tipo
  ORDER BY m.mes_ano DESC;
END;
$$;


--
-- Name: get_mercadorias_participante_lista(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_mercadorias_participante_lista() RETURNS TABLE(cod_part character varying, nome character varying, cnpj character varying)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    RETURN QUERY
    SELECT 
        sub.cod_part::varchar,
        sub.participante_nome::varchar as nome,
        sub.participante_cnpj::varchar as cnpj
    FROM (
        SELECT DISTINCT ON (mv.cod_part)
            mv.cod_part,
            mv.participante_nome,
            mv.participante_cnpj,
            SUM(mv.valor) OVER (PARTITION BY mv.cod_part) as total_valor
        FROM extensions.mv_mercadorias_participante mv
        WHERE mv.filial_id IN (
            SELECT f.id 
            FROM public.filiais f
            JOIN public.empresas e ON e.id = f.empresa_id
            JOIN public.grupos_empresas g ON g.id = e.grupo_id
            JOIN public.user_tenants ut ON ut.tenant_id = g.tenant_id AND ut.user_id = v_user_id
            LEFT JOIN public.user_empresas ue ON ue.user_id = v_user_id AND ue.empresa_id = e.id
            LEFT JOIN public.user_roles ur ON ur.user_id = v_user_id
            WHERE ur.role = 'admin' OR ue.user_id IS NOT NULL
        )
        ORDER BY mv.cod_part, mv.valor DESC
    ) sub
    ORDER BY sub.total_valor DESC
    LIMIT 500;
END;
$$;


--
-- Name: get_mercadorias_participante_meses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_mercadorias_participante_meses() RETURNS TABLE(mes_ano date)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    RETURN QUERY
    SELECT DISTINCT mv.mes_ano
    FROM extensions.mv_mercadorias_participante mv
    WHERE mv.filial_id IN (
        SELECT f.id 
        FROM public.filiais f
        JOIN public.empresas e ON e.id = f.empresa_id
        JOIN public.grupos_empresas g ON g.id = e.grupo_id
        JOIN public.user_tenants ut ON ut.tenant_id = g.tenant_id AND ut.user_id = v_user_id
        LEFT JOIN public.user_empresas ue ON ue.user_id = v_user_id AND ue.empresa_id = e.id
        LEFT JOIN public.user_roles ur ON ur.user_id = v_user_id
        WHERE ur.role = 'admin' OR ue.user_id IS NOT NULL
    )
    ORDER BY mv.mes_ano DESC;
END;
$$;


--
-- Name: get_mercadorias_participante_page(integer, integer, date, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_mercadorias_participante_page(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_mes_ano date DEFAULT NULL::date, p_participante text DEFAULT NULL::text, p_tipo text DEFAULT NULL::text) RETURNS TABLE(cod_part character varying, cofins numeric, filial_id uuid, filial_cod_est text, filial_cnpj text, icms numeric, mes_ano date, participante_cnpj character varying, participante_nome character varying, pis numeric, tipo character varying, valor numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
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
        mv.valor
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
    ORDER BY mv.valor DESC, mv.cod_part, mv.mes_ano
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;


--
-- Name: get_mercadorias_participante_totals(date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_mercadorias_participante_totals(p_mes_ano date DEFAULT NULL::date, p_participante text DEFAULT NULL::text) RETURNS TABLE(total_registros bigint, total_valor numeric, total_entradas_valor numeric, total_entradas_pis numeric, total_entradas_cofins numeric, total_entradas_icms numeric, total_saidas_valor numeric, total_saidas_pis numeric, total_saidas_cofins numeric, total_saidas_icms numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::bigint,
        COALESCE(SUM(mv.valor), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.valor ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.pis ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.cofins ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.icms ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.valor ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.pis ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.cofins ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.icms ELSE 0 END), 0)
    FROM extensions.mv_mercadorias_participante mv
    WHERE mv.filial_id IN (
        SELECT f.id 
        FROM public.filiais f
        JOIN public.empresas e ON e.id = f.empresa_id
        JOIN public.grupos_empresas g ON g.id = e.grupo_id
        JOIN public.user_tenants ut ON ut.tenant_id = g.tenant_id AND ut.user_id = v_user_id
        LEFT JOIN public.user_empresas ue ON ue.user_id = v_user_id AND ue.empresa_id = e.id
        LEFT JOIN public.user_roles ur ON ur.user_id = v_user_id
        WHERE ur.role = 'admin' OR ue.user_id IS NOT NULL
    )
      AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
      AND (p_participante IS NULL OR p_participante = '' OR 
           mv.participante_nome ILIKE '%' || p_participante || '%' OR
           mv.cod_part ILIKE '%' || p_participante || '%');
END;
$$;


--
-- Name: get_mv_dashboard_stats(date, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_mv_dashboard_stats(_mes_ano date DEFAULT NULL::date, _filial_id uuid DEFAULT NULL::uuid) RETURNS TABLE(categoria text, subtipo text, mes_ano date, valor numeric, icms numeric, pis numeric, cofins numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mv.categoria,
    mv.subtipo,
    mv.mes_ano,
    SUM(mv.valor) as valor,
    SUM(mv.icms) as icms,
    SUM(mv.pis) as pis,
    SUM(mv.cofins) as cofins
  FROM extensions.mv_dashboard_stats mv
  WHERE has_filial_access(auth.uid(), mv.filial_id)
    AND (_mes_ano IS NULL OR mv.mes_ano = _mes_ano)
    AND (_filial_id IS NULL OR mv.filial_id = _filial_id)
  GROUP BY mv.categoria, mv.subtipo, mv.mes_ano;
END;
$$;


--
-- Name: get_mv_energia_agua_aggregated(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_mv_energia_agua_aggregated() RETURNS TABLE(filial_id uuid, filial_nome text, filial_cod_est text, filial_cnpj text, mes_ano date, tipo_operacao character varying, tipo_servico character varying, valor numeric, pis numeric, cofins numeric, icms numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
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


--
-- Name: get_mv_fretes_aggregated(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_mv_fretes_aggregated() RETURNS TABLE(filial_id uuid, filial_nome text, filial_cod_est text, filial_cnpj text, mes_ano date, tipo character varying, valor numeric, pis numeric, cofins numeric, icms numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
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


--
-- Name: get_mv_mercadorias_aggregated(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_mv_mercadorias_aggregated() RETURNS TABLE(filial_id uuid, filial_nome text, filial_cod_est text, filial_cnpj text, mes_ano date, tipo character varying, valor numeric, pis numeric, cofins numeric, icms numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
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


--
-- Name: get_mv_mercadorias_participante(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_mv_mercadorias_participante() RETURNS TABLE(filial_id uuid, filial_cod_est text, filial_cnpj text, cod_part character varying, participante_nome character varying, participante_cnpj character varying, mes_ano date, tipo character varying, valor numeric, pis numeric, cofins numeric, icms numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
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


--
-- Name: get_mv_servicos_aggregated(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_mv_servicos_aggregated() RETURNS TABLE(filial_id uuid, filial_nome text, filial_cod_est text, filial_cnpj text, mes_ano date, tipo character varying, valor numeric, pis numeric, cofins numeric, iss numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
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


--
-- Name: get_tenant_name(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tenant_name(_tenant_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT nome FROM public.tenants WHERE id = _tenant_id
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  admin_exists boolean;
  new_role app_role;
BEGIN
  -- Criar profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name');
  
  -- Verificar se existe algum admin no sistema
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'
  ) INTO admin_exists;
  
  -- Se não houver admin, primeiro usuário vira admin
  IF admin_exists THEN
    new_role := 'user';
  ELSE
    new_role := 'admin';
  END IF;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, new_role);
  
  RETURN NEW;
END;
$$;


--
-- Name: has_empresa_access(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_empresa_access(_user_id uuid, _empresa_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    -- Admin tem acesso a todas empresas do tenant
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.user_tenants ut ON ut.user_id = ur.user_id
        JOIN public.grupos_empresas g ON g.tenant_id = ut.tenant_id
        JOIN public.empresas e ON e.grupo_id = g.id
        WHERE ur.user_id = _user_id 
          AND ur.role = 'admin'
          AND e.id = _empresa_id
    )
    OR 
    -- Usuario tem vínculo direto com a empresa
    EXISTS (
        SELECT 1 FROM public.user_empresas
        WHERE user_id = _user_id AND empresa_id = _empresa_id
    )
$$;


--
-- Name: has_filial_access(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_filial_access(_user_id uuid, _filial_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.filiais f
        JOIN public.empresas e ON e.id = f.empresa_id
        JOIN public.grupos_empresas g ON g.id = e.grupo_id
        JOIN public.user_tenants ut ON ut.tenant_id = g.tenant_id
        WHERE f.id = _filial_id 
          AND ut.user_id = _user_id
          AND has_empresa_access(_user_id, e.id)
    )
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;


--
-- Name: has_tenant_access(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_tenant_access(_user_id uuid, _tenant_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_tenants
    WHERE user_id = _user_id AND tenant_id = _tenant_id
  )
$$;


--
-- Name: refresh_materialized_views(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_materialized_views() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET statement_timeout TO '300s'
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  -- Always use non-concurrent refresh for RPC compatibility
  REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_servicos_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;
  REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
END;
$$;


--
-- Name: refresh_materialized_views_async(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_materialized_views_async() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET statement_timeout TO '300s'
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  -- Always use non-concurrent refresh for RPC compatibility
  REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_servicos_aggregated;
  REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;
  REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: validate_tenant_exists(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_tenant_exists(_tenant_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = _tenant_id
  )
$$;


SET default_table_access_method = heap;

--
-- Name: energia_agua; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.energia_agua (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    filial_id uuid NOT NULL,
    tipo_operacao character varying(10) NOT NULL,
    tipo_servico character varying(10) NOT NULL,
    mes_ano date NOT NULL,
    cnpj_fornecedor character varying(14),
    valor numeric(15,2) DEFAULT 0 NOT NULL,
    pis numeric(15,2) DEFAULT 0 NOT NULL,
    cofins numeric(15,2) DEFAULT 0 NOT NULL,
    descricao text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icms numeric DEFAULT 0 NOT NULL,
    CONSTRAINT energia_agua_tipo_operacao_check CHECK (((tipo_operacao)::text = ANY ((ARRAY['credito'::character varying, 'debito'::character varying])::text[]))),
    CONSTRAINT energia_agua_tipo_servico_check CHECK (((tipo_servico)::text = ANY ((ARRAY['energia'::character varying, 'agua'::character varying, 'gas'::character varying, 'comunicacao'::character varying, 'outros'::character varying])::text[])))
);


--
-- Name: fretes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fretes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    filial_id uuid NOT NULL,
    tipo character varying(10) NOT NULL,
    mes_ano date NOT NULL,
    ncm character varying(10),
    descricao text,
    cnpj_transportadora character varying(14),
    valor numeric(15,2) DEFAULT 0 NOT NULL,
    pis numeric(15,2) DEFAULT 0 NOT NULL,
    cofins numeric(15,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icms numeric DEFAULT 0 NOT NULL,
    CONSTRAINT fretes_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['entrada'::character varying, 'saida'::character varying])::text[])))
);


--
-- Name: mercadorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mercadorias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    filial_id uuid NOT NULL,
    tipo character varying(10) NOT NULL,
    mes_ano date NOT NULL,
    ncm character varying(10),
    descricao text,
    valor numeric(15,2) DEFAULT 0 NOT NULL,
    pis numeric(15,2) DEFAULT 0 NOT NULL,
    cofins numeric(15,2) DEFAULT 0 NOT NULL,
    icms numeric(15,2) DEFAULT 0,
    ipi numeric(15,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cod_part character varying(60),
    CONSTRAINT mercadorias_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['entrada'::character varying, 'saida'::character varying])::text[])))
);


--
-- Name: filiais; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.filiais (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    cnpj character varying(14) NOT NULL,
    razao_social text NOT NULL,
    nome_fantasia text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cod_est character varying(60)
);


--
-- Name: participantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.participantes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    filial_id uuid NOT NULL,
    cod_part character varying(60) NOT NULL,
    nome character varying(100) NOT NULL,
    cnpj character varying(14),
    cpf character varying(11),
    ie character varying(14),
    cod_mun character varying(7),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: servicos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.servicos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    filial_id uuid NOT NULL,
    tipo character varying NOT NULL,
    mes_ano date NOT NULL,
    ncm character varying,
    descricao text,
    valor numeric DEFAULT 0 NOT NULL,
    pis numeric DEFAULT 0 NOT NULL,
    cofins numeric DEFAULT 0 NOT NULL,
    iss numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT servicos_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['entrada'::character varying, 'saida'::character varying])::text[])))
);


--
-- Name: aliquotas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aliquotas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ano integer NOT NULL,
    ibs_estadual numeric(5,2) DEFAULT 0 NOT NULL,
    ibs_municipal numeric(5,2) DEFAULT 0 NOT NULL,
    cbs numeric(5,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    reduc_icms numeric DEFAULT 0 NOT NULL,
    reduc_piscofins numeric DEFAULT 0 NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    action text NOT NULL,
    table_name text,
    record_count integer,
    details jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: empresas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.empresas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_id uuid NOT NULL,
    nome text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: grupos_empresas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grupos_empresas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    nome text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: import_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    empresa_id uuid NOT NULL,
    filial_id uuid,
    file_path text NOT NULL,
    file_name text NOT NULL,
    file_size bigint DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    total_lines integer DEFAULT 0 NOT NULL,
    counts jsonb DEFAULT '{"fretes": 0, "mercadorias": 0, "energia_agua": 0}'::jsonb NOT NULL,
    error_message text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    record_limit integer DEFAULT 0,
    bytes_processed bigint DEFAULT 0,
    chunk_number integer DEFAULT 0,
    import_scope text DEFAULT 'all'::text NOT NULL,
    CONSTRAINT import_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'refreshing_views'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    nome text DEFAULT 'Meu Ambiente'::text NOT NULL
);


--
-- Name: user_empresas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_empresas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    empresa_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role DEFAULT 'user'::public.app_role NOT NULL
);


--
-- Name: user_tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: aliquotas aliquotas_ano_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aliquotas
    ADD CONSTRAINT aliquotas_ano_key UNIQUE (ano);


--
-- Name: aliquotas aliquotas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aliquotas
    ADD CONSTRAINT aliquotas_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: empresas empresas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_pkey PRIMARY KEY (id);


--
-- Name: energia_agua energia_agua_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.energia_agua
    ADD CONSTRAINT energia_agua_pkey PRIMARY KEY (id);


--
-- Name: energia_agua energia_agua_unique_record; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.energia_agua
    ADD CONSTRAINT energia_agua_unique_record UNIQUE (filial_id, mes_ano, tipo_operacao, tipo_servico, valor, pis, cofins, icms);


--
-- Name: filiais filiais_cnpj_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filiais
    ADD CONSTRAINT filiais_cnpj_key UNIQUE (cnpj);


--
-- Name: filiais filiais_empresa_cnpj_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filiais
    ADD CONSTRAINT filiais_empresa_cnpj_unique UNIQUE (empresa_id, cnpj);


--
-- Name: filiais filiais_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filiais
    ADD CONSTRAINT filiais_pkey PRIMARY KEY (id);


--
-- Name: fretes fretes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fretes
    ADD CONSTRAINT fretes_pkey PRIMARY KEY (id);


--
-- Name: fretes fretes_unique_record; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fretes
    ADD CONSTRAINT fretes_unique_record UNIQUE (filial_id, mes_ano, tipo, valor, pis, cofins, icms);


--
-- Name: grupos_empresas grupos_empresas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grupos_empresas
    ADD CONSTRAINT grupos_empresas_pkey PRIMARY KEY (id);


--
-- Name: import_jobs import_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_jobs
    ADD CONSTRAINT import_jobs_pkey PRIMARY KEY (id);


--
-- Name: mercadorias mercadorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mercadorias
    ADD CONSTRAINT mercadorias_pkey PRIMARY KEY (id);


--
-- Name: mercadorias mercadorias_unique_record; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mercadorias
    ADD CONSTRAINT mercadorias_unique_record UNIQUE (filial_id, mes_ano, tipo, descricao, valor, pis, cofins, icms, ipi);


--
-- Name: participantes participantes_filial_id_cod_part_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participantes
    ADD CONSTRAINT participantes_filial_id_cod_part_key UNIQUE (filial_id, cod_part);


--
-- Name: participantes participantes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participantes
    ADD CONSTRAINT participantes_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: servicos servicos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.servicos
    ADD CONSTRAINT servicos_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: user_empresas user_empresas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_empresas
    ADD CONSTRAINT user_empresas_pkey PRIMARY KEY (id);


--
-- Name: user_empresas user_empresas_user_id_empresa_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_empresas
    ADD CONSTRAINT user_empresas_user_id_empresa_id_key UNIQUE (user_id, empresa_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: user_tenants user_tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tenants
    ADD CONSTRAINT user_tenants_pkey PRIMARY KEY (id);


--
-- Name: user_tenants user_tenants_user_id_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tenants
    ADD CONSTRAINT user_tenants_user_id_tenant_id_key UNIQUE (user_id, tenant_id);


--
-- Name: user_tenants user_tenants_user_tenant_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tenants
    ADD CONSTRAINT user_tenants_user_tenant_unique UNIQUE (user_id, tenant_id);


--
-- Name: idx_audit_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created_at ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_tenant_id ON public.audit_logs USING btree (tenant_id);


--
-- Name: idx_audit_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: idx_filiais_cod_est; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_filiais_cod_est ON public.filiais USING btree (cod_est);


--
-- Name: idx_mercadorias_cod_part; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mercadorias_cod_part ON public.mercadorias USING btree (cod_part);


--
-- Name: idx_mercadorias_filial_mes_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mercadorias_filial_mes_tipo ON public.mercadorias USING btree (filial_id, mes_ano, tipo);


--
-- Name: idx_mercadorias_mes_ano; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mercadorias_mes_ano ON public.mercadorias USING btree (mes_ano DESC);


--
-- Name: idx_participantes_cnpj; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participantes_cnpj ON public.participantes USING btree (cnpj);


--
-- Name: idx_participantes_cod_part; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participantes_cod_part ON public.participantes USING btree (cod_part);


--
-- Name: idx_participantes_filial; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_participantes_filial ON public.participantes USING btree (filial_id);


--
-- Name: idx_servicos_filial_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_servicos_filial_id ON public.servicos USING btree (filial_id);


--
-- Name: idx_servicos_filial_mes_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_servicos_filial_mes_tipo ON public.servicos USING btree (filial_id, mes_ano, tipo);


--
-- Name: idx_servicos_mes_ano; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_servicos_mes_ano ON public.servicos USING btree (mes_ano);


--
-- Name: idx_servicos_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_servicos_tipo ON public.servicos USING btree (tipo);


--
-- Name: idx_user_empresas_empresa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_empresas_empresa ON public.user_empresas USING btree (empresa_id);


--
-- Name: idx_user_empresas_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_empresas_user ON public.user_empresas USING btree (user_id);


--
-- Name: aliquotas update_aliquotas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_aliquotas_updated_at BEFORE UPDATE ON public.aliquotas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: empresas update_empresas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_empresas_updated_at BEFORE UPDATE ON public.empresas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: energia_agua update_energia_agua_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_energia_agua_updated_at BEFORE UPDATE ON public.energia_agua FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: filiais update_filiais_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_filiais_updated_at BEFORE UPDATE ON public.filiais FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: fretes update_fretes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_fretes_updated_at BEFORE UPDATE ON public.fretes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: grupos_empresas update_grupos_empresas_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_grupos_empresas_updated_at BEFORE UPDATE ON public.grupos_empresas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: import_jobs update_import_jobs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_import_jobs_updated_at BEFORE UPDATE ON public.import_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: mercadorias update_mercadorias_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_mercadorias_updated_at BEFORE UPDATE ON public.mercadorias FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: participantes update_participantes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_participantes_updated_at BEFORE UPDATE ON public.participantes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: servicos update_servicos_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_servicos_updated_at BEFORE UPDATE ON public.servicos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tenants update_tenants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: empresas empresas_grupo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.empresas
    ADD CONSTRAINT empresas_grupo_id_fkey FOREIGN KEY (grupo_id) REFERENCES public.grupos_empresas(id) ON DELETE CASCADE;


--
-- Name: filiais filiais_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.filiais
    ADD CONSTRAINT filiais_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: participantes fk_participantes_filial; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.participantes
    ADD CONSTRAINT fk_participantes_filial FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE CASCADE;


--
-- Name: grupos_empresas grupos_empresas_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grupos_empresas
    ADD CONSTRAINT grupos_empresas_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: import_jobs import_jobs_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_jobs
    ADD CONSTRAINT import_jobs_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: import_jobs import_jobs_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_jobs
    ADD CONSTRAINT import_jobs_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE SET NULL;


--
-- Name: mercadorias mercadorias_filial_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mercadorias
    ADD CONSTRAINT mercadorias_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_empresas user_empresas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_empresas
    ADD CONSTRAINT user_empresas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_tenants user_tenants_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tenants
    ADD CONSTRAINT user_tenants_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: user_tenants user_tenants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tenants
    ADD CONSTRAINT user_tenants_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: empresas Admins can insert empresas for their grupos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert empresas for their grupos" ON public.empresas FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (EXISTS ( SELECT 1
   FROM public.grupos_empresas g
  WHERE ((g.id = empresas.grupo_id) AND public.has_tenant_access(auth.uid(), g.tenant_id))))));


--
-- Name: filiais Admins can insert filiais for their empresas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert filiais for their empresas" ON public.filiais FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) AND (EXISTS ( SELECT 1
   FROM (public.empresas e
     JOIN public.grupos_empresas g ON ((g.id = e.grupo_id)))
  WHERE ((e.id = filiais.empresa_id) AND public.has_tenant_access(auth.uid(), g.tenant_id))))));


--
-- Name: grupos_empresas Admins can insert grupos for their tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can insert grupos for their tenants" ON public.grupos_empresas FOR INSERT TO authenticated WITH CHECK ((public.has_role(auth.uid(), 'admin'::public.app_role) AND public.has_tenant_access(auth.uid(), tenant_id)));


--
-- Name: aliquotas Admins can manage aliquotas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage aliquotas" ON public.aliquotas USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_roles Admins can manage roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage roles" ON public.user_roles USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: tenants Admins can manage tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage tenants" ON public.tenants USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_tenants Admins can manage user tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage user tenants" ON public.user_tenants USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: user_empresas Admins can manage user_empresas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage user_empresas" ON public.user_empresas USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: audit_logs Authenticated users can insert audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: aliquotas Authenticated users can view aliquotas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can view aliquotas" ON public.aliquotas FOR SELECT TO authenticated USING (true);


--
-- Name: tenants Only admins can create tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Only admins can create tenants" ON public.tenants FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: empresas Users can delete empresas of their grupos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete empresas of their grupos" ON public.empresas FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.grupos_empresas g
  WHERE ((g.id = empresas.grupo_id) AND public.has_tenant_access(auth.uid(), g.tenant_id)))));


--
-- Name: energia_agua Users can delete energia_agua of their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete energia_agua of their filiais" ON public.energia_agua FOR DELETE USING (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: filiais Users can delete filiais of their empresas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete filiais of their empresas" ON public.filiais FOR DELETE USING (public.has_filial_access(auth.uid(), id));


--
-- Name: fretes Users can delete fretes of their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete fretes of their filiais" ON public.fretes FOR DELETE USING (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: grupos_empresas Users can delete grupos of their tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete grupos of their tenants" ON public.grupos_empresas FOR DELETE USING (public.has_tenant_access(auth.uid(), tenant_id));


--
-- Name: mercadorias Users can delete mercadorias of their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete mercadorias of their filiais" ON public.mercadorias FOR DELETE USING (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: participantes Users can delete participantes of their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete participantes of their filiais" ON public.participantes FOR DELETE TO authenticated USING (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: servicos Users can delete servicos of their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete servicos of their filiais" ON public.servicos FOR DELETE USING (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: import_jobs Users can delete their own import jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own import jobs" ON public.import_jobs FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: energia_agua Users can insert energia_agua for their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert energia_agua for their filiais" ON public.energia_agua FOR INSERT WITH CHECK (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: fretes Users can insert fretes for their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert fretes for their filiais" ON public.fretes FOR INSERT WITH CHECK (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: mercadorias Users can insert mercadorias for their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert mercadorias for their filiais" ON public.mercadorias FOR INSERT WITH CHECK (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: participantes Users can insert participantes for their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert participantes for their filiais" ON public.participantes FOR INSERT TO authenticated WITH CHECK (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: servicos Users can insert servicos for their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert servicos for their filiais" ON public.servicos FOR INSERT WITH CHECK (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: import_jobs Users can insert their own import jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own import jobs" ON public.import_jobs FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_empresas Users can link themselves; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can link themselves" ON public.user_empresas FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_tenants Users can link themselves to tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can link themselves to tenants" ON public.user_tenants FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: empresas Users can update empresas of their grupos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update empresas of their grupos" ON public.empresas FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.grupos_empresas g
  WHERE ((g.id = empresas.grupo_id) AND public.has_tenant_access(auth.uid(), g.tenant_id)))));


--
-- Name: energia_agua Users can update energia_agua of their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update energia_agua of their filiais" ON public.energia_agua FOR UPDATE USING (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: filiais Users can update filiais of their empresas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update filiais of their empresas" ON public.filiais FOR UPDATE USING (public.has_filial_access(auth.uid(), id));


--
-- Name: fretes Users can update fretes of their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update fretes of their filiais" ON public.fretes FOR UPDATE USING (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: grupos_empresas Users can update grupos of their tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update grupos of their tenants" ON public.grupos_empresas FOR UPDATE USING (public.has_tenant_access(auth.uid(), tenant_id));


--
-- Name: mercadorias Users can update mercadorias of their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update mercadorias of their filiais" ON public.mercadorias FOR UPDATE USING (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: participantes Users can update participantes of their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update participantes of their filiais" ON public.participantes FOR UPDATE TO authenticated USING (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: servicos Users can update servicos of their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update servicos of their filiais" ON public.servicos FOR UPDATE USING (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: import_jobs Users can update their own import jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own import jobs" ON public.import_jobs FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: tenants Users can update their tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their tenants" ON public.tenants FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.user_tenants
  WHERE ((user_tenants.tenant_id = tenants.id) AND (user_tenants.user_id = auth.uid())))));


--
-- Name: empresas Users can view empresas of their grupos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view empresas of their grupos" ON public.empresas FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.grupos_empresas g
  WHERE ((g.id = empresas.grupo_id) AND public.has_tenant_access(auth.uid(), g.tenant_id)))));


--
-- Name: energia_agua Users can view energia_agua of their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view energia_agua of their filiais" ON public.energia_agua FOR SELECT USING (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: filiais Users can view filiais of their empresas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view filiais of their empresas" ON public.filiais FOR SELECT USING (public.has_filial_access(auth.uid(), id));


--
-- Name: fretes Users can view fretes of their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view fretes of their filiais" ON public.fretes FOR SELECT USING (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: grupos_empresas Users can view grupos of their tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view grupos of their tenants" ON public.grupos_empresas FOR SELECT USING (public.has_tenant_access(auth.uid(), tenant_id));


--
-- Name: mercadorias Users can view mercadorias of their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view mercadorias of their filiais" ON public.mercadorias FOR SELECT USING (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: user_empresas Users can view own empresa links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own empresa links" ON public.user_empresas FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: user_roles Users can view own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_tenants Users can view own tenant links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own tenant links" ON public.user_tenants FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: participantes Users can view participantes of their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view participantes of their filiais" ON public.participantes FOR SELECT TO authenticated USING (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: servicos Users can view servicos of their filiais; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view servicos of their filiais" ON public.servicos FOR SELECT USING (public.has_filial_access(auth.uid(), filial_id));


--
-- Name: import_jobs Users can view their own import jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own import jobs" ON public.import_jobs FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: audit_logs Users can view their tenant audit logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenant audit logs" ON public.audit_logs FOR SELECT USING (public.has_tenant_access(auth.uid(), tenant_id));


--
-- Name: tenants Users can view their tenants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their tenants" ON public.tenants FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_tenants
  WHERE ((user_tenants.tenant_id = tenants.id) AND (user_tenants.user_id = auth.uid())))));


--
-- Name: aliquotas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aliquotas ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: empresas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;

--
-- Name: energia_agua; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.energia_agua ENABLE ROW LEVEL SECURITY;

--
-- Name: filiais; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.filiais ENABLE ROW LEVEL SECURITY;

--
-- Name: fretes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fretes ENABLE ROW LEVEL SECURITY;

--
-- Name: grupos_empresas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.grupos_empresas ENABLE ROW LEVEL SECURITY;

--
-- Name: import_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: mercadorias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mercadorias ENABLE ROW LEVEL SECURITY;

--
-- Name: participantes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.participantes ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: servicos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: user_empresas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_empresas ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_tenants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_tenants ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




COMMIT;