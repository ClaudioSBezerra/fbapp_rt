CREATE TABLE IF NOT EXISTS public.uso_consumo_imobilizado (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    filial_id UUID NOT NULL REFERENCES public.filiais(id) ON DELETE CASCADE,
    mes_ano DATE NOT NULL,
    tipo_operacao VARCHAR(20) NOT NULL CHECK (tipo_operacao IN ('uso_consumo', 'imobilizado')),
    cfop VARCHAR(4) NOT NULL,
    cod_part VARCHAR(60) NOT NULL DEFAULT '',
    num_doc VARCHAR(60) NOT NULL,
    valor NUMERIC(15,2) NOT NULL DEFAULT 0,
    valor_icms NUMERIC(15,2) NOT NULL DEFAULT 0,
    valor_pis NUMERIC(15,2) NOT NULL DEFAULT 0,
    valor_cofins NUMERIC(15,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uso_consumo_imobilizado_unique UNIQUE (filial_id, mes_ano, num_doc, cfop, cod_part)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_uci_filial_mes ON public.uso_consumo_imobilizado(filial_id, mes_ano);
CREATE INDEX IF NOT EXISTS idx_uci_tipo ON public.uso_consumo_imobilizado(tipo_operacao);
CREATE INDEX IF NOT EXISTS idx_uci_cfop ON public.uso_consumo_imobilizado(cfop);

-- RLS
ALTER TABLE public.uso_consumo_imobilizado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view uso_consumo_imobilizado of their filiais"
    ON public.uso_consumo_imobilizado FOR SELECT
    USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can insert uso_consumo_imobilizado for their filiais"
    ON public.uso_consumo_imobilizado FOR INSERT
    WITH CHECK (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can update uso_consumo_imobilizado of their filiais"
    ON public.uso_consumo_imobilizado FOR UPDATE
    USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can delete uso_consumo_imobilizado of their filiais"
    ON public.uso_consumo_imobilizado FOR DELETE
    USING (has_filial_access(auth.uid(), filial_id));
