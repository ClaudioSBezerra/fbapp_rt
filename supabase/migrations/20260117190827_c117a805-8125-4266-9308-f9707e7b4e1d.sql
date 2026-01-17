-- Create batch delete function for participantes
CREATE OR REPLACE FUNCTION public.delete_participantes_batch(
  _user_id uuid,
  _filial_ids uuid[],
  _batch_size integer DEFAULT 10000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count int;
  valid_filial_ids uuid[];
BEGIN
  -- Filter only filiais that the user has access to
  SELECT array_agg(id) INTO valid_filial_ids
  FROM unnest(_filial_ids) AS id
  WHERE has_filial_access(_user_id, id);
  
  IF valid_filial_ids IS NULL OR array_length(valid_filial_ids, 1) = 0 THEN
    RETURN 0;
  END IF;
  
  WITH deleted AS (
    DELETE FROM participantes
    WHERE id IN (
      SELECT p.id FROM participantes p
      WHERE p.filial_id = ANY(valid_filial_ids)
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;