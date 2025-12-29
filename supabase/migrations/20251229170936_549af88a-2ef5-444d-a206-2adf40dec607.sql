-- Tabela energia_agua
CREATE TABLE public.energia_agua (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id UUID NOT NULL,
  tipo_operacao VARCHAR(10) NOT NULL CHECK (tipo_operacao IN ('credito', 'debito')),
  tipo_servico VARCHAR(10) NOT NULL CHECK (tipo_servico IN ('energia', 'agua')),
  mes_ano DATE NOT NULL,
  cnpj_fornecedor VARCHAR(14),
  valor NUMERIC(15,2) NOT NULL DEFAULT 0,
  pis NUMERIC(15,2) NOT NULL DEFAULT 0,
  cofins NUMERIC(15,2) NOT NULL DEFAULT 0,
  descricao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabela fretes
CREATE TABLE public.fretes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id UUID NOT NULL,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  mes_ano DATE NOT NULL,
  ncm VARCHAR(10),
  descricao TEXT,
  cnpj_transportadora VARCHAR(14),
  valor NUMERIC(15,2) NOT NULL DEFAULT 0,
  pis NUMERIC(15,2) NOT NULL DEFAULT 0,
  cofins NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.energia_agua ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fretes ENABLE ROW LEVEL SECURITY;

-- RLS policies for energia_agua using existing has_filial_access function
CREATE POLICY "Users can view energia_agua of their filiais"
  ON public.energia_agua FOR SELECT
  USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can insert energia_agua for their filiais"
  ON public.energia_agua FOR INSERT
  WITH CHECK (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can update energia_agua of their filiais"
  ON public.energia_agua FOR UPDATE
  USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can delete energia_agua of their filiais"
  ON public.energia_agua FOR DELETE
  USING (has_filial_access(auth.uid(), filial_id));

-- RLS policies for fretes using existing has_filial_access function
CREATE POLICY "Users can view fretes of their filiais"
  ON public.fretes FOR SELECT
  USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can insert fretes for their filiais"
  ON public.fretes FOR INSERT
  WITH CHECK (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can update fretes of their filiais"
  ON public.fretes FOR UPDATE
  USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can delete fretes of their filiais"
  ON public.fretes FOR DELETE
  USING (has_filial_access(auth.uid(), filial_id));

-- Triggers for updated_at
CREATE TRIGGER update_energia_agua_updated_at
  BEFORE UPDATE ON public.energia_agua
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fretes_updated_at
  BEFORE UPDATE ON public.fretes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();