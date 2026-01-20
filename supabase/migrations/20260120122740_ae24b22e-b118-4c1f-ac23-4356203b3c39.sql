-- Create composite index for efficient queries on efd_raw_lines
-- This is critical for processing large EFD files (1M+ records)
CREATE INDEX IF NOT EXISTS idx_efd_raw_lines_job_block_id 
ON public.efd_raw_lines (job_id, block_type, id);

-- Also create an index for job_id alone for cleanup operations
CREATE INDEX IF NOT EXISTS idx_efd_raw_lines_job_id 
ON public.efd_raw_lines (job_id);