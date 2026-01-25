-- Fix aliquotas table values to match user provided explicit values (2027-2033)
-- Mapping user columns to DB columns:
-- perc_ibs_uf -> ibs_estadual
-- perc_ibs_mun -> ibs_municipal
-- perc_cbs -> cbs
-- perc_reduc_icms -> reduc_icms
-- perc_reduc_piscofins -> reduc_piscofins

DELETE FROM public.aliquotas;

INSERT INTO public.aliquotas (ano, ibs_estadual, ibs_municipal, cbs, reduc_icms, reduc_piscofins, is_active) VALUES 
 (2027, 0.05, 0.05, 8.80, 0.00, 100.00, true),   
 (2028, 0.05, 0.05, 8.80, 0.00, 100.00, true),   
 (2029, 5.20, 5.00, 8.80, 20.00, 100.00, true), 
 (2030, 10.40, 5.00, 8.80, 40.00, 100.00, true), 
 (2031, 15.60, 5.00, 8.80, 60.00, 100.00, true), 
 (2032, 20.80, 5.00, 8.80, 80.00, 100.00, true), 
 (2033, 26.00, 5.00, 8.80, 100.00, 100.00, true);
