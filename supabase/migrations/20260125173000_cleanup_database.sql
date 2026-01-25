-- Truncate all data tables to reset environment
-- Using CASCADE to handle dependencies

TRUNCATE TABLE public.filiais CASCADE;
TRUNCATE TABLE public.empresas CASCADE;
TRUNCATE TABLE public.grupos_empresas CASCADE;
TRUNCATE TABLE public.tenants CASCADE;
TRUNCATE TABLE public.user_tenants CASCADE;
TRUNCATE TABLE public.user_roles CASCADE;
TRUNCATE TABLE public.profiles CASCADE;
-- Also clear storage buckets if needed? No, just DB data.
