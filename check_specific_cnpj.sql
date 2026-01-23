-- 1. Verificar se o CNPJ do arquivo já existe
SELECT id, cnpj, razao_social, empresa_id 
FROM filiais 
WHERE cnpj = '11623188000140';

-- 2. Verificar se RLS (Row Level Security) está ativo na tabela filiais
SELECT relname as tabela, relrowsecurity as rls_ativo 
FROM pg_class 
WHERE relname = 'filiais';

-- 3. Listar as políticas de segurança (Policies) da tabela filiais
SELECT * FROM pg_policies WHERE tablename = 'filiais';