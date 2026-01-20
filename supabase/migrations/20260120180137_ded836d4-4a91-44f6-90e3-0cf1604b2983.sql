-- ============================================
-- AJUSTAR ÍNDICES PARA COMPATIBILIDADE COM UPSERT
-- ============================================

-- Remover o índice antigo de mercadorias que usa COALESCE (incompatível com upsert simples)
DROP INDEX IF EXISTS idx_mercadorias_upsert_key;

-- Criar índice único para mercadorias compatível com onConflict do supabase-js
-- Nota: cod_part NULL será tratado como valor único (cada NULL é distinto)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mercadorias_upsert_key 
ON public.mercadorias (filial_id, mes_ano, tipo, cod_part, valor, pis, cofins, COALESCE(icms, 0), COALESCE(ipi, 0));

-- Criar índice único para fretes
CREATE UNIQUE INDEX IF NOT EXISTS idx_fretes_upsert_key 
ON public.fretes (filial_id, mes_ano, tipo, valor, pis, cofins, icms);

-- Criar índice único para energia_agua
CREATE UNIQUE INDEX IF NOT EXISTS idx_energia_agua_upsert_key 
ON public.energia_agua (filial_id, mes_ano, tipo_operacao, tipo_servico, valor, pis, cofins, icms);

-- Criar índice único para participantes (já deve existir, mas garantir)
CREATE UNIQUE INDEX IF NOT EXISTS idx_participantes_upsert_key 
ON public.participantes (filial_id, cod_part);