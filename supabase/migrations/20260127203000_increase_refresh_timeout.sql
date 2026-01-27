-- Increase statement timeout for refresh operations to 10 minutes
CREATE OR REPLACE FUNCTION public.refresh_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
-- Set timeout to 10 minutes (600000ms)
SET statement_timeout TO '600s'
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Refresh each view safely
  PERFORM public.refresh_mv_safe('mv_mercadorias_aggregated');
  PERFORM public.refresh_mv_safe('mv_fretes_aggregated');
  PERFORM public.refresh_mv_safe('mv_energia_agua_aggregated');
  PERFORM public.refresh_mv_safe('mv_servicos_aggregated');
  PERFORM public.refresh_mv_safe('mv_mercadorias_participante');
  PERFORM public.refresh_mv_safe('mv_uso_consumo_aggregated');
  
  -- Check for optional views
  IF EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'extensions' AND matviewname = 'mv_uso_consumo_detailed') THEN
      PERFORM public.refresh_mv_safe('mv_uso_consumo_detailed');
  END IF;
  
  PERFORM public.refresh_mv_safe('mv_dashboard_stats');
END;
$function$;

-- Update the safe refresh helper to also have a high timeout just in case called directly
CREATE OR REPLACE FUNCTION public.refresh_mv_safe(mv_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '600s'
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  is_pop boolean;
  full_name text := 'extensions.' || mv_name;
BEGIN
  -- Check if view exists and is populated
  SELECT ispopulated INTO is_pop 
  FROM pg_matviews 
  WHERE schemaname = 'extensions' AND matviewname = mv_name;
  
  IF is_pop IS NULL THEN
    RAISE NOTICE 'Materialized view % does not exist', full_name;
    RETURN;
  END IF;

  IF is_pop THEN
    BEGIN
      -- Try concurrent refresh first
      EXECUTE 'REFRESH MATERIALIZED VIEW CONCURRENTLY ' || full_name;
    EXCEPTION WHEN OTHERS THEN
      -- Fallback to non-concurrent
      RAISE NOTICE 'Concurrent refresh failed for %, falling back to standard refresh. Error: %', full_name, SQLERRM;
      EXECUTE 'REFRESH MATERIALIZED VIEW ' || full_name;
    END;
  ELSE
    -- Initial population
    EXECUTE 'REFRESH MATERIALIZED VIEW ' || full_name;
  END IF;
END;
$$;

-- Force refresh of the problematic view with the new timeout settings immediately
-- This is a blocking call in the migration to ensure it's fixed
SELECT public.refresh_mv_safe('mv_mercadorias_participante');
