-- Limpeza total da base de dados para recomeçar do zero

-- 1. Dados operacionais (dependem de filiais)
TRUNCATE mercadorias, energia_agua, fretes, import_jobs CASCADE;

-- 2. Estrutura organizacional (ordem de dependência)
DELETE FROM filiais;
DELETE FROM empresas;
DELETE FROM grupos_empresas;

-- 3. Vínculos de usuário
DELETE FROM user_tenants;
DELETE FROM user_roles;

-- 4. Tenants
DELETE FROM tenants;

-- 5. Profiles
DELETE FROM profiles;

-- 6. Logs
DELETE FROM audit_logs;

-- 7. Alíquotas
DELETE FROM aliquotas;