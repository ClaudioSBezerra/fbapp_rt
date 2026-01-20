-- Move pg_trgm extension out of public schema (recommended by linter)
CREATE SCHEMA IF NOT EXISTS extensions;

ALTER EXTENSION pg_trgm SET SCHEMA extensions;