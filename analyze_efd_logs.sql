-- ====================================================================
-- ANÁLISE DETALHADA DO ÚLTIMO REGISTRO DE IMPORTAÇÃO EFD CONTRIBUIÇÕES
-- ====================================================================

-- 1. IDENTIFICAÇÃO DO ÚLTIMO JOB EFD CONTRIBUIÇÕES
WITH latest_job AS (
    SELECT 
        j.id,
        j.file_name,
        j.status,
        j.progress,
        j.total_lines,
        j.file_size,
        j.created_at,
        j.started_at,
        j.completed_at,
        j.error_message,
        j.record_limit,
        j.import_scope,
        j.chunk_number,
        j.bytes_processed,
        j.counts,
        -- Performance metrics
        CASE 
            WHEN j.started_at IS NOT NULL AND j.completed_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (j.completed_at - j.started_at))
            ELSE NULL
        END as duration_seconds,
        CASE 
            WHEN j.started_at IS NOT NULL AND j.completed_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (j.completed_at - j.started_at)) / 60
            ELSE NULL
        END as duration_minutes,
        -- Contadores extraídos do JSON
        (j.counts->>'mercadorias')::int as mercadorias_count,
        (j.counts->>'servicos')::int as servicos_count,
        (j.counts->>'fretes')::int as fretes_count,
        (j.counts->>'energia_agua')::int as energia_agua_count,
        (j.counts->>'participantes')::int as participantes_count,
        (j.counts->>'estabelecimentos')::int as estabelecimentos_count,
        -- Contadores de registros vistos
        (j.counts->>'seen'->>'a100')::int as a100_seen,
        (j.counts->>'seen'->>'c100')::int as c100_seen,
        (j.counts->>'seen'->>'c500')::int as c500_seen,
        (j.counts->>'seen'->>'c600')::int as c600_seen,
        (j.counts->>'seen'->>'d100')::int as d100_seen,
        (j.counts->>'seen'->>'d101')::int as d101_seen,
        (j.counts->>'seen'->>'d105')::int as d105_seen,
        (j.counts->>'seen'->>'d500')::int as d500_seen,
        (j.counts->>'seen'->>'d501')::int as d501_seen,
        (j.counts->>'seen'->>'d505')::int as d505_seen,
        -- User info
        u.email as user_email,
        e.nome as empresa_nome
    FROM public.import_jobs j
    LEFT JOIN auth.users u ON j.user_id = u.id
    LEFT JOIN public.empresas e ON j.empresa_id = e.id
    WHERE j.file_name ILIKE '%contribuicoes%' 
       OR j.file_name ILIKE '%pis_cofins%'
       OR j.file_name ILIKE '%efd%'
       OR (j.counts->>'servicos')::int > 0
       OR (j.counts->>'seen'->>'a100')::int > 0
    ORDER BY j.created_at DESC
    LIMIT 1
)
SELECT 
    '=== INFORMAÇÕES GERAIS DO JOB ===' as section,
    id as job_id,
    file_name,
    status,
    CASE 
        WHEN status = 'failed' THEN '❌ FALHA NO PROCESSAMENTO'
        WHEN status = 'cancelled' THEN '⏹️ PROCESSAMENTO CANCELADO'
        WHEN status = 'processing' THEN '🔄 EM ANDAMENTO'
        WHEN status = 'refreshing_views' THEN '🔄 ATUALIZANDO VIEWS'
        WHEN status = 'completed' THEN '✅ CONCLUÍDO COM SUCESSO'
        ELSE status
    END as status_desc,
    progress,
    total_lines,
    ROUND(file_size / 1024.0 / 1024.0, 2) as file_size_mb,
    created_at,
    started_at,
    completed_at,
    duration_minutes,
    user_email,
    empresa_nome,
    record_limit,
    import_scope,
    chunk_number,
    ROUND(bytes_processed / 1024.0 / 1024.0, 2) as bytes_processed_mb,
    error_message
FROM latest_job

UNION ALL

SELECT 
    '=== CONTADORES DE REGISTROS ===' as section,
    '' as job_id,
    '' as file_name,
    '' as status,
    '' as status_desc,
    NULL as progress,
    mercadorias_count::text as total_lines,
    ROUND(file_size / 1024.0 / 1024.0, 2) as file_size_mb,
    NULL as created_at,
    NULL as started_at,
    NULL as completed_at,
    NULL as duration_minutes,
    '' as user_email,
    '' as empresa_nome,
    NULL as record_limit,
    '' as import_scope,
    NULL as chunk_number,
    NULL as bytes_processed_mb,
    CONCAT('Mercadorias: ', mercadorias_count, ', Serviços: ', servicos_count, ', Fretes: ', fretes_count, ', Energia/Água: ', energia_agua_count, ', Participantes: ', participantes_count, ', Estabelecimentos: ', estabelecimentos_count) as error_message
