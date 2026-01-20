-- Migration para melhorias de monitoramento e integridade de dados

-- 1. Tabela de Logs detalhados de importação
CREATE TABLE IF NOT EXISTS public.import_job_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
    level text CHECK (level IN ('info', 'warning', 'error')),
    message text NOT NULL,
    line_number integer,
    raw_content text,
    created_at timestamp with time zone DEFAULT now()
);

-- Índices para logs
CREATE INDEX IF NOT EXISTS idx_import_job_logs_job_id ON public.import_job_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_import_job_logs_level ON public.import_job_logs(level);

-- Habilitar RLS
ALTER TABLE public.import_job_logs ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Users can view logs of their jobs" ON public.import_job_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.import_jobs j
            WHERE j.id = import_job_logs.job_id
            AND j.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert logs for their jobs" ON public.import_job_logs
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.import_jobs j
            WHERE j.id = import_job_logs.job_id
            AND j.user_id = auth.uid()
        )
    );

-- 2. Adicionar Constraint Única para Serviços (permite UPSERT seguro)
-- Primeiro removemos duplicatas exatas se existirem (opcional, mas seguro)
DELETE FROM public.servicos a USING public.servicos b
WHERE a.id > b.id
  AND a.filial_id = b.filial_id
  AND a.mes_ano = b.mes_ano
  AND a.tipo = b.tipo
  AND COALESCE(a.descricao, '') = COALESCE(b.descricao, '')
  AND a.valor = b.valor
  AND a.pis = b.pis
  AND a.cofins = b.cofins
  AND a.iss = b.iss;

-- Criar o índice único
CREATE UNIQUE INDEX IF NOT EXISTS idx_servicos_unique_content 
ON public.servicos (filial_id, mes_ano, tipo, COALESCE(descricao, ''), valor, pis, cofins, iss);

-- 3. View de Monitoramento de Jobs
CREATE OR REPLACE VIEW public.vw_import_job_stats AS
SELECT 
    j.id,
    j.file_name,
    j.status,
    j.progress,
    j.total_lines,
    j.created_at,
    j.updated_at,
    EXTRACT(EPOCH FROM (j.updated_at - j.started_at)) as duration_seconds,
    (j.counts->>'mercadorias')::int + (j.counts->>'servicos')::int + (j.counts->>'fretes')::int + (j.counts->>'energia_agua')::int as total_records,
    (SELECT COUNT(*) FROM public.import_job_logs l WHERE l.job_id = j.id AND l.level = 'warning') as warning_count,
    (SELECT COUNT(*) FROM public.import_job_logs l WHERE l.job_id = j.id AND l.level = 'error') as error_count
FROM public.import_jobs j;
