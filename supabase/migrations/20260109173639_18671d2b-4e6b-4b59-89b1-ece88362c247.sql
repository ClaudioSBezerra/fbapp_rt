-- Adicionar coluna cod_est na tabela filiais
ALTER TABLE public.filiais 
ADD COLUMN IF NOT EXISTS cod_est VARCHAR(60);

-- Criar índice para busca rápida
CREATE INDEX IF NOT EXISTS idx_filiais_cod_est ON public.filiais(cod_est);