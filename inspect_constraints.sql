-- ====================================================================
-- INSPEÇÃO DE CONSTRAINTS (CHAVES ÚNICAS)
-- ====================================================================

SELECT 
    conname as constraint_name, 
    pg_get_constraintdef(c.oid) as definition,
    n.nspname as schema,
    relname as table_name
FROM pg_constraint c 
JOIN pg_namespace n ON n.oid = c.connamespace
JOIN pg_class cl ON cl.oid = c.conrelid
WHERE n.nspname = 'public' 
AND relname IN ('filiais', 'import_jobs', 'empresas')
ORDER BY relname, conname;