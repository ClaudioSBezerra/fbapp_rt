-- 1. Limpar dados temporários de parsing (instantâneo)
TRUNCATE TABLE efd_raw_lines;

-- 2. Limpar histórico de jobs
TRUNCATE TABLE import_jobs CASCADE;

-- 3. Limpar dados operacionais importados
DELETE FROM mercadorias WHERE id IS NOT NULL;
DELETE FROM fretes WHERE id IS NOT NULL;
DELETE FROM energia_agua WHERE id IS NOT NULL;
DELETE FROM servicos WHERE id IS NOT NULL;
DELETE FROM participantes WHERE id IS NOT NULL;

-- 4. Limpar tabelas RAW auxiliares
TRUNCATE TABLE efd_raw_c100;
TRUNCATE TABLE efd_raw_c500;
TRUNCATE TABLE efd_raw_a100;
TRUNCATE TABLE efd_raw_fretes;

-- 5. Atualizar views materializadas
SELECT refresh_materialized_views();