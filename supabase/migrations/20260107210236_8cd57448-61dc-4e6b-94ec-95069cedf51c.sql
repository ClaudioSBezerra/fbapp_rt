-- Limpar todas as tabelas de usuários na ordem correta (respeitando foreign keys)
DELETE FROM public.user_tenants;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;
DELETE FROM auth.users;