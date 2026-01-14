-- Insert default aliquotas for tax reform transition 2027-2033
-- Using ON CONFLICT to be idempotent (can run multiple times safely)

INSERT INTO public.aliquotas (ano, ibs_estadual, ibs_municipal, cbs, reduc_icms, reduc_piscofins, is_active)
VALUES
  (2027, 0.1,   0.05,  0.09,  0.1,   0.1,   true),
  (2028, 0.2,   0.10,  0.18,  0.2,   0.2,   true),
  (2029, 0.3,   0.15,  0.27,  0.3,   0.3,   true),
  (2030, 0.4,   0.20,  0.36,  0.4,   0.4,   true),
  (2031, 0.5,   0.25,  0.45,  0.5,   0.5,   true),
  (2032, 0.75,  0.375, 0.675, 0.75,  0.75,  true),
  (2033, 1.0,   0.5,   0.9,   1.0,   1.0,   true)
ON CONFLICT (ano) DO UPDATE SET
  ibs_estadual = EXCLUDED.ibs_estadual,
  ibs_municipal = EXCLUDED.ibs_municipal,
  cbs = EXCLUDED.cbs,
  reduc_icms = EXCLUDED.reduc_icms,
  reduc_piscofins = EXCLUDED.reduc_piscofins,
  is_active = EXCLUDED.is_active,
  updated_at = now();