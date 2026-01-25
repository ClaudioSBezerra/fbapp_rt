-- Fix aliquotas table values to match Tax Reform transition (2026-2033)
-- Removing incorrect values (2024-2025) and updating 2026-2033 with correct rates

DELETE FROM public.aliquotas;

INSERT INTO public.aliquotas (ano, ibs_estadual, ibs_municipal, cbs, reduc_icms, reduc_piscofins, is_active) VALUES
(2026, 0.08, 0.02, 0.90, 0.00, 0.00, true),
(2027, 0.64, 0.16, 8.80, 10.00, 100.00, true),
(2028, 0.64, 0.16, 8.80, 20.00, 100.00, true),
(2029, 1.28, 0.32, 8.80, 30.00, 100.00, true),
(2030, 1.92, 0.48, 8.80, 40.00, 100.00, true),
(2031, 2.56, 0.64, 8.80, 50.00, 100.00, true),
(2032, 3.20, 0.80, 8.80, 60.00, 100.00, true),
(2033, 8.00, 2.00, 8.80, 100.00, 100.00, true);
