-- Aumentar o limite do bucket efd-files para 1GB (1073741824 bytes)
UPDATE storage.buckets 
SET file_size_limit = 1073741824 
WHERE id = 'efd-files';