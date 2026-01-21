-- Remover o limite de tamanho do arquivo do bucket efd-files (definir como NULL = ilimitado)
-- Isso garante que não haverá bloqueio por tamanho no nível do bucket
UPDATE storage.buckets 
SET file_size_limit = NULL 
WHERE id = 'efd-files';

-- Garantir que o bucket existe (caso a migração anterior tenha falhado silenciosamente)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('efd-files', 'efd-files', false, NULL, null)
ON CONFLICT (id) DO UPDATE SET 
  file_size_limit = NULL,
  public = false;
