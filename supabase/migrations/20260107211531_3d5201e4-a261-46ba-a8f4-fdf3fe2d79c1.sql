-- Limpeza completa da base de dados para recomeçar do zero

-- 1. Limpar dados operacionais
DELETE FROM public.mercadorias;
DELETE FROM public.energia_agua;
DELETE FROM public.fretes;
DELETE FROM public.import_jobs;
DELETE FROM public.audit_logs;
DELETE FROM public.aliquotas;

-- 2. Limpar estrutura organizacional
DELETE FROM public.filiais;
DELETE FROM public.empresas;
DELETE FROM public.grupos_empresas;

-- 3. Limpar vínculos de usuários
DELETE FROM public.user_tenants;
DELETE FROM public.tenants;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;

-- 4. Limpar usuários do auth
DELETE FROM auth.users;