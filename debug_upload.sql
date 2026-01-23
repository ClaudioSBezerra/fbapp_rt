-- Verificar uploads recentes no storage
-- (Isso ajuda a confirmar se o upload está funcionando)

-- 1. Verificar arquivos no storage (via SELECT se possível)
-- NOTA: Isso geralmente requer verificação via dashboard ou API

-- 2. Verificar tentativas de job com erro
select 
  id, 
  created_at, 
  status, 
  file_name, 
  error_message,
  empresa_id,
  filial_id,
  user_id
from import_jobs 
where created_at > now() - interval '24 hours'
order by created_at desc 
limit 10;

-- 3. Verificar se há logs de erro (se tabela de logs existir)
-- select * from edge_function_logs where created_at > now() - interval '1 hour' order by created_at desc;

-- 4. Verificar empresas disponíveis
select 
  id, 
  nome, 
  created_at
from empresas 
order by created_at desc 
limit 5;

-- 5. Verificar usuários ativos
select 
  id, 
  email, 
  created_at,
  last_sign_in_at
from auth.users 
where last_sign_in_at > now() - interval '24 hours'
order by last_sign_in_at desc;