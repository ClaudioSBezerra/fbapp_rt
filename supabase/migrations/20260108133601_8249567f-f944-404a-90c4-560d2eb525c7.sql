-- =============================================
-- TABELA: servicos (Bloco A - EFD Contribuições)
-- =============================================
CREATE TABLE public.servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id uuid NOT NULL,
  tipo character varying NOT NULL,
  mes_ano date NOT NULL,
  ncm character varying,
  descricao text,
  valor numeric NOT NULL DEFAULT 0,
  pis numeric NOT NULL DEFAULT 0,
  cofins numeric NOT NULL DEFAULT 0,
  iss numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT servicos_tipo_check CHECK (tipo IN ('entrada', 'saida'))
);

-- Índices de performance
CREATE INDEX idx_servicos_filial_id ON servicos(filial_id);
CREATE INDEX idx_servicos_mes_ano ON servicos(mes_ano);
CREATE INDEX idx_servicos_tipo ON servicos(tipo);
CREATE INDEX idx_servicos_filial_mes_tipo ON servicos(filial_id, mes_ano, tipo);

-- Trigger updated_at
CREATE TRIGGER update_servicos_updated_at
  BEFORE UPDATE ON servicos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- RLS POLICIES para servicos
-- =============================================
ALTER TABLE servicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view servicos of their filiais"
  ON servicos FOR SELECT
  USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can insert servicos for their filiais"
  ON servicos FOR INSERT
  WITH CHECK (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can update servicos of their filiais"
  ON servicos FOR UPDATE
  USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can delete servicos of their filiais"
  ON servicos FOR DELETE
  USING (has_filial_access(auth.uid(), filial_id));

-- =============================================
-- MATERIALIZED VIEW: mv_servicos_aggregated
-- =============================================
CREATE MATERIALIZED VIEW extensions.mv_servicos_aggregated AS
SELECT 
  s.filial_id,
  COALESCE(f.nome_fantasia, f.razao_social) as filial_nome,
  s.mes_ano,
  s.tipo,
  SUM(s.valor) as valor,
  SUM(s.pis) as pis,
  SUM(s.cofins) as cofins,
  SUM(s.iss) as iss
FROM public.servicos s
JOIN public.filiais f ON f.id = s.filial_id
GROUP BY s.filial_id, f.nome_fantasia, f.razao_social, s.mes_ano, s.tipo;

CREATE UNIQUE INDEX ON extensions.mv_servicos_aggregated (filial_id, mes_ano, tipo);

-- =============================================
-- FUNÇÃO: get_mv_servicos_aggregated
-- =============================================
CREATE OR REPLACE FUNCTION public.get_mv_servicos_aggregated()
RETURNS TABLE(
  filial_id uuid,
  filial_nome text,
  mes_ano date,
  tipo varchar,
  valor numeric,
  pis numeric,
  cofins numeric,
  iss numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mv.filial_id,
    mv.filial_nome,
    mv.mes_ano,
    mv.tipo::varchar,
    mv.valor,
    mv.pis,
    mv.cofins,
    mv.iss
  FROM extensions.mv_servicos_aggregated mv
  WHERE has_filial_access(auth.uid(), mv.filial_id)
  ORDER BY mv.mes_ano DESC;
END;
$$;

-- =============================================
-- FUNÇÃO: delete_servicos_batch
-- =============================================
CREATE OR REPLACE FUNCTION public.delete_servicos_batch(
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
  SELECT array_agg(id) INTO valid_filial_ids
  FROM unnest(_filial_ids) AS id
  WHERE has_filial_access(_user_id, id);
  
  IF valid_filial_ids IS NULL OR array_length(valid_filial_ids, 1) = 0 THEN
    RETURN 0;
  END IF;
  
  WITH deleted AS (
    DELETE FROM servicos
    WHERE id IN (
      SELECT sv.id FROM servicos sv
      WHERE sv.filial_id = ANY(valid_filial_ids)
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- =============================================
-- ATUALIZAR: refresh_materialized_views
-- =============================================
CREATE OR REPLACE FUNCTION public.refresh_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  mv_count integer;
BEGIN
  SELECT COUNT(*) INTO mv_count FROM extensions.mv_dashboard_stats;
  
  IF mv_count = 0 THEN
    REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_servicos_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
  ELSE
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_mercadorias_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_fretes_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_energia_agua_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_servicos_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_dashboard_stats;
  END IF;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_mv_servicos_aggregated() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_servicos_batch(uuid, uuid[], integer) TO authenticated;