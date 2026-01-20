-- ============================================================
-- FUNÇÃO CENTRALIZADA: refresh_all_materialized_views()
-- Fonte única de verdade para refresh de todas as 11 MVs
-- Retorna JSON com resultado detalhado
-- ============================================================

CREATE OR REPLACE FUNCTION public.refresh_all_materialized_views()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  start_time timestamptz := clock_timestamp();
  view_start_time timestamptz;
  views_refreshed text[] := '{}';
  views_failed jsonb := '[]'::jsonb;
  view_name text;
  view_duration_ms int;
  total_duration_ms int;
  err_msg text;
  err_detail text;
BEGIN
  -- Lista ordenada de views (ordem de dependência: cache base primeiro, stats por último)
  -- Total: 11 views
  FOR view_name IN 
    SELECT unnest(ARRAY[
      'extensions.mv_participantes_cache',      -- 1. Cache base (dependência de outras)
      'extensions.mv_mercadorias_aggregated',   -- 2. Agregados base
      'extensions.mv_fretes_aggregated',        -- 3.
      'extensions.mv_energia_agua_aggregated',  -- 4.
      'extensions.mv_servicos_aggregated',      -- 5.
      'extensions.mv_uso_consumo_aggregated',   -- 6.
      'extensions.mv_mercadorias_participante', -- 7. Depende de participantes_cache
      'extensions.mv_fretes_detailed',          -- 8. Detalhados
      'extensions.mv_energia_agua_detailed',    -- 9.
      'extensions.mv_uso_consumo_detailed',     -- 10.
      'extensions.mv_dashboard_stats'           -- 11. Dashboard (depende de todos)
    ])
  LOOP
    view_start_time := clock_timestamp();
    BEGIN
      -- Timeout de 120s por view individual
      EXECUTE format('SET LOCAL statement_timeout = ''120s''; REFRESH MATERIALIZED VIEW %s', view_name);
      
      view_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - view_start_time)) * 1000;
      views_refreshed := array_append(views_refreshed, view_name);
      
      RAISE NOTICE 'Refreshed % in %ms', view_name, view_duration_ms;
      
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT, err_detail = PG_EXCEPTION_DETAIL;
      view_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - view_start_time)) * 1000;
      
      views_failed := views_failed || jsonb_build_object(
        'view', view_name,
        'error', err_msg,
        'detail', err_detail,
        'duration_ms', view_duration_ms
      );
      
      RAISE WARNING 'Failed to refresh %: % (%)', view_name, err_msg, err_detail;
    END;
  END LOOP;
  
  total_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000;
  
  RETURN jsonb_build_object(
    'success', jsonb_array_length(views_failed) = 0,
    'views_refreshed', to_jsonb(views_refreshed),
    'views_failed', views_failed,
    'total_views', 11,
    'refreshed_count', array_length(views_refreshed, 1),
    'failed_count', jsonb_array_length(views_failed),
    'duration_ms', total_duration_ms
  );
END;
$$;

-- ============================================================
-- FUNÇÃO: delete_efd_raw_lines_batch
-- Deleta linhas do buffer efd_raw_lines em lotes por job_ids
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_efd_raw_lines_batch(
  _job_ids text[],
  _batch_size int DEFAULT 50000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Deletar em lote por job_id
  WITH deleted AS (
    DELETE FROM efd_raw_lines
    WHERE id IN (
      SELECT id FROM efd_raw_lines
      WHERE job_id = ANY(_job_ids)
      LIMIT _batch_size
      FOR UPDATE SKIP LOCKED
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- ============================================================
-- Atualizar funções legadas para chamar a nova função central
-- ============================================================

CREATE OR REPLACE FUNCTION public.refresh_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  result := refresh_all_materialized_views();
  
  IF NOT (result->>'success')::boolean THEN
    RAISE WARNING 'Some views failed to refresh: %', result->>'views_failed';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_materialized_views_async()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delega para função síncrona (async seria via pg_cron, mas mantemos compatibilidade)
  PERFORM refresh_materialized_views();
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.refresh_all_materialized_views() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_efd_raw_lines_batch(text[], int) TO authenticated;