-- Aumentar o limite do bucket efd-files para 5GB (5368709120 bytes)
-- Isso resolve o erro 413 (Maximum size exceeded) para arquivos grandes
UPDATE storage.buckets 
SET file_size_limit = 5368709120 
WHERE id = 'efd-files';
