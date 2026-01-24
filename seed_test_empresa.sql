
-- Inserir empresa de teste para evitar erro de chave estrangeira
INSERT INTO public.empresas (id, cnpj, razao_social, created_at, updated_at)
VALUES (
  'c3f4b2a7-1e8d-4c5a-9f2e-6d8a9b7c3d5f',
  '00000000000000',
  'Empresa de Teste TRAE',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE
SET updated_at = NOW();

-- Garantir que existe um usuário correspondente na tabela auth.users é mais complicado via SQL direto se não tivermos acesso ao esquema auth
-- Mas como estamos usando o empresa_id como user_id no fallback da função v13, e a tabela import_jobs tem FK para auth.users (user_id)?
-- Vamos verificar a estrutura da tabela import_jobs primeiro.
