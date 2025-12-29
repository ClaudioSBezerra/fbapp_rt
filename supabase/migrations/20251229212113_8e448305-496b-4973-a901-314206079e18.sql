-- Adicionar campo icms na tabela energia_agua
ALTER TABLE public.energia_agua 
  ADD COLUMN IF NOT EXISTS icms numeric NOT NULL DEFAULT 0;

-- Adicionar campo icms na tabela fretes
ALTER TABLE public.fretes 
  ADD COLUMN IF NOT EXISTS icms numeric NOT NULL DEFAULT 0;