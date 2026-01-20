-- ================================================
-- LIMPEZA TOTAL DO TENANT_DEMO COM TRUNCATE
-- ================================================

-- 1. Limpar tabelas transacionais (dados operacionais)
TRUNCATE TABLE mercadorias CASCADE;
TRUNCATE TABLE servicos CASCADE;
TRUNCATE TABLE fretes CASCADE;
TRUNCATE TABLE energia_agua CASCADE;
TRUNCATE TABLE uso_consumo_imobilizado CASCADE;
TRUNCATE TABLE participantes CASCADE;
TRUNCATE TABLE simples_nacional CASCADE;

-- 2. Limpar tabelas temporárias de importação
TRUNCATE TABLE efd_raw_lines CASCADE;
TRUNCATE TABLE efd_raw_a100 CASCADE;
TRUNCATE TABLE efd_raw_c100 CASCADE;
TRUNCATE TABLE efd_raw_c500 CASCADE;
TRUNCATE TABLE efd_raw_fretes CASCADE;

-- 3. Limpar jobs de importação
TRUNCATE TABLE import_jobs CASCADE;

-- 4. Limpar logs e tokens temporários
TRUNCATE TABLE audit_logs CASCADE;
TRUNCATE TABLE password_reset_tokens CASCADE;

-- 5. Limpar estrutura organizacional
TRUNCATE TABLE filiais CASCADE;
TRUNCATE TABLE empresas CASCADE;
TRUNCATE TABLE grupos_empresas CASCADE;

-- 6. Limpar vínculos de usuários
TRUNCATE TABLE user_empresas CASCADE;
TRUNCATE TABLE user_tenants CASCADE;
TRUNCATE TABLE user_roles CASCADE;

-- 7. Limpar tenant e profiles
TRUNCATE TABLE tenants CASCADE;
TRUNCATE TABLE profiles CASCADE;