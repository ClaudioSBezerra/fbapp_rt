-- Add record_limit column to import_jobs for controlling records per block
ALTER TABLE public.import_jobs 
ADD COLUMN IF NOT EXISTS record_limit integer DEFAULT 0;