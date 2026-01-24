-- Script to clean data for a specific Empresa
-- Replace 'YOUR_EMPRESA_ID' with the actual ID (e.g., from the URL or App)

-- Option 1: If you have the clean_empresa_data function (and are logged in as a valid user)
-- SELECT clean_empresa_data('YOUR_EMPRESA_ID');

-- Option 2: Direct deletion (Run this in Supabase SQL Editor as Admin)
-- Be careful! This deletes ALL data for the empresa.

BEGIN;

-- 1. Get filiais IDs (optional, for verification)
-- SELECT id FROM filiais WHERE empresa_id = 'YOUR_EMPRESA_ID';

-- 2. Delete filiais (Cascades to mercadorias, servicos, etc. IF ON DELETE CASCADE is set)
-- If cascade is NOT set, use the explicit deletes below:

DELETE FROM public.mercadorias 
WHERE filial_id IN (SELECT id FROM public.filiais WHERE empresa_id = 'YOUR_EMPRESA_ID');

DELETE FROM public.servicos 
WHERE filial_id IN (SELECT id FROM public.filiais WHERE empresa_id = 'YOUR_EMPRESA_ID');

DELETE FROM public.fretes 
WHERE filial_id IN (SELECT id FROM public.filiais WHERE empresa_id = 'YOUR_EMPRESA_ID');

DELETE FROM public.energia_agua 
WHERE filial_id IN (SELECT id FROM public.filiais WHERE empresa_id = 'YOUR_EMPRESA_ID');

DELETE FROM public.uso_consumo_imobilizado 
WHERE filial_id IN (SELECT id FROM public.filiais WHERE empresa_id = 'YOUR_EMPRESA_ID');

DELETE FROM public.import_jobs 
WHERE filial_id IN (SELECT id FROM public.filiais WHERE empresa_id = 'YOUR_EMPRESA_ID');

-- Finally delete the filiais
DELETE FROM public.filiais WHERE empresa_id = 'YOUR_EMPRESA_ID';

COMMIT;
