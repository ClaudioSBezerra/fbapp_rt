-- Limpar tabela de aliquotas
DELETE FROM aliquotas;

-- Inserir novos registros (2027-2033) conforme solicitado
INSERT INTO aliquotas (ano, ibs_estadual, ibs_municipal, cbs, reduc_icms, reduc_piscofins, is_active) VALUES
(2027, 0.10, 0.00, 8.80, 0.00, 100.00, true),
(2028, 0.10, 0.00, 8.80, 0.00, 100.00, true),
(2029, 5.20, 0.00, 8.80, 20.00, 100.00, true),
(2030, 10.40, 0.00, 8.80, 40.00, 100.00, true),
(2031, 15.60, 0.00, 8.80, 60.00, 100.00, true),
(2032, 20.80, 0.00, 8.80, 80.00, 100.00, true),
(2033, 26.00, 0.00, 8.80, 100.00, 100.00, true);

-- Atualizar materialized views
SELECT public.refresh_materialized_views();