-- Criar função RPC para contagem de Simples Nacional vinculados
-- Usada pela edge function refresh-views para validação pós-refresh

CREATE OR REPLACE FUNCTION public.get_simples_counts()
RETURNS TABLE (
  uso_consumo_count integer,
  mercadorias_count integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*)::int FROM extensions.mv_uso_consumo_detailed WHERE is_simples = true),
    (SELECT COUNT(*)::int FROM extensions.mv_mercadorias_participante WHERE is_simples = true);
END;
$$;

-- Permitir chamada pela edge function (service role) e usuários autenticados
GRANT EXECUTE ON FUNCTION public.get_simples_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_simples_counts() TO service_role;