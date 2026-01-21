BEGIN;

-- 1. Adicionar coluna cod_part na tabela servicos (identificada como faltante)
ALTER TABLE IF EXISTS public.servicos 
ADD COLUMN IF NOT EXISTS cod_part character varying(60);

-- 2. Atualizar Constraint de Mercadorias (Adicionar cod_part na chave única)
ALTER TABLE public.mercadorias DROP CONSTRAINT IF EXISTS mercadorias_unique_record;

-- Remover duplicatas exatas antes de aplicar a nova constraint
DELETE FROM public.mercadorias a USING public.mercadorias b
WHERE a.id > b.id
  AND a.filial_id = b.filial_id
  AND a.mes_ano = b.mes_ano
  AND a.tipo = b.tipo
  AND COALESCE(a.descricao, '') = COALESCE(b.descricao, '')
  AND a.valor = b.valor
  AND a.pis = b.pis
  AND a.cofins = b.cofins
  AND a.icms = b.icms
  AND a.ipi = b.ipi
  AND COALESCE(a.cod_part, '') = COALESCE(b.cod_part, '');

ALTER TABLE public.mercadorias
ADD CONSTRAINT mercadorias_unique_record 
UNIQUE (filial_id, mes_ano, tipo, descricao, valor, pis, cofins, icms, ipi, cod_part);

-- 3. Atualizar Constraint de Fretes (Adicionar descricao e cnpj_transportadora)
ALTER TABLE public.fretes DROP CONSTRAINT IF EXISTS fretes_unique_record;

DELETE FROM public.fretes a USING public.fretes b
WHERE a.id > b.id
  AND a.filial_id = b.filial_id
  AND a.mes_ano = b.mes_ano
  AND a.tipo = b.tipo
  AND a.valor = b.valor
  AND a.pis = b.pis
  AND a.cofins = b.cofins
  AND a.icms = b.icms
  AND COALESCE(a.descricao, '') = COALESCE(b.descricao, '')
  AND COALESCE(a.cnpj_transportadora, '') = COALESCE(b.cnpj_transportadora, '');

ALTER TABLE public.fretes
ADD CONSTRAINT fretes_unique_record 
UNIQUE (filial_id, mes_ano, tipo, valor, pis, cofins, icms, descricao, cnpj_transportadora);

-- 4. Atualizar Constraint de Energia/Agua (Adicionar descricao e cnpj_fornecedor)
ALTER TABLE public.energia_agua DROP CONSTRAINT IF EXISTS energia_agua_unique_record;

DELETE FROM public.energia_agua a USING public.energia_agua b
WHERE a.id > b.id
  AND a.filial_id = b.filial_id
  AND a.mes_ano = b.mes_ano
  AND a.tipo_operacao = b.tipo_operacao
  AND a.tipo_servico = b.tipo_servico
  AND a.valor = b.valor
  AND a.pis = b.pis
  AND a.cofins = b.cofins
  AND a.icms = b.icms
  AND COALESCE(a.descricao, '') = COALESCE(b.descricao, '')
  AND COALESCE(a.cnpj_fornecedor, '') = COALESCE(b.cnpj_fornecedor, '');

ALTER TABLE public.energia_agua
ADD CONSTRAINT energia_agua_unique_record 
UNIQUE (filial_id, mes_ano, tipo_operacao, tipo_servico, valor, pis, cofins, icms, descricao, cnpj_fornecedor);

-- 5. Atualizar Constraint de Servicos (Adicionar cod_part)
ALTER TABLE public.servicos DROP CONSTRAINT IF EXISTS servicos_unique_record;

DELETE FROM public.servicos a USING public.servicos b
WHERE a.id > b.id
  AND a.filial_id = b.filial_id
  AND a.mes_ano = b.mes_ano
  AND a.tipo = b.tipo
  AND COALESCE(a.descricao, '') = COALESCE(b.descricao, '')
  AND a.valor = b.valor
  AND a.pis = b.pis
  AND a.cofins = b.cofins
  AND a.iss = b.iss
  AND COALESCE(a.cod_part, '') = COALESCE(b.cod_part, '');

ALTER TABLE public.servicos
ADD CONSTRAINT servicos_unique_record 
UNIQUE (filial_id, mes_ano, tipo, descricao, valor, pis, cofins, iss, cod_part);

COMMIT;
