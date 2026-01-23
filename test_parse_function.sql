-- Verificar se a função parse-efd-v3 está acessível via URL
-- (Isso precisa ser testado via HTTP, mas podemos verificar os resultados)

-- Verificar jobs criados pela função v3
select 
  id,
  created_at,
  status,
  file_name,
  filial_id,
  error_message,
  -- Calcular duração
  case 
    when started_at is not null and completed_at is not null then
      extract(epoch from (completed_at - started_at))::integer
    when started_at is not null then
      extract(epoch from (now() - started_at))::integer
    else null
  end as duration_seconds
from import_jobs 
where created_at > now() - interval '1 hour'
order by created_at desc;

-- Verificar se houve criação de filiais recentes (indicativo de funcionamento)
select 
  id,
  created_at,
  cnpj,
  razao_social,
  empresa_id
from filiais 
where created_at > now() - interval '1 hour'
order by created_at desc;