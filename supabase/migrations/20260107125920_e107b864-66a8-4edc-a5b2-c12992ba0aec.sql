-- Function to delete mercadorias in batches
CREATE OR REPLACE FUNCTION public.delete_mercadorias_batch(
  _filial_ids uuid[],
  _batch_size int DEFAULT 10000
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Function to delete energia_agua in batches
CREATE OR REPLACE FUNCTION public.delete_energia_agua_batch(
  _filial_ids uuid[],
  _batch_size int DEFAULT 10000
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Function to delete fretes in batches
CREATE OR REPLACE FUNCTION public.delete_fretes_batch(
  _filial_ids uuid[],
  _batch_size int DEFAULT 10000
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
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