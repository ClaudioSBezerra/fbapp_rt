-- Add import_scope column to import_jobs table
ALTER TABLE public.import_jobs 
ADD COLUMN import_scope text NOT NULL DEFAULT 'all';

-- Add comment for documentation
COMMENT ON COLUMN public.import_jobs.import_scope IS 'Scope of import: all, only_c, only_d';