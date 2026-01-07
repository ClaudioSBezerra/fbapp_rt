-- Adicionar coluna reduc_piscofins
ALTER TABLE aliquotas ADD COLUMN reduc_piscofins numeric NOT NULL DEFAULT 0;

-- Popular com 100% para todos os anos a partir de 2027
UPDATE aliquotas SET reduc_piscofins = 100 WHERE ano >= 2027;