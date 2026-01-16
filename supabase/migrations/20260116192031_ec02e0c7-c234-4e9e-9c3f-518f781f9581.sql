-- Criar função auxiliar para executar SQL com timeout maior
CREATE OR REPLACE FUNCTION public.exec_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '60s'
SET search_path = public, extensions
AS $$
BEGIN
  EXECUTE sql;
END;
$$;