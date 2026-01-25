-- Correct aliquotas table values to match the latest reference (2027-2033)
-- Based on migration 20260108121859_98409297-b0a6-4e89-9e4d-44a6fa201f61 from reference project

DELETE FROM public.aliquotas;

INSERT INTO public.aliquotas (ano, ibs_estadual, ibs_municipal, cbs, reduc_icms, reduc_piscofins, is_active) VALUES
(2027, 0.10, 0.00, 8.80, 0.00, 100.00, true),
(2028, 0.10, 0.00, 8.80, 0.00, 100.00, true),
(2029, 5.20, 0.00, 8.80, 20.00, 100.00, true),
(2030, 10.40, 0.00, 8.80, 40.00, 100.00, true),
(2031, 15.60, 0.00, 8.80, 60.00, 100.00, true),
(2032, 20.80, 0.00, 8.80, 80.00, 100.00, true),
(2033, 26.00, 0.00, 8.80, 100.00, 100.00, true);
