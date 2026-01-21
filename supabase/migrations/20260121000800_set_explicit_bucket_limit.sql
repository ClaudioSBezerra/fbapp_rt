-- Definir limite explícito de 50GB para o bucket efd-files
-- NULL às vezes pode cair no default do projeto (que pode ser 50MB no tier free)
UPDATE storage.buckets 
SET file_size_limit = 53687091200 
WHERE id = 'efd-files';

-- Garantir existência
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('efd-files', 'efd-files', false, 53687091200, null)
ON CONFLICT (id) DO UPDATE SET 
  file_size_limit = 53687091200,
  public = false;
