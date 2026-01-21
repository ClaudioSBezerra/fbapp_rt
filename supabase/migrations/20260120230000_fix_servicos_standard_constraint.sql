-- Fix servicos constraint to use standard naming and ensure it is a proper CONSTRAINT
-- This replaces previous attempts (idx_servicos_upsert_key, idx_servicos_unique_content)

BEGIN;

-- 1. Drop old constraints and indexes to clean up
ALTER TABLE IF EXISTS public.servicos DROP CONSTRAINT IF EXISTS idx_servicos_upsert_key;
DROP INDEX IF EXISTS public.idx_servicos_unique_content;
DROP INDEX IF EXISTS public.idx_servicos_upsert_key; -- In case it was created as index only

-- 2. Remove exact duplicates (safety check before applying unique constraint)
DELETE FROM public.servicos a USING public.servicos b
WHERE a.id > b.id
  AND a.filial_id = b.filial_id
  AND a.mes_ano = b.mes_ano
  AND a.tipo = b.tipo
  AND COALESCE(a.descricao, '') = COALESCE(b.descricao, '')
  AND a.valor = b.valor
  AND a.pis = b.pis
  AND a.cofins = b.cofins
  AND a.iss = b.iss;

-- 3. Add the standard named CONSTRAINT
-- Note: We avoid COALESCE in constraint definition to be compatible with standard SQL constraints
-- The application ensures 'descricao' is not null/empty during insert
ALTER TABLE public.servicos
ADD CONSTRAINT servicos_unique_record 
UNIQUE (filial_id, mes_ano, tipo, descricao, valor, pis, cofins, iss);

COMMIT;
