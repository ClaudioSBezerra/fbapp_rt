-- Add reduc_icms column to aliquotas table
ALTER TABLE public.aliquotas ADD COLUMN reduc_icms numeric NOT NULL DEFAULT 0;

-- Clear existing data and insert new aliquotas (2027-2033)
DELETE FROM public.aliquotas;

INSERT INTO public.aliquotas (ano, ibs_estadual, ibs_municipal, cbs, reduc_icms, is_active) VALUES
(2027, 0.05, 0.05, 8.80, 0.00, true),
(2028, 0.05, 0.05, 8.80, 0.00, true),
(2029, 2.60, 2.60, 8.80, 20.00, true),
(2030, 5.20, 5.20, 8.80, 40.00, true),
(2031, 7.80, 7.80, 8.80, 60.00, true),
(2032, 10.40, 10.40, 8.80, 80.00, true),
(2033, 13.00, 13.00, 8.80, 100.00, true);