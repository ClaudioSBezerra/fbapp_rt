-- Limpar e recarregar alíquotas da reforma tributária
DELETE FROM aliquotas;

INSERT INTO aliquotas (ano, ibs_estadual, ibs_municipal, cbs, reduc_icms, reduc_piscofins, is_active) VALUES
(2024, 0, 0, 0, 0, 0, true),
(2025, 0, 0, 0, 0, 0, true),
(2026, 0.08, 0.02, 0.9, 0, 0, true),
(2027, 0.64, 0.16, 8.8, 10, 100, true),
(2028, 0.64, 0.16, 8.8, 20, 100, true),
(2029, 1.28, 0.32, 8.8, 30, 100, true),
(2030, 1.92, 0.48, 8.8, 40, 100, true),
(2031, 2.56, 0.64, 8.8, 50, 100, true),
(2032, 3.20, 0.80, 8.8, 60, 100, true),
(2033, 8.0, 2.0, 8.8, 100, 100, true);

-- Atualizar materialized views
SELECT public.refresh_materialized_views();