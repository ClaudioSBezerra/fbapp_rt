-- Adicionar coluna para armazenar o período do arquivo
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS mes_ano date;

-- Criar índice para consultas rápidas de duplicidade
CREATE INDEX IF NOT EXISTS idx_import_jobs_filial_mes_ano_scope 
ON import_jobs(filial_id, mes_ano, import_scope) 
WHERE status = 'completed';