-- Índices para acelerar a view mv_mercadorias_participante

-- Índice para acelerar JOIN com participantes
CREATE INDEX IF NOT EXISTS idx_participantes_cod_part_filial 
ON participantes(cod_part, filial_id);

-- Índice para acelerar JOIN com simples_nacional
CREATE INDEX IF NOT EXISTS idx_simples_nacional_cnpj_tenant 
ON simples_nacional(cnpj, tenant_id);

-- Índice para mercadorias por filial e mês
CREATE INDEX IF NOT EXISTS idx_mercadorias_filial_mes_tipo 
ON mercadorias(filial_id, mes_ano, tipo);

-- Índice para mercadorias por cod_part
CREATE INDEX IF NOT EXISTS idx_mercadorias_cod_part 
ON mercadorias(cod_part) WHERE cod_part IS NOT NULL;