-- Add columns for chunked parsing control
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS parsing_offset integer DEFAULT 0;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS parsing_total_lines integer DEFAULT 0;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS temp_block0_lines text[] DEFAULT '{}';
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS temp_blockA_lines text[] DEFAULT '{}';
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS temp_blockC_lines text[] DEFAULT '{}';
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS temp_blockD_lines text[] DEFAULT '{}';