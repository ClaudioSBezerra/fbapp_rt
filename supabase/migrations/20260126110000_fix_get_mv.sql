
-- Refresh the MV to ensure data consistency
REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_mercadorias_aggregated;

-- Update the function to be more robust and debuggable
CREATE OR REPLACE FUNCTION public.get_mv_mercadorias_aggregated(p_user_id uuid DEFAULT NULL)
 RETURNS TABLE(filial_id uuid, filial_nome text, filial_cod_est text, filial_cnpj text, mes_ano date, tipo character varying, valor numeric, pis numeric, cofins numeric, icms numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid;
BEGIN
  -- Use provided user_id or fallback to auth.uid()
  v_uid := COALESCE(p_user_id, auth.uid());
  
  RETURN QUERY
  SELECT 
    mv.filial_id,
    mv.filial_nome,
    f.cod_est as filial_cod_est,
    f.cnpj as filial_cnpj,
    mv.mes_ano,
    mv.tipo::varchar,
    mv.valor,
    mv.pis,
    mv.cofins,
    mv.icms
  FROM extensions.mv_mercadorias_aggregated mv
  -- Use LEFT JOIN to prevent data loss if filial is missing in public table (though unlikely with FKs)
  LEFT JOIN public.filiais f ON f.id = mv.filial_id
  WHERE has_filial_access(v_uid, mv.filial_id)
  ORDER BY mv.mes_ano DESC;
END;
$function$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_mv_mercadorias_aggregated(uuid) TO authenticated;
