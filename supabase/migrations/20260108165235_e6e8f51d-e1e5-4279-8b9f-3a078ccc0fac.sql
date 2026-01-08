-- Tabela de Participantes (registro 0150 do EFD)
CREATE TABLE IF NOT EXISTS public.participantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id UUID NOT NULL,
  cod_part VARCHAR(60) NOT NULL,
  nome VARCHAR(100) NOT NULL,
  cnpj VARCHAR(14),
  cpf VARCHAR(11),
  ie VARCHAR(14),
  cod_mun VARCHAR(7),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(filial_id, cod_part)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_participantes_filial ON public.participantes(filial_id);
CREATE INDEX IF NOT EXISTS idx_participantes_cod_part ON public.participantes(cod_part);
CREATE INDEX IF NOT EXISTS idx_participantes_cnpj ON public.participantes(cnpj);

-- RLS
ALTER TABLE public.participantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view participantes of their filiais"
  ON public.participantes FOR SELECT
  USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can insert participantes for their filiais"
  ON public.participantes FOR INSERT
  WITH CHECK (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can update participantes of their filiais"
  ON public.participantes FOR UPDATE
  USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can delete participantes of their filiais"
  ON public.participantes FOR DELETE
  USING (has_filial_access(auth.uid(), filial_id));

-- Trigger para updated_at
CREATE TRIGGER update_participantes_updated_at
  BEFORE UPDATE ON public.participantes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Adicionar coluna cod_part na tabela mercadorias
ALTER TABLE public.mercadorias ADD COLUMN IF NOT EXISTS cod_part VARCHAR(60);
CREATE INDEX IF NOT EXISTS idx_mercadorias_cod_part ON public.mercadorias(cod_part);

-- Materialized View para agregação por participante
CREATE MATERIALIZED VIEW IF NOT EXISTS extensions.mv_mercadorias_participante AS
SELECT 
    m.filial_id,
    m.cod_part,
    COALESCE(p.nome, 'Participante ' || m.cod_part) as participante_nome,
    p.cnpj as participante_cnpj,
    m.mes_ano,
    m.tipo,
    SUM(m.valor) as valor,
    SUM(m.pis) as pis,
    SUM(m.cofins) as cofins,
    SUM(COALESCE(m.icms, 0)) as icms
FROM public.mercadorias m
LEFT JOIN public.participantes p ON p.filial_id = m.filial_id AND p.cod_part = m.cod_part
WHERE m.cod_part IS NOT NULL
GROUP BY m.filial_id, m.cod_part, p.nome, p.cnpj, m.mes_ano, m.tipo;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_mercadorias_part_pk 
ON extensions.mv_mercadorias_participante(filial_id, cod_part, mes_ano, tipo);

-- Função de acesso com RLS
CREATE OR REPLACE FUNCTION public.get_mv_mercadorias_participante()
RETURNS TABLE(
    filial_id UUID,
    cod_part VARCHAR,
    participante_nome TEXT,
    participante_cnpj VARCHAR,
    mes_ano DATE,
    tipo VARCHAR,
    valor NUMERIC,
    pis NUMERIC,
    cofins NUMERIC,
    icms NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mv.filial_id,
        mv.cod_part,
        mv.participante_nome,
        mv.participante_cnpj,
        mv.mes_ano,
        mv.tipo::varchar,
        mv.valor,
        mv.pis,
        mv.cofins,
        mv.icms
    FROM extensions.mv_mercadorias_participante mv
    WHERE has_filial_access(auth.uid(), mv.filial_id)
    ORDER BY mv.valor DESC;
END;
$$;

-- Atualizar função de refresh para incluir nova view
CREATE OR REPLACE FUNCTION public.refresh_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  mv_count integer;
BEGIN
  SELECT COUNT(*) INTO mv_count FROM extensions.mv_dashboard_stats;
  
  IF mv_count = 0 THEN
    REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_servicos_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;
    REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
  ELSE
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_mercadorias_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_fretes_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_energia_agua_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_servicos_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_mercadorias_participante;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_dashboard_stats;
  END IF;
END;
$function$;

-- Atualizar função async também
CREATE OR REPLACE FUNCTION public.refresh_materialized_views_async()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '300s'
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  mv_count integer;
BEGIN
  SELECT COUNT(*) INTO mv_count FROM extensions.mv_dashboard_stats;
  
  IF mv_count = 0 THEN
    REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_fretes_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_energia_agua_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_servicos_aggregated;
    REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;
    REFRESH MATERIALIZED VIEW extensions.mv_dashboard_stats;
  ELSE
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_mercadorias_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_fretes_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_energia_agua_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_servicos_aggregated;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_mercadorias_participante;
    REFRESH MATERIALIZED VIEW CONCURRENTLY extensions.mv_dashboard_stats;
  END IF;
END;
$function$;