FROM latest_job

UNION ALL

SELECT 
    '=== REGISTROS EFD VISTOS NO ARQUIVO ===' as section,
    '' as job_id,
    '' as file_name,
    '' as status,
    '' as status_desc,
    NULL as progress,
    a100_seen::text as total_lines,
    ROUND(file_size / 1024.0 / 1024.0, 2) as file_size_mb,
    NULL as created_at,
    NULL as started_at,
    NULL as completed_at,
    NULL as duration_minutes,
    '' as user_email,
    '' as empresa_nome,
    NULL as record_limit,
    '' as import_scope,
    NULL as chunk_number,
    NULL as bytes_processed_mb,
    CONCAT('A100: ', a100_seen, ', C100: ', c100_seen, ', C500: ', c500_seen, ', C600: ', c600_seen, ', D100: ', d100_seen, ', D101: ', d101_seen, ', D105: ', d105_seen, ', D500: ', d500_seen, ', D501: ', d501_seen, ', D505: ', d505_seen) as error_message
FROM latest_job;

-- 2. ANÁLISE DE LOGS POR SEVERIDADE
WITH job_logs_analysis AS (
    SELECT 
        l.level,
        COUNT(*) as count,
        MIN(l.created_at) as first_occurrence,
        MAX(l.created_at) as last_occurrence,
        STRING_AGG(DISTINCT LEFT(l.message, 100), ' | ') as sample_messages
    FROM public.import_job_logs l
    WHERE l.job_id = (SELECT id FROM latest_job)
    GROUP BY l.level
),
error_details AS (
    SELECT 
        l.message,
        l.line_number,
        l.raw_content,
        l.created_at,
        CASE 
            WHEN l.message ILIKE '%mes_ano%' THEN 'Problema de Data'
            WHEN l.message ILIKE '%cnpj%' THEN 'Problema de CNPJ'
            WHEN l.message ILIKE '%filial%' THEN 'Problema de Filial'
            WHEN l.message ILIKE '%database%' OR l.message ILIKE '%constraint%' THEN 'Problema de Banco'
            WHEN l.message ILIKE '%stream%' OR l.message ILIKE '%connection%' THEN 'Problema de Streaming'
            WHEN l.message ILIKE '%timeout%' OR l.message ILIKE '%limit%' THEN 'Problema de Performance'
            ELSE 'Outro Erro'
        END as error_type
    FROM public.import_job_logs l
    WHERE l.job_id = (SELECT id FROM latest_job) AND l.level = 'error'
    ORDER BY l.created_at DESC
    LIMIT 20
),
warning_details AS (
    SELECT 
        l.message,
        l.line_number,
        l.created_at,
        CASE 
            WHEN l.message ILIKE '%skip%' OR l.message ILIKE '%ignoring%' THEN 'Registro Ignorado'
            WHEN l.message ILIKE '%empty%' OR l.message ILIKE '%null%' THEN 'Campo Vazio/Nulo'
            WHEN l.message ILIKE '%limit%' OR l.message ILIKE '%max%' THEN 'Limite Atingido'
            WHEN l.message ILIKE '%duplicate%' OR l.message ILIKE '%exists%' THEN 'Possível Duplicata'
            ELSE 'Outro Aviso'
        END as warning_type
    FROM public.import_job_logs l
    WHERE l.job_id = (SELECT id FROM latest_job) AND l.level = 'warning'
    ORDER BY l.created_at DESC
    LIMIT 20
)
SELECT 
    '=== ANÁLISE DE LOGS POR SEVERIDADE ===' as section,
    level,
    count::text as file_name,
    CASE 
        WHEN level = 'error' THEN '🔴 ERROS CRÍTICOS'
        WHEN level = 'warning' THEN '🟡 AVISOS IMPORTANTES'
        ELSE '🟢 INFORMAÇÕES'
    END as status,
    '' as status_desc,
    count as progress,
    NULL as total_lines,
    NULL as file_size_mb,
    first_occurrence as created_at,
    last_occurrence as started_at,
    NULL as completed_at,
    NULL as duration_minutes,
    '' as user_email,
    '' as empresa_nome,
    NULL as record_limit,
    sample_messages as import_scope,
    NULL as chunk_number,
    NULL as bytes_processed_mb,
    error_message
FROM job_logs_analysis

UNION ALL

