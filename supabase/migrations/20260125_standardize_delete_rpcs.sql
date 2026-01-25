-- Migration: Standardize Batch Delete RPC Functions
-- Date: 2026-01-25
-- Description: Creates or replaces batch delete functions for all major data tables to ensure consistency, 
--              security (RLS/Access Check), and performance (Batching).

-- 1. Mercadorias
CREATE OR REPLACE FUNCTION public.delete_mercadorias_batch(_user_id uuid, _filial_ids uuid[], _batch_size integer DEFAULT 10000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count int;
  valid_filial_ids uuid[];
BEGIN
  -- Validate access
  SELECT array_agg(id) INTO valid_filial_ids
  FROM unnest(_filial_ids) AS id
  WHERE has_filial_access(_user_id, id);
  
  IF valid_filial_ids IS NULL OR array_length(valid_filial_ids, 1) = 0 THEN
    RETURN 0;
  END IF;
  
  WITH deleted AS (
    DELETE FROM mercadorias
    WHERE id IN (
      SELECT id FROM mercadorias
      WHERE filial_id = ANY(valid_filial_ids)
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- 2. Serviços
CREATE OR REPLACE FUNCTION public.delete_servicos_batch(_user_id uuid, _filial_ids uuid[], _batch_size integer DEFAULT 10000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
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
      SELECT id FROM servicos
      WHERE filial_id = ANY(valid_filial_ids)
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- 3. Fretes
CREATE OR REPLACE FUNCTION public.delete_fretes_batch(_user_id uuid, _filial_ids uuid[], _batch_size integer DEFAULT 10000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
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
    DELETE FROM fretes
    WHERE id IN (
      SELECT id FROM fretes
      WHERE filial_id = ANY(valid_filial_ids)
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- 4. Energia e Água
CREATE OR REPLACE FUNCTION public.delete_energia_agua_batch(_user_id uuid, _filial_ids uuid[], _batch_size integer DEFAULT 10000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
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
    DELETE FROM energia_agua
    WHERE id IN (
      SELECT id FROM energia_agua
      WHERE filial_id = ANY(valid_filial_ids)
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- 5. Uso, Consumo e Imobilizado
CREATE OR REPLACE FUNCTION public.delete_uso_consumo_imobilizado_batch(_user_id uuid, _filial_ids uuid[], _batch_size integer DEFAULT 10000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
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
    DELETE FROM uso_consumo_imobilizado
    WHERE id IN (
      SELECT id FROM uso_consumo_imobilizado
      WHERE filial_id = ANY(valid_filial_ids)
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- 6. Participantes
CREATE OR REPLACE FUNCTION public.delete_participantes_batch(_user_id uuid, _filial_ids uuid[], _batch_size integer DEFAULT 10000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
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
    DELETE FROM participantes
    WHERE id IN (
      SELECT id FROM participantes
      WHERE filial_id = ANY(valid_filial_ids)
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- 7. Import Jobs (User scoped)
CREATE OR REPLACE FUNCTION public.delete_import_jobs_batch(_user_id uuid, _batch_size integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count int;
BEGIN
  WITH deleted AS (
    DELETE FROM import_jobs
    WHERE id IN (
      SELECT id FROM import_jobs
      WHERE user_id = _user_id
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;
