-- Add unique constraints to prevent duplicate imports
-- Using a hash of the key fields to avoid constraint size limits

-- Mercadorias: unique by filial, period, type, description and values
ALTER TABLE mercadorias ADD CONSTRAINT mercadorias_unique_record 
  UNIQUE (filial_id, mes_ano, tipo, descricao, valor, pis, cofins, icms, ipi);

-- Fretes: unique by filial, period, type and values  
ALTER TABLE fretes ADD CONSTRAINT fretes_unique_record 
  UNIQUE (filial_id, mes_ano, tipo, valor, pis, cofins, icms);

-- Energia/Agua: unique by filial, period, operation type, service type and values
ALTER TABLE energia_agua ADD CONSTRAINT energia_agua_unique_record 
  UNIQUE (filial_id, mes_ano, tipo_operacao, tipo_servico, valor, pis, cofins, icms);