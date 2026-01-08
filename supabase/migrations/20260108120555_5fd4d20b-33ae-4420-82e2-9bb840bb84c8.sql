-- Limpar e recarregar alíquotas com valores corretos da reforma tributária
DELETE FROM aliquotas;

INSERT INTO aliquotas (ano, ibs_estadual, ibs_municipal, cbs, reduc_icms, reduc_piscofins, is_active) VALUES
-- 2024-2026: Sistema atual (sem IBS/CBS)
(2024, 0, 0, 0, 0, 0, true),
(2025, 0, 0, 0, 0, 0, true),
(2026, 0, 0, 0, 0, 0, true),
-- 2027-2028: Início CBS (substitui PIS/COFINS), IBS mínimo
(2027, 0.08, 0.02, 8.80, 0, 100, true),
(2028, 0.08, 0.02, 8.80, 0, 100, true),
-- 2029-2032: Extinção gradual do ICMS (1/5 ao ano)
(2029, 4.16, 1.04, 8.80, 20, 100, true),
(2030, 8.32, 2.08, 8.80, 40, 100, true),
(2031, 12.48, 3.12, 8.80, 60, 100, true),
(2032, 16.64, 4.16, 8.80, 80, 100, true),
-- 2033: Transição completa
(2033, 20.80, 5.20, 8.80, 100, 100, true);

-- Atualizar materialized views
SELECT public.refresh_materialized_views();