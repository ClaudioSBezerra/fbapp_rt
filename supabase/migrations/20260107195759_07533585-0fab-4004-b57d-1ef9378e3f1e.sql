-- Limpeza Completa da Base de Dados

-- 1. Deletar dados transacionais (respeitando foreign keys)
DELETE FROM public.mercadorias;
DELETE FROM public.energia_agua;
DELETE FROM public.fretes;
DELETE FROM public.import_jobs;
DELETE FROM public.audit_logs;
DELETE FROM public.aliquotas;

-- 2. Deletar estrutura de empresas
DELETE FROM public.filiais;
DELETE FROM public.empresas;
DELETE FROM public.grupos_empresas;

-- 3. Deletar vínculos de tenants e usuários
DELETE FROM public.user_tenants;
DELETE FROM public.tenants;

-- 4. Deletar roles e profiles
DELETE FROM public.user_roles;
DELETE FROM public.profiles;

-- 5. Refresh das materialized views
SELECT public.refresh_materialized_views();