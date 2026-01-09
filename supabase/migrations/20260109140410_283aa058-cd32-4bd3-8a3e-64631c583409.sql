-- Update get_mv_dashboard_stats to accept optional _filial_id parameter
CREATE OR REPLACE FUNCTION public.get_mv_dashboard_stats(_mes_ano date DEFAULT NULL::date, _filial_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(categoria text, subtipo text, mes_ano date, valor numeric, icms numeric, pis numeric, cofins numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    mv.categoria,
    mv.subtipo,
    mv.mes_ano,
    SUM(mv.valor) as valor,
    SUM(mv.icms) as icms,
    SUM(mv.pis) as pis,
    SUM(mv.cofins) as cofins
  FROM extensions.mv_dashboard_stats mv
  WHERE has_filial_access(auth.uid(), mv.filial_id)
    AND (_mes_ano IS NULL OR mv.mes_ano = _mes_ano)
    AND (_filial_id IS NULL OR mv.filial_id = _filial_id)
  GROUP BY mv.categoria, mv.subtipo, mv.mes_ano;
END;
$function$;