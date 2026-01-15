-- =============================================
-- Tabela uso_consumo_imobilizado
-- =============================================
CREATE TABLE IF NOT EXISTS public.uso_consumo_imobilizado (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    filial_id uuid NOT NULL REFERENCES public.filiais(id) ON DELETE CASCADE,
    mes_ano date NOT NULL,
    tipo_operacao varchar(20) NOT NULL CHECK (tipo_operacao IN ('imobilizado', 'uso_consumo')),
    cfop varchar(10) NOT NULL,
    cod_part varchar(60),
    num_doc varchar(60),
    valor numeric NOT NULL DEFAULT 0,
    valor_icms numeric NOT NULL DEFAULT 0,
    valor_pis numeric NOT NULL DEFAULT 0,
    valor_cofins numeric NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_uso_consumo_item UNIQUE (filial_id, mes_ano, num_doc, cfop, cod_part)
);

-- =============================================
-- Índices para performance
-- =============================================
CREATE INDEX IF NOT EXISTS idx_uso_consumo_filial_mes ON public.uso_consumo_imobilizado(filial_id, mes_ano);
CREATE INDEX IF NOT EXISTS idx_uso_consumo_tenant ON public.uso_consumo_imobilizado(tenant_id);
CREATE INDEX IF NOT EXISTS idx_uso_consumo_tipo ON public.uso_consumo_imobilizado(tipo_operacao);

-- =============================================
-- RLS Policies
-- =============================================
ALTER TABLE public.uso_consumo_imobilizado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view uso_consumo of their filiais"
ON public.uso_consumo_imobilizado
FOR SELECT
USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can insert uso_consumo for their filiais"
ON public.uso_consumo_imobilizado
FOR INSERT
WITH CHECK (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can update uso_consumo of their filiais"
ON public.uso_consumo_imobilizado
FOR UPDATE
USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can delete uso_consumo of their filiais"
ON public.uso_consumo_imobilizado
FOR DELETE
USING (has_filial_access(auth.uid(), filial_id));

-- =============================================
-- Materialized View para agregação
-- =============================================
CREATE MATERIALIZED VIEW IF NOT EXISTS extensions.mv_uso_consumo_aggregated AS
SELECT 
    uci.filial_id,
    COALESCE(f.nome_fantasia, f.razao_social) as filial_nome,
    uci.mes_ano,
    uci.tipo_operacao,
    uci.cfop,
    SUM(uci.valor) as valor,
    SUM(uci.valor_icms) as icms,
    SUM(uci.valor_pis) as pis,
    SUM(uci.valor_cofins) as cofins,
    COUNT(*) as quantidade_itens
FROM public.uso_consumo_imobilizado uci
JOIN public.filiais f ON f.id = uci.filial_id
GROUP BY uci.filial_id, f.nome_fantasia, f.razao_social, uci.mes_ano, uci.tipo_operacao, uci.cfop;

-- Índice único para refresh concorrente
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_uso_consumo_pk 
ON extensions.mv_uso_consumo_aggregated(filial_id, mes_ano, tipo_operacao, cfop);

-- =============================================
-- Função RPC para acessar a view com RLS
-- =============================================
CREATE OR REPLACE FUNCTION public.get_mv_uso_consumo_aggregated()
RETURNS TABLE(
    filial_id uuid,
    filial_nome text,
    filial_cod_est text,
    filial_cnpj text,
    mes_ano date,
    tipo_operacao varchar,
    cfop varchar,
    valor numeric,
    icms numeric,
    pis numeric,
    cofins numeric,
    quantidade_itens bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mv.filial_id,
        mv.filial_nome,
        f.cod_est::text as filial_cod_est,
        f.cnpj::text as filial_cnpj,
        mv.mes_ano,
        mv.tipo_operacao::varchar,
        mv.cfop::varchar,
        mv.valor,
        mv.icms,
        mv.pis,
        mv.cofins,
        mv.quantidade_itens
    FROM extensions.mv_uso_consumo_aggregated mv
    JOIN public.filiais f ON f.id = mv.filial_id
    WHERE has_filial_access(auth.uid(), mv.filial_id)
    ORDER BY mv.mes_ano DESC, mv.tipo_operacao, mv.cfop;
END;
$$;

-- =============================================
-- Função para deletar em batch
-- =============================================
CREATE OR REPLACE FUNCTION public.delete_uso_consumo_batch(
    _user_id uuid,
    _filial_ids uuid[],
    _batch_size integer DEFAULT 10000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
        DELETE FROM uso_consumo_imobilizado
        WHERE id IN (
            SELECT uci.id FROM uso_consumo_imobilizado uci
            WHERE uci.filial_id = ANY(valid_filial_ids)
            LIMIT _batch_size
        )
        RETURNING 1
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;
    
    RETURN deleted_count;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_mv_uso_consumo_aggregated() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_uso_consumo_batch(uuid, uuid[], integer) TO authenticated;
GRANT SELECT ON extensions.mv_uso_consumo_aggregated TO authenticated;