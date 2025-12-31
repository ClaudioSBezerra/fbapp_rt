-- Add columns for chunk processing resumption
ALTER TABLE public.import_jobs 
ADD COLUMN IF NOT EXISTS bytes_processed bigint DEFAULT 0,
ADD COLUMN IF NOT EXISTS chunk_number integer DEFAULT 0;