-- Habilitar realtime para import_jobs (acompanhamento de progresso)
ALTER PUBLICATION supabase_realtime ADD TABLE public.import_jobs;