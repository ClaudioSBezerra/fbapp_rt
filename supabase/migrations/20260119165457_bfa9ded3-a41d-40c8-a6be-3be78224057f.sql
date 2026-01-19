-- Aumentar timeout da função exec_sql para 5 minutos
CREATE OR REPLACE FUNCTION public.exec_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '300s'
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  EXECUTE sql;
END;
$function$;