SELECT 
    '=== DETALHES DOS ERROS ===' as section,
    error_type as level,
    message as file_name,
    CASE WHEN line_number IS NOT NULL THEN 'L' || line_number ELSE 'N/A' END as status,
    '' as status_desc,
    NULL as progress,
    NULL as total_lines,
    NULL as file_size_mb,
    created_at,
    NULL as started_at,
    NULL as completed_at,
    NULL as duration_minutes,
    '' as user_email,
    '' as empresa_nome,
    NULL as record_limit,
    LEFT(raw_content, 200) as import_scope,
    NULL as chunk_number,
    NULL as bytes_processed_mb,
    NULL as error_message
FROM error_details

UNION ALL

SELECT 
    '=== DETALHES DOS AVISOS ===' as section,
    warning_type as level,
    message as file_name,
    CASE WHEN line_number IS NOT NULL THEN 'L' || line_number ELSE 'N/A' END as status,
    '' as status_desc,
    NULL as progress,
    NULL as total_lines,
    NULL as file_size_mb,
    created_at,
    NULL as started_at,
    NULL as completed_at,
    NULL as duration_minutes,
    '' as user_email,
    '' as empresa_nome,
    NULL as record_limit,
    '' as import_scope,
    NULL as chunk_number,
    NULL as bytes_processed_mb,
    NULL as error_message
FROM warning_details;

-- 3. DIAGNÓSTICO DE CONFORMIDADE EFD CONTRIBUIÇÕES
WITH conformity_check AS (
    SELECT 
        id,
        file_name,
        servicos_count,
        mercadorias_count,
        fretes_count,
        energia_agua_count,
        a100_seen,
        c100_seen,
        c500_seen,
        d100_seen,
        d500_seen,
        d101_seen,
        d105_seen,
        d501_seen,
        d505_seen,
        -- Verificação de conformidade
        CASE 
            WHEN servicos_count > 0 AND a100_seen = 0 THEN '⚠️ Inconsistência: Serviços processados sem A100'
            WHEN servicos_count = 0 AND a100_seen > 0 THEN '⚠️ Inconsistência: A100 encontrado sem serviços'
            WHEN servicos_count > 0 AND a100_seen > 0 THEN '✅ Bloco A consistente'
            ELSE 'ℹ️ Bloco A não aplicável'
        END as bloco_a_status,
        CASE 
            WHEN (mercadorias_count + energia_agua_count) > 0 AND (c100_seen + c500_seen) = 0 THEN '⚠️ Inconsistência: Operações sem C100/C500'
            WHEN (mercadorias_count + energia_agua_count) = 0 AND (c100_seen + c500_seen) > 0 THEN '⚠️ Inconsistência: C100/C500 sem operações'
            WHEN (mercadorias_count + energia_agua_count) > 0 AND (c100_seen + c500_seen) > 0 THEN '✅ Bloco C consistente'
            ELSE 'ℹ️ Bloco C não aplicável'
        END as bloco_c_status,
        CASE 
            WHEN fretes_count > 0 AND (d100_seen + d500_seen) = 0 THEN '⚠️ Inconsistência: Fretes sem D100/D500'
            WHEN fretes_count = 0 AND (d100_seen + d500_seen) > 0 THEN '⚠️ Inconsistência: D100/D500 sem fretes'
            WHEN fretes_count > 0 AND (d100_seen + d500_seen) > 0 THEN '✅ Bloco D consistente'
            ELSE 'ℹ️ Bloco D não aplicável'
        END as bloco_d_status,
        -- Verificação de complementos
        CASE 
            WHEN d100_seen > 0 AND (d101_seen = 0 OR d105_seen = 0) THEN '⚠️ D100 sem complementos PIS/COFINS'
            WHEN d100_seen > 0 AND d101_seen > 0 AND d105_seen > 0 THEN '✅ D100 com complementos completos'
            ELSE 'ℹ️ Sem D100'
        END as d100_complementos_status,
        CASE 
            WHEN d500_seen > 0 AND (d501_seen = 0 OR d505_seen = 0) THEN '⚠️ D500 sem complementos PIS/COFINS'
            WHEN d500_seen > 0 AND d501_seen > 0 AND d505_seen > 0 THEN '✅ D500 com complementos completos'
            ELSE 'ℹ️ Sem D500'
        END as d500_complementos_status
    FROM latest_job
)
SELECT 
    '=== CONFORMIDADE EFD CONTRIBUIÇÕES ===' as section,
    id as job_id,
    file_name,
    'CONFORMIDADE' as status,
    '' as status_desc,
    NULL as progress,
    (servicos_count + mercadorias_count + fretes_count + energia_agua_count)::text as total_lines,
    NULL as file_size_mb,
    NULL as created_at,
    NULL as started_at,
    NULL as completed_at,
    NULL as duration_minutes,
    '' as user_email,
    '' as empresa_nome,
    NULL as record_limit,
    bloco_a_status as import_scope,
    NULL as chunk_number,
    NULL as bytes_processed_mb,
    CONCAT('Bloco C: ', bloco_c_status, ' | Bloco D: ', bloco_d_status) as error_message
