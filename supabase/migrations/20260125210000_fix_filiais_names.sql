
-- Update filiais nome_fantasia with razao_social where it is null
UPDATE public.filiais
SET nome_fantasia = razao_social
WHERE nome_fantasia IS NULL;
