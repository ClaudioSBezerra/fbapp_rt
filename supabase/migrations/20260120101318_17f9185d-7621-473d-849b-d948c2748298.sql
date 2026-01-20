-- Criar tabela efd_raw_lines para armazenamento temporário de linhas do EFD
CREATE TABLE IF NOT EXISTS public.efd_raw_lines (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL CHECK (block_type IN ('0', 'A', 'C', 'D')),
  line_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices para performance
CREATE INDEX idx_efd_raw_lines_job_block ON public.efd_raw_lines(job_id, block_type);
CREATE INDEX idx_efd_raw_lines_job_line ON public.efd_raw_lines(job_id, line_number);

-- RLS
ALTER TABLE public.efd_raw_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view raw lines for their jobs"
  ON public.efd_raw_lines FOR SELECT
  USING (job_id IN (SELECT id FROM public.import_jobs WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert raw lines for their jobs"
  ON public.efd_raw_lines FOR INSERT
  WITH CHECK (job_id IN (SELECT id FROM public.import_jobs WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete raw lines for their jobs"
  ON public.efd_raw_lines FOR DELETE
  USING (job_id IN (SELECT id FROM public.import_jobs WHERE user_id = auth.uid()));

-- Abortar os dois jobs travados
UPDATE public.import_jobs 
SET 
  status = 'failed',
  error_message = 'Job abortado manualmente - tabela efd_raw_lines não existia durante processamento',
  completed_at = now()
WHERE id IN (
  '9f76fe58-78ed-43cc-9479-72b28faebf41',
  '44ee0e01-1c54-4e5c-b8f1-f5b586d0801d'
) AND status = 'processing';