-- ====================================================================
-- INSPEÇÃO RÁPIDA DE DIAGNÓSTICO DE ERRO 500
-- ====================================================================

-- 1. Verificar se o arquivo chegou no Storage
SELECT 
    '=== ARQUIVOS NO STORAGE (Últimos 5) ===' as section,
    name,
    id,
    bucket_id,
    owner,
    created_at,
    updated_at,
    last_accessed_at,
    metadata,
    CASE 
        WHEN metadata->>'size' IS NOT NULL THEN (metadata->>'size')::bigint / 1024 / 1024 || ' MB'
        ELSE 'N/A'
    END as size_mb
FROM storage.objects
WHERE bucket_id = 'efd-files'
ORDER BY created_at DESC
LIMIT 5;

-- 2. Verificar se algum job foi criado (mesmo que falho)
SELECT 
    '=== IMPORT JOBS (Últimos 5) ===' as section,
    id,
    file_name,
    status,
    progress,
    error_message,
    created_at,
    completed_at,
    counts
FROM public.import_jobs
ORDER BY created_at DESC
LIMIT 5;

-- 3. Verificar Logs de Jobs (se houver)
SELECT 
    '=== LOGS DE ERRO RECENTES ===' as section,
    job_id,
    level,
    message,
    created_at
FROM public.import_job_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;