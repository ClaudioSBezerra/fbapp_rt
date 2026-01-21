-- Função para limpar logs antigos (retenção de 30 dias)
CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Remover logs detalhados com mais de 30 dias
  DELETE FROM public.import_job_logs
  WHERE created_at < now() - INTERVAL '30 days';
  
  -- Remover jobs cancelados ou falhos com mais de 30 dias (opcional, para manter rastreabilidade apenas dos sucessos)
  -- DELETE FROM public.import_jobs
  -- WHERE status IN ('cancelled', 'failed') AND created_at < now() - INTERVAL '30 days';
END;
$$;

-- Criar uma extensão pg_cron se disponível para agendar (geralmente requer privilégios de superuser ou dashboard)
-- Como alternativa, podemos chamar esta função periodicamente via Edge Function ou Client
