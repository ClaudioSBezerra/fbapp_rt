-- Migration para formalizar a constraint de unicidade na tabela servicos
-- Necessário para que o ON CONFLICT funcione corretamente com o nome da constraint

BEGIN;

-- 1. Garantir que o índice único existe (caso não tenha sido criado pela migração anterior)
-- Usamos COALESCE na descrição para garantir unicidade mesmo com NULLs, mas constraints UNIQUE padrão
-- lidam melhor com colunas puras. Para simplificar e padronizar com as outras tabelas (mercadorias),
-- vamos criar uma constraint UNIQUE padrão nas colunas.

-- Primeiro, removemos duplicatas exatas considerando NULLs como iguais
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

-- 2. Adicionar a Constraint Única formal
-- Se o índice antigo existir, vamos dropá-lo para evitar redundância e conflitos
DROP INDEX IF EXISTS public.idx_servicos_unique_content;

-- Adicionar a constraint (se já não existir)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'idx_servicos_upsert_key'
    ) THEN
        ALTER TABLE public.servicos
        ADD CONSTRAINT idx_servicos_upsert_key 
        UNIQUE (filial_id, mes_ano, tipo, descricao, valor, pis, cofins, iss);
    END IF;
END $$;

COMMIT;
