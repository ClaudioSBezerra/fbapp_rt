-- Corrigir valores multiplicados por 10 na tabela energia_agua
UPDATE energia_agua
SET 
  valor = valor / 10,
  pis = pis / 10,
  cofins = cofins / 10,
  icms = icms / 10;

-- Atualizar Materialized Views para refletir correção
SELECT refresh_materialized_views();