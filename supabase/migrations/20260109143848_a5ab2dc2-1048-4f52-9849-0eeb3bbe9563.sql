-- Remove the old single-parameter overload that's causing PGRST203 conflict
DROP FUNCTION IF EXISTS public.get_mv_dashboard_stats(date);

-- Keep only the version with both optional parameters:
-- public.get_mv_dashboard_stats(_mes_ano date DEFAULT NULL, _filial_id uuid DEFAULT NULL)