-- Verificar jobs mais recentes do arquivo específico
select 
  id, 
  created_at, 
  status, 
  file_name, 
  filial_id, 
  error_message,
  started_at,
  completed_at,
  processed_records,
  total_records
from import_jobs 
where file_name like '%1769130058257_PISCOFINS%' 
order by created_at desc 
limit 5;

-- Verificar todos os jobs recentes (últimas 2 horas)
select 
  id, 
  created_at, 
  status, 
  file_name, 
  left(error_message, 100) as error_preview
from import_jobs 
where created_at > now() - interval '2 hours'
order by created_at desc 
limit 10;