FROM conformity_check

UNION ALL

SELECT 
    '=== ANÁLISE DE COMPLEMENTOS ===' as section,
    id as job_id,
    file_name,
    'COMPLEMENTOS' as status,
    '' as status_desc,
    NULL as progress,
    NULL as total_lines,
    NULL as file_size_mb,
    NULL as created_at,
    NULL as started_at,
    NULL as completed_at,
    NULL as duration_minutes,
    '' as user_email,
    '' as empresa_nome,
    NULL as record_limit,
    d100_complementos_status as import_scope,
    NULL as chunk_number,
    NULL as bytes_processed_mb,
    d500_complementos_status as error_message
FROM conformity_check;

-- 4. ANÁLISE DE PERFORMANCE E PROBLEMAS
WITH performance_analysis AS (
    SELECT 
        id,
        file_name,
        total_lines,
        file_size,
        duration_seconds,
        bytes_processed,
        chunk_number,
        CASE 
            WHEN total_lines > 0 AND duration_seconds > 0 
            THEN ROUND(total_lines / duration_seconds, 2)
            ELSE 0
        END as lines_per_second,
        CASE 
            WHEN file_size > 0 AND duration_seconds > 0 
            THEN ROUND((file_size / 1024.0 / 1024.0) / (duration_seconds / 60.0), 2)
            ELSE 0
        END as mb_per_minute,
        CASE 
            WHEN total_lines > 0 
            THEN ROUND(file_size / total_lines, 2)
            ELSE 0
        END as bytes_per_line,
        -- Análise de chunks
        CASE 
            WHEN chunk_number > 1 THEN 'Processamento em múltiplos chunks'
            ELSE 'Processamento em chunk único'
        END as chunk_analysis,
        -- Verificação de problemas
        CASE 
            WHEN duration_seconds > 300 THEN '⚠️ Processamento lento (>5min)'
            WHEN duration_seconds > 120 THEN '⚠️ Processamento moderado (>2min)'
            ELSE '✅ Processamento rápido'
        END as performance_status,
        CASE 
            WHEN lines_per_second < 100 THEN '⚠️ Baixa performance (<100 linhas/seg)'
            WHEN lines_per_second < 500 THEN '⚠️ Performance moderada (<500 linhas/seg)'
            ELSE '✅ Boa performance'
        END as throughput_status
    FROM latest_job
),
streaming_issues AS (
    SELECT 
        COUNT(*) as stream_errors,
        STRING_AGG(DISTINCT LEFT(message, 100), ' | ') as stream_error_samples
    FROM public.import_job_logs l
    WHERE l.job_id = (SELECT id FROM latest_job)
      AND l.level = 'error'
      AND (l.message ILIKE '%stream%' 
           OR l.message ILIKE '%connection%'
           OR l.message ILIKE '%network%'
           OR l.message ILIKE '%timeout%')
)
SELECT 
    '=== ANÁLISE DE PERFORMANCE ===' as section,
    id as job_id,
    file_name,
    'PERFORMANCE' as status,
    performance_status as status_desc,
    lines_per_second as progress,
    total_lines,
    ROUND(file_size / 1024.0 / 1024.0, 2) as file_size_mb,
    NULL as created_at,
    NULL as started_at,
    NULL as completed_at,
    duration_minutes as duration_minutes,
    '' as user_email,
    '' as empresa_nome,
    NULL as record_limit,
    throughput_status as import_scope,
    chunk_number,
    bytes_per_line as bytes_processed_mb,
    CONCAT(mb_per_minute, ' MB/min, ', chunk_analysis) as error_message
FROM performance_analysis

UNION ALL

SELECT 
    '=== PROBLEMAS DE STREAMING ===' as section,
    id as job_id,
    file_name,
    'STREAMING' as status,
    CASE WHEN stream_errors > 0 THEN '🔴 PROBLEMAS DETECTADOS' ELSE '✅ SEM PROBLEMAS' END as status_desc,
    stream_errors as progress,
    stream_errors::text as total_lines,
    NULL as file_size_mb,
    NULL as created_at,
    NULL as started_at,
    NULL as completed_at,
    NULL as duration_minutes,
    '' as user_email,
    '' as empresa_nome,
    NULL as record_limit,
    'Erros de streaming' as import_scope,
    NULL as chunk_number,
    NULL as bytes_processed_mb,
    stream_error_samples as error_message
FROM latest_job, streaming_issues;