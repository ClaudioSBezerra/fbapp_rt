-- Remove Foreign Key constraints to allow logical relationships
-- This enables importing data even when participants are missing or processed out of order

-- 1. Mercadorias
ALTER TABLE IF EXISTS public.mercadorias 
DROP CONSTRAINT IF EXISTS mercadorias_cod_part_fkey;

ALTER TABLE IF EXISTS public.mercadorias 
DROP CONSTRAINT IF EXISTS mercadorias_participantes_filial_id_cod_part_fk;

-- 2. Servicos
ALTER TABLE IF EXISTS public.servicos 
DROP CONSTRAINT IF EXISTS servicos_cod_part_fkey;

-- 3. Fretes
ALTER TABLE IF EXISTS public.fretes 
DROP CONSTRAINT IF EXISTS fretes_cnpj_transportadora_fkey; -- Assuming this might link to participantes

-- 4. Energia/Agua
ALTER TABLE IF EXISTS public.energia_agua 
DROP CONSTRAINT IF EXISTS energia_agua_cnpj_fornecedor_fkey; -- Assuming this might link to participantes
