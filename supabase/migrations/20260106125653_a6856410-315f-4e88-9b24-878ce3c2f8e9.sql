-- Create function to get aggregated mercadorias data
CREATE OR REPLACE FUNCTION get_mercadorias_aggregated()
RETURNS TABLE (
  filial_id uuid,
  filial_nome text,
  mes_ano date,
  tipo varchar,
  valor numeric,
  pis numeric,
  cofins numeric,
  icms numeric
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.filial_id,
    COALESCE(f.nome_fantasia, f.razao_social) as filial_nome,
    m.mes_ano,
    m.tipo,
    SUM(m.valor) as valor,
    SUM(m.pis) as pis,
    SUM(m.cofins) as cofins,
    SUM(COALESCE(m.icms, 0)) as icms
  FROM mercadorias m
  JOIN filiais f ON f.id = m.filial_id
  WHERE has_filial_access(auth.uid(), m.filial_id)
  GROUP BY m.filial_id, f.nome_fantasia, f.razao_social, m.mes_ano, m.tipo
  ORDER BY m.mes_ano DESC;
END;
$$;