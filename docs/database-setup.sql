-- ============================================================================
-- SCRIPT COMPLETO DE CRIAÇÃO DO BANCO DE DADOS
-- Sistema de Gestão Tributária - Reforma Tributária
-- ============================================================================
-- Este script cria toda a estrutura do banco de dados necessária para o sistema
-- Execute em uma instância Supabase/PostgreSQL limpa
-- ============================================================================

-- ============================================================================
-- SEÇÃO 1: EXTENSÕES E SCHEMAS
-- ============================================================================

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Criar schema para views materializadas (separado do public)
CREATE SCHEMA IF NOT EXISTS extensions;

-- ============================================================================
-- SEÇÃO 2: TIPOS ENUMERADOS
-- ============================================================================

-- Enum para roles de usuário
DO $$ BEGIN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'viewer');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- SEÇÃO 3: TABELAS PRINCIPAIS
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 3.1 TENANTS (Ambientes/Organizações isoladas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL DEFAULT 'Meu Ambiente',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenants IS 'Ambientes isolados para multi-tenancy';

-- -----------------------------------------------------------------------------
-- 3.2 PROFILES (Perfis de usuários)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY, -- Referencia auth.users(id) sem FK explícita
    email TEXT NOT NULL,
    full_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'Perfis de usuários do sistema';

-- -----------------------------------------------------------------------------
-- 3.3 USER_ROLES (Roles dos usuários)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- Referencia auth.users(id) sem FK explícita
    role public.app_role NOT NULL DEFAULT 'user',
    UNIQUE (user_id, role)
);

COMMENT ON TABLE public.user_roles IS 'Roles dos usuários (admin, user, viewer)';

-- -----------------------------------------------------------------------------
-- 3.4 USER_TENANTS (Vínculo usuário-tenant)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- Referencia auth.users(id) sem FK explícita
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, tenant_id)
);

COMMENT ON TABLE public.user_tenants IS 'Vínculo entre usuários e tenants';

-- -----------------------------------------------------------------------------
-- 3.5 GRUPOS_EMPRESAS (Grupos de empresas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grupos_empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.grupos_empresas IS 'Grupos de empresas dentro de um tenant';

-- -----------------------------------------------------------------------------
-- 3.6 EMPRESAS (Empresas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grupo_id UUID NOT NULL REFERENCES public.grupos_empresas(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.empresas IS 'Empresas dentro de grupos';

-- -----------------------------------------------------------------------------
-- 3.7 FILIAIS (Filiais com CNPJ)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.filiais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    cnpj VARCHAR(14) NOT NULL,
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.filiais IS 'Filiais com CNPJ - nível operacional';

-- -----------------------------------------------------------------------------
-- 3.8 ALIQUOTAS (Alíquotas da Reforma Tributária)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.aliquotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ano INTEGER NOT NULL UNIQUE,
    ibs_estadual NUMERIC NOT NULL DEFAULT 0,
    ibs_municipal NUMERIC NOT NULL DEFAULT 0,
    cbs NUMERIC NOT NULL DEFAULT 0,
    reduc_icms NUMERIC NOT NULL DEFAULT 0,
    reduc_piscofins NUMERIC NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.aliquotas IS 'Alíquotas da reforma tributária por ano';

-- -----------------------------------------------------------------------------
-- 3.9 MERCADORIAS (Registros de mercadorias)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mercadorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filial_id UUID NOT NULL REFERENCES public.filiais(id) ON DELETE CASCADE,
    tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'saida')),
    mes_ano DATE NOT NULL,
    ncm VARCHAR(10),
    descricao TEXT,
    valor NUMERIC NOT NULL DEFAULT 0,
    pis NUMERIC NOT NULL DEFAULT 0,
    cofins NUMERIC NOT NULL DEFAULT 0,
    icms NUMERIC DEFAULT 0,
    ipi NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mercadorias IS 'Registros de mercadorias (entradas e saídas)';

-- -----------------------------------------------------------------------------
-- 3.10 FRETES (Registros de fretes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fretes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filial_id UUID NOT NULL REFERENCES public.filiais(id) ON DELETE CASCADE,
    tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('credito', 'debito')),
    mes_ano DATE NOT NULL,
    ncm VARCHAR(10),
    descricao TEXT,
    cnpj_transportadora VARCHAR(14),
    valor NUMERIC NOT NULL DEFAULT 0,
    pis NUMERIC NOT NULL DEFAULT 0,
    cofins NUMERIC NOT NULL DEFAULT 0,
    icms NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fretes IS 'Registros de fretes (créditos e débitos)';

-- -----------------------------------------------------------------------------
-- 3.11 ENERGIA_AGUA (Registros de energia e água)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.energia_agua (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filial_id UUID NOT NULL REFERENCES public.filiais(id) ON DELETE CASCADE,
    tipo_operacao VARCHAR(10) NOT NULL CHECK (tipo_operacao IN ('credito', 'debito')),
    tipo_servico VARCHAR(20) NOT NULL CHECK (tipo_servico IN ('energia', 'agua', 'gas', 'comunicacao')),
    mes_ano DATE NOT NULL,
    descricao TEXT,
    cnpj_fornecedor VARCHAR(14),
    valor NUMERIC NOT NULL DEFAULT 0,
    pis NUMERIC NOT NULL DEFAULT 0,
    cofins NUMERIC NOT NULL DEFAULT 0,
    icms NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.energia_agua IS 'Registros de energia, água, gás e comunicação';

-- -----------------------------------------------------------------------------
-- 3.12 IMPORT_JOBS (Jobs de importação EFD)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- Referencia auth.users(id)
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    filial_id UUID REFERENCES public.filiais(id) ON DELETE SET NULL,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    progress INTEGER NOT NULL DEFAULT 0,
    total_lines INTEGER NOT NULL DEFAULT 0,
    bytes_processed BIGINT DEFAULT 0,
    chunk_number INTEGER DEFAULT 0,
    record_limit INTEGER DEFAULT 0,
    import_scope TEXT NOT NULL DEFAULT 'all' CHECK (import_scope IN ('all', 'mercadorias', 'fretes', 'energia_agua')),
    counts JSONB NOT NULL DEFAULT '{"fretes": 0, "mercadorias": 0, "energia_agua": 0}'::jsonb,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.import_jobs IS 'Jobs de importação de arquivos EFD';

-- -----------------------------------------------------------------------------
-- 3.13 AUDIT_LOGS (Logs de auditoria)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, -- Referencia auth.users(id)
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    table_name TEXT,
    record_count INTEGER,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.audit_logs IS 'Logs de auditoria do sistema';

-- ============================================================================
-- SEÇÃO 4: ÍNDICES DE PERFORMANCE
-- ============================================================================

-- Índices para mercadorias
CREATE INDEX IF NOT EXISTS idx_mercadorias_filial_id ON public.mercadorias(filial_id);
CREATE INDEX IF NOT EXISTS idx_mercadorias_mes_ano ON public.mercadorias(mes_ano DESC);
CREATE INDEX IF NOT EXISTS idx_mercadorias_tipo ON public.mercadorias(tipo);
CREATE INDEX IF NOT EXISTS idx_mercadorias_filial_mes_tipo ON public.mercadorias(filial_id, mes_ano, tipo);

-- Índices para fretes
CREATE INDEX IF NOT EXISTS idx_fretes_filial_id ON public.fretes(filial_id);
CREATE INDEX IF NOT EXISTS idx_fretes_mes_ano ON public.fretes(mes_ano DESC);
CREATE INDEX IF NOT EXISTS idx_fretes_tipo ON public.fretes(tipo);
CREATE INDEX IF NOT EXISTS idx_fretes_filial_mes_tipo ON public.fretes(filial_id, mes_ano, tipo);

-- Índices para energia_agua
CREATE INDEX IF NOT EXISTS idx_energia_agua_filial_id ON public.energia_agua(filial_id);
CREATE INDEX IF NOT EXISTS idx_energia_agua_mes_ano ON public.energia_agua(mes_ano DESC);
CREATE INDEX IF NOT EXISTS idx_energia_agua_tipo_operacao ON public.energia_agua(tipo_operacao);
CREATE INDEX IF NOT EXISTS idx_energia_agua_filial_mes_tipo ON public.energia_agua(filial_id, mes_ano, tipo_operacao);

-- Índices para hierarquia organizacional
CREATE INDEX IF NOT EXISTS idx_grupos_empresas_tenant_id ON public.grupos_empresas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_empresas_grupo_id ON public.empresas(grupo_id);
CREATE INDEX IF NOT EXISTS idx_filiais_empresa_id ON public.filiais(empresa_id);
CREATE INDEX IF NOT EXISTS idx_filiais_cnpj ON public.filiais(cnpj);

-- Índices para usuários
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_user_id ON public.user_tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant_id ON public.user_tenants(tenant_id);

-- Índices para import_jobs
CREATE INDEX IF NOT EXISTS idx_import_jobs_user_id ON public.import_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON public.import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_empresa_id ON public.import_jobs(empresa_id);

-- Índices para audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ============================================================================
-- SEÇÃO 5: FUNÇÕES DE SEGURANÇA
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 5.1 has_role - Verifica se usuário tem determinada role
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role = _role
    )
$$;

COMMENT ON FUNCTION public.has_role IS 'Verifica se o usuário possui a role especificada';

-- -----------------------------------------------------------------------------
-- 5.2 has_tenant_access - Verifica acesso ao tenant
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_tenant_access(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_tenants
        WHERE user_id = _user_id AND tenant_id = _tenant_id
    )
$$;

COMMENT ON FUNCTION public.has_tenant_access IS 'Verifica se o usuário tem acesso ao tenant';

-- -----------------------------------------------------------------------------
-- 5.3 has_filial_access - Verifica acesso à filial (hierarquia completa)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_filial_access(_user_id UUID, _filial_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.filiais f
        JOIN public.empresas e ON e.id = f.empresa_id
        JOIN public.grupos_empresas g ON g.id = e.grupo_id
        JOIN public.user_tenants ut ON ut.tenant_id = g.tenant_id
        WHERE f.id = _filial_id AND ut.user_id = _user_id
    )
$$;

COMMENT ON FUNCTION public.has_filial_access IS 'Verifica se o usuário tem acesso à filial através da hierarquia';

-- -----------------------------------------------------------------------------
-- 5.4 validate_tenant_exists - Valida se tenant existe
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_tenant_exists(_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.tenants WHERE id = _tenant_id
    )
$$;

COMMENT ON FUNCTION public.validate_tenant_exists IS 'Valida se o tenant existe';

-- -----------------------------------------------------------------------------
-- 5.5 get_tenant_name - Obtém nome do tenant
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_tenant_name(_tenant_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT nome FROM public.tenants WHERE id = _tenant_id
$$;

COMMENT ON FUNCTION public.get_tenant_name IS 'Retorna o nome do tenant';

-- ============================================================================
-- SEÇÃO 6: FUNÇÕES DE NEGÓCIO
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 6.1 update_updated_at_column - Atualiza timestamp de modificação
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_updated_at_column IS 'Trigger para atualizar updated_at automaticamente';

-- -----------------------------------------------------------------------------
-- 6.2 get_mercadorias_aggregated - Dados agregados de mercadorias
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_mercadorias_aggregated()
RETURNS TABLE(
    filial_id UUID,
    filial_nome TEXT,
    mes_ano DATE,
    tipo VARCHAR,
    valor NUMERIC,
    pis NUMERIC,
    cofins NUMERIC,
    icms NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

COMMENT ON FUNCTION public.get_mercadorias_aggregated IS 'Retorna mercadorias agregadas por filial/mês/tipo';

-- -----------------------------------------------------------------------------
-- 6.3 delete_mercadorias_batch - Exclusão em lote de mercadorias
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_mercadorias_batch(
    _user_id UUID,
    _filial_ids UUID[],
    _batch_size INTEGER DEFAULT 10000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INT;
    valid_filial_ids UUID[];
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

COMMENT ON FUNCTION public.delete_mercadorias_batch IS 'Exclui mercadorias em lote com validação de acesso';

-- -----------------------------------------------------------------------------
-- 6.4 delete_fretes_batch - Exclusão em lote de fretes
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_fretes_batch(
    _user_id UUID,
    _filial_ids UUID[],
    _batch_size INTEGER DEFAULT 10000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INT;
    valid_filial_ids UUID[];
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

COMMENT ON FUNCTION public.delete_fretes_batch IS 'Exclui fretes em lote com validação de acesso';

-- -----------------------------------------------------------------------------
-- 6.5 delete_energia_agua_batch - Exclusão em lote de energia/água
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_energia_agua_batch(
    _user_id UUID,
    _filial_ids UUID[],
    _batch_size INTEGER DEFAULT 10000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INT;
    valid_filial_ids UUID[];
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

COMMENT ON FUNCTION public.delete_energia_agua_batch IS 'Exclui energia_agua em lote com validação de acesso';

-- ============================================================================
-- SEÇÃO 7: MATERIALIZED VIEWS
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 7.1 mv_mercadorias_aggregated
-- -----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS extensions.mv_mercadorias_aggregated AS
SELECT 
    m.filial_id,
    COALESCE(f.nome_fantasia, f.razao_social) as filial_nome,
    m.mes_ano,
    m.tipo,
    SUM(m.valor) as valor,
    SUM(m.pis) as pis,
    SUM(m.cofins) as cofins,
    SUM(COALESCE(m.icms, 0)) as icms
FROM public.mercadorias m
JOIN public.filiais f ON f.id = m.filial_id
GROUP BY m.filial_id, f.nome_fantasia, f.razao_social, m.mes_ano, m.tipo;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_mercadorias_agg_pk 
ON extensions.mv_mercadorias_aggregated(filial_id, mes_ano, tipo);

-- -----------------------------------------------------------------------------
-- 7.2 mv_fretes_aggregated
-- -----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS extensions.mv_fretes_aggregated AS
SELECT 
    fr.filial_id,
    COALESCE(f.nome_fantasia, f.razao_social) as filial_nome,
    fr.mes_ano,
    fr.tipo,
    SUM(fr.valor) as valor,
    SUM(fr.pis) as pis,
    SUM(fr.cofins) as cofins,
    SUM(fr.icms) as icms
FROM public.fretes fr
JOIN public.filiais f ON f.id = fr.filial_id
GROUP BY fr.filial_id, f.nome_fantasia, f.razao_social, fr.mes_ano, fr.tipo;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_fretes_agg_pk 
ON extensions.mv_fretes_aggregated(filial_id, mes_ano, tipo);

-- -----------------------------------------------------------------------------
-- 7.3 mv_energia_agua_aggregated
-- -----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS extensions.mv_energia_agua_aggregated AS
SELECT 
    ea.filial_id,
    COALESCE(f.nome_fantasia, f.razao_social) as filial_nome,
    ea.mes_ano,
    ea.tipo_operacao,
    ea.tipo_servico,
    SUM(ea.valor) as valor,
    SUM(ea.pis) as pis,
    SUM(ea.cofins) as cofins,
    SUM(ea.icms) as icms
FROM public.energia_agua ea
JOIN public.filiais f ON f.id = ea.filial_id
GROUP BY ea.filial_id, f.nome_fantasia, f.razao_social, ea.mes_ano, ea.tipo_operacao, ea.tipo_servico;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_energia_agua_agg_pk 
ON extensions.mv_energia_agua_aggregated(filial_id, mes_ano, tipo_operacao, tipo_servico);

-- -----------------------------------------------------------------------------
-- 7.4 mv_dashboard_stats
-- -----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS extensions.mv_dashboard_stats AS
SELECT 
    'mercadorias' as categoria,
    tipo as subtipo,
    filial_id,
    mes_ano,
    SUM(valor) as valor,
    SUM(COALESCE(icms, 0)) as icms,
    SUM(pis) as pis,
    SUM(cofins) as cofins
FROM public.mercadorias
GROUP BY tipo, filial_id, mes_ano

UNION ALL

SELECT 
    'fretes' as categoria,
    tipo as subtipo,
    filial_id,
    mes_ano,
    SUM(valor) as valor,
    SUM(icms) as icms,
    SUM(pis) as pis,
    SUM(cofins) as cofins
FROM public.fretes
GROUP BY tipo, filial_id, mes_ano

UNION ALL

SELECT 
    'energia_agua' as categoria,
    tipo_operacao as subtipo,
    filial_id,
    mes_ano,
    SUM(valor) as valor,
    SUM(icms) as icms,
    SUM(pis) as pis,
    SUM(cofins) as cofins
FROM public.energia_agua
GROUP BY tipo_operacao, filial_id, mes_ano;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_stats_pk 
ON extensions.mv_dashboard_stats(categoria, subtipo, filial_id, mes_ano);

-- -----------------------------------------------------------------------------
-- 7.5 Funções para acessar materialized views com RLS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_mv_mercadorias_aggregated()
RETURNS TABLE(
    filial_id UUID,
    filial_nome TEXT,
    mes_ano DATE,
    tipo VARCHAR,
    valor NUMERIC,
    pis NUMERIC,
    cofins NUMERIC,
    icms NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mv.filial_id,
        mv.filial_nome,
        mv.mes_ano,
        mv.tipo::varchar,
        mv.valor,
        mv.pis,
        mv.cofins,
        mv.icms
    FROM extensions.mv_mercadorias_aggregated mv
    WHERE has_filial_access(auth.uid(), mv.filial_id)
    ORDER BY mv.mes_ano DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_mv_fretes_aggregated()
RETURNS TABLE(
    filial_id UUID,
    filial_nome TEXT,
    mes_ano DATE,
    tipo VARCHAR,
    valor NUMERIC,
    pis NUMERIC,
    cofins NUMERIC,
    icms NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mv.filial_id,
        mv.filial_nome,
        mv.mes_ano,
        mv.tipo::varchar,
        mv.valor,
        mv.pis,
        mv.cofins,
        mv.icms
    FROM extensions.mv_fretes_aggregated mv
    WHERE has_filial_access(auth.uid(), mv.filial_id)
    ORDER BY mv.mes_ano DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_mv_energia_agua_aggregated()
RETURNS TABLE(
    filial_id UUID,
    filial_nome TEXT,
    mes_ano DATE,
    tipo_operacao VARCHAR,
    tipo_servico VARCHAR,
    valor NUMERIC,
    pis NUMERIC,
    cofins NUMERIC,
    icms NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mv.filial_id,
        mv.filial_nome,
        mv.mes_ano,
        mv.tipo_operacao::varchar,
        mv.tipo_servico::varchar,
        mv.valor,
        mv.pis,
        mv.cofins,
        mv.icms
    FROM extensions.mv_energia_agua_aggregated mv
    WHERE has_filial_access(auth.uid(), mv.filial_id)
    ORDER BY mv.mes_ano DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_mv_dashboard_stats(_mes_ano DATE DEFAULT NULL)
RETURNS TABLE(
    categoria TEXT,
    subtipo TEXT,
    mes_ano DATE,
    valor NUMERIC,
    icms NUMERIC,
    pis NUMERIC,
    cofins NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
    GROUP BY mv.categoria, mv.subtipo, mv.mes_ano;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7.6 refresh_materialized_views - Atualiza views materializadas
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_materialized_views()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    mv_count INTEGER;
BEGIN
    -- Check if mv_dashboard_stats is empty
    SELECT COUNT(*) INTO mv_count FROM extensions.mv_dashboard_stats;
    
    -- Use CONCURRENTLY only if view has data (CONCURRENTLY fails on empty views)
    IF mv_count = 0 THEN
        -- First time refresh without CONCURRENTLY
        REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
        REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
        REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
        REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
    ELSE
        -- Subsequent refreshes with CONCURRENTLY for non-blocking
        REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_mercadorias_aggregated;
        REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_fretes_aggregated;
        REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_energia_agua_aggregated;
        REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_dashboard_stats;
    END IF;
END;
$$;

COMMENT ON FUNCTION public.refresh_materialized_views IS 'Atualiza todas as materialized views';

-- ============================================================================
-- SEÇÃO 8: TRIGGERS
-- ============================================================================

-- Trigger para atualizar updated_at nas tabelas principais
CREATE OR REPLACE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_grupos_empresas_updated_at
    BEFORE UPDATE ON public.grupos_empresas
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_empresas_updated_at
    BEFORE UPDATE ON public.empresas
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_filiais_updated_at
    BEFORE UPDATE ON public.filiais
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_aliquotas_updated_at
    BEFORE UPDATE ON public.aliquotas
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_mercadorias_updated_at
    BEFORE UPDATE ON public.mercadorias
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_fretes_updated_at
    BEFORE UPDATE ON public.fretes
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_energia_agua_updated_at
    BEFORE UPDATE ON public.energia_agua
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_import_jobs_updated_at
    BEFORE UPDATE ON public.import_jobs
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Trigger para criar profile e role quando usuário é criado
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    admin_exists BOOLEAN;
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

COMMENT ON FUNCTION public.handle_new_user IS 'Cria profile e role automaticamente quando usuário é criado';

-- NOTA: Este trigger deve ser criado no schema auth, que é gerenciado pelo Supabase
-- Se você estiver instalando em uma instância Supabase, execute:
-- CREATE TRIGGER on_auth_user_created
--     AFTER INSERT ON auth.users
--     FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- SEÇÃO 9: ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupos_empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aliquotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fretes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energia_agua ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 9.1 Políticas para PROFILES
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- 9.2 Políticas para USER_ROLES
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view own roles" ON public.user_roles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles" ON public.user_roles
    FOR ALL USING (has_role(auth.uid(), 'admin'));

-- -----------------------------------------------------------------------------
-- 9.3 Políticas para TENANTS
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view their tenants" ON public.tenants
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_tenants
            WHERE user_tenants.tenant_id = tenants.id
            AND user_tenants.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their tenants" ON public.tenants
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM user_tenants
            WHERE user_tenants.tenant_id = tenants.id
            AND user_tenants.user_id = auth.uid()
        )
    );

CREATE POLICY "Only admins can create tenants" ON public.tenants
    FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage tenants" ON public.tenants
    FOR ALL USING (has_role(auth.uid(), 'admin'));

-- -----------------------------------------------------------------------------
-- 9.4 Políticas para USER_TENANTS
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view own tenant links" ON public.user_tenants
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can link themselves to tenants" ON public.user_tenants
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage user tenants" ON public.user_tenants
    FOR ALL USING (has_role(auth.uid(), 'admin'));

-- -----------------------------------------------------------------------------
-- 9.5 Políticas para GRUPOS_EMPRESAS
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view grupos of their tenants" ON public.grupos_empresas
    FOR SELECT USING (has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Users can update grupos of their tenants" ON public.grupos_empresas
    FOR UPDATE USING (has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Users can delete grupos of their tenants" ON public.grupos_empresas
    FOR DELETE USING (has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Admins can insert grupos for their tenants" ON public.grupos_empresas
    FOR INSERT WITH CHECK (
        has_role(auth.uid(), 'admin') AND has_tenant_access(auth.uid(), tenant_id)
    );

-- -----------------------------------------------------------------------------
-- 9.6 Políticas para EMPRESAS
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view empresas of their grupos" ON public.empresas
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM grupos_empresas g
            WHERE g.id = empresas.grupo_id
            AND has_tenant_access(auth.uid(), g.tenant_id)
        )
    );

CREATE POLICY "Users can update empresas of their grupos" ON public.empresas
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM grupos_empresas g
            WHERE g.id = empresas.grupo_id
            AND has_tenant_access(auth.uid(), g.tenant_id)
        )
    );

CREATE POLICY "Users can delete empresas of their grupos" ON public.empresas
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM grupos_empresas g
            WHERE g.id = empresas.grupo_id
            AND has_tenant_access(auth.uid(), g.tenant_id)
        )
    );

CREATE POLICY "Admins can insert empresas for their grupos" ON public.empresas
    FOR INSERT WITH CHECK (
        has_role(auth.uid(), 'admin') AND
        EXISTS (
            SELECT 1 FROM grupos_empresas g
            WHERE g.id = empresas.grupo_id
            AND has_tenant_access(auth.uid(), g.tenant_id)
        )
    );

-- -----------------------------------------------------------------------------
-- 9.7 Políticas para FILIAIS
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view filiais of their empresas" ON public.filiais
    FOR SELECT USING (has_filial_access(auth.uid(), id));

CREATE POLICY "Users can update filiais of their empresas" ON public.filiais
    FOR UPDATE USING (has_filial_access(auth.uid(), id));

CREATE POLICY "Users can delete filiais of their empresas" ON public.filiais
    FOR DELETE USING (has_filial_access(auth.uid(), id));

CREATE POLICY "Admins can insert filiais for their empresas" ON public.filiais
    FOR INSERT WITH CHECK (
        has_role(auth.uid(), 'admin') AND
        EXISTS (
            SELECT 1 FROM empresas e
            JOIN grupos_empresas g ON g.id = e.grupo_id
            WHERE e.id = filiais.empresa_id
            AND has_tenant_access(auth.uid(), g.tenant_id)
        )
    );

-- -----------------------------------------------------------------------------
-- 9.8 Políticas para ALIQUOTAS
-- -----------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view aliquotas" ON public.aliquotas
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage aliquotas" ON public.aliquotas
    FOR ALL USING (has_role(auth.uid(), 'admin'));

-- -----------------------------------------------------------------------------
-- 9.9 Políticas para MERCADORIAS
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view mercadorias of their filiais" ON public.mercadorias
    FOR SELECT USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can insert mercadorias for their filiais" ON public.mercadorias
    FOR INSERT WITH CHECK (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can update mercadorias of their filiais" ON public.mercadorias
    FOR UPDATE USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can delete mercadorias of their filiais" ON public.mercadorias
    FOR DELETE USING (has_filial_access(auth.uid(), filial_id));

-- -----------------------------------------------------------------------------
-- 9.10 Políticas para FRETES
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view fretes of their filiais" ON public.fretes
    FOR SELECT USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can insert fretes for their filiais" ON public.fretes
    FOR INSERT WITH CHECK (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can update fretes of their filiais" ON public.fretes
    FOR UPDATE USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can delete fretes of their filiais" ON public.fretes
    FOR DELETE USING (has_filial_access(auth.uid(), filial_id));

-- -----------------------------------------------------------------------------
-- 9.11 Políticas para ENERGIA_AGUA
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view energia_agua of their filiais" ON public.energia_agua
    FOR SELECT USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can insert energia_agua for their filiais" ON public.energia_agua
    FOR INSERT WITH CHECK (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can update energia_agua of their filiais" ON public.energia_agua
    FOR UPDATE USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can delete energia_agua of their filiais" ON public.energia_agua
    FOR DELETE USING (has_filial_access(auth.uid(), filial_id));

-- -----------------------------------------------------------------------------
-- 9.12 Políticas para IMPORT_JOBS
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view their own import jobs" ON public.import_jobs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own import jobs" ON public.import_jobs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own import jobs" ON public.import_jobs
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own import jobs" ON public.import_jobs
    FOR DELETE USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 9.13 Políticas para AUDIT_LOGS
-- -----------------------------------------------------------------------------
CREATE POLICY "Users can view their tenant audit logs" ON public.audit_logs
    FOR SELECT USING (has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- SEÇÃO 10: STORAGE (Buckets e Políticas)
-- ============================================================================

-- Criar bucket para arquivos EFD
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'efd-files',
    'efd-files',
    false,
    52428800, -- 50MB
    ARRAY['text/plain', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para efd-files
CREATE POLICY "Users can upload EFD files" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'efd-files' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can view their EFD files" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'efd-files' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

CREATE POLICY "Users can delete their EFD files" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'efd-files' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- ============================================================================
-- SEÇÃO 11: CARGA DE DADOS INICIAIS
-- ============================================================================

-- Alíquotas da Reforma Tributária (2027-2033)
INSERT INTO public.aliquotas (ano, ibs_estadual, ibs_municipal, cbs, reduc_icms, reduc_piscofins, is_active) VALUES
    (2027, 0.10, 0.00, 8.80, 0.00, 100.00, true),
    (2028, 0.10, 0.00, 8.80, 0.00, 100.00, true),
    (2029, 5.20, 0.00, 8.80, 20.00, 100.00, true),
    (2030, 10.40, 0.00, 8.80, 40.00, 100.00, true),
    (2031, 15.60, 0.00, 8.80, 60.00, 100.00, true),
    (2032, 20.80, 0.00, 8.80, 80.00, 100.00, true),
    (2033, 26.00, 0.00, 8.80, 100.00, 100.00, true)
ON CONFLICT (ano) DO UPDATE SET
    ibs_estadual = EXCLUDED.ibs_estadual,
    ibs_municipal = EXCLUDED.ibs_municipal,
    cbs = EXCLUDED.cbs,
    reduc_icms = EXCLUDED.reduc_icms,
    reduc_piscofins = EXCLUDED.reduc_piscofins,
    is_active = EXCLUDED.is_active;

-- ============================================================================
-- SEÇÃO 12: REALTIME
-- ============================================================================

-- Habilitar realtime para import_jobs (acompanhamento de progresso)
ALTER PUBLICATION supabase_realtime ADD TABLE public.import_jobs;

-- ============================================================================
-- SEÇÃO 13: COMENTÁRIOS FINAIS E GRANTS
-- ============================================================================

-- Garantir que anon e authenticated possam acessar as funções
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_tenant_access TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_filial_access TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_tenant_exists TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_name TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_mercadorias_aggregated TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mv_mercadorias_aggregated TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mv_fretes_aggregated TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mv_energia_agua_aggregated TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mv_dashboard_stats TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_mercadorias_batch TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_fretes_batch TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_energia_agua_batch TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_materialized_views TO authenticated;

-- Grants para tabelas
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA extensions TO authenticated;

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================

-- NOTA IMPORTANTE:
-- Após executar este script em uma instância Supabase, você deve:
-- 1. Criar o trigger on_auth_user_created no schema auth:
--    CREATE TRIGGER on_auth_user_created
--        AFTER INSERT ON auth.users
--        FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
--
-- 2. Configurar as variáveis de ambiente da aplicação:
--    - VITE_SUPABASE_URL
--    - VITE_SUPABASE_PUBLISHABLE_KEY
--
-- 3. Configurar os secrets para Edge Functions:
--    - SUPABASE_URL
--    - SUPABASE_ANON_KEY
--    - SUPABASE_SERVICE_ROLE_KEY
--    - RESEND_API_KEY (para envio de emails)
