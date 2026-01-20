-- Add current_phase column to track processing phase
ALTER TABLE import_jobs 
ADD COLUMN current_phase TEXT DEFAULT 'pending';

-- Add comment explaining the phases
COMMENT ON COLUMN import_jobs.current_phase IS 'Processing phase: pending, parsing, block_0, block_d, block_c, consolidating, refreshing_views, completed, failed';