-- Remover constraint antigo de tipo_servico
ALTER TABLE energia_agua 
DROP CONSTRAINT IF EXISTS energia_agua_tipo_servico_check;

-- Adicionar constraint expandido para aceitar novos tipos
ALTER TABLE energia_agua 
ADD CONSTRAINT energia_agua_tipo_servico_check 
CHECK (tipo_servico IN ('energia', 'agua', 'gas', 'comunicacao', 'outros'));