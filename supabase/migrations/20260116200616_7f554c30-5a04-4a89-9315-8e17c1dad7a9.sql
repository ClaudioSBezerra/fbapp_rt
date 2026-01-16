-- Preencher mes_ano em jobs antigos baseado nos dados existentes

-- Jobs icms_uso_consumo: extrair mes_ano de uso_consumo_imobilizado
UPDATE import_jobs ij
SET mes_ano = (
  SELECT DISTINCT u.mes_ano
  FROM uso_consumo_imobilizado u
  JOIN filiais f ON f.id = u.filial_id
  WHERE f.id = ij.filial_id
    AND u.created_at >= ij.created_at - interval '1 minute'
    AND u.created_at <= ij.completed_at + interval '1 minute'
  LIMIT 1
)
WHERE ij.import_scope = 'icms_uso_consumo'
  AND ij.mes_ano IS NULL
  AND ij.status = 'completed'
  AND ij.filial_id IS NOT NULL;

-- Jobs EFD Contribuições: extrair mes_ano de mercadorias
UPDATE import_jobs ij
SET mes_ano = (
  SELECT DISTINCT m.mes_ano
  FROM mercadorias m
  JOIN filiais f ON f.id = m.filial_id
  WHERE f.id = ij.filial_id
    AND m.created_at >= ij.created_at - interval '1 minute'
    AND m.created_at <= ij.completed_at + interval '1 minute'
  LIMIT 1
)
WHERE ij.import_scope IN ('all', 'only_a', 'only_c', 'only_d')
  AND ij.mes_ano IS NULL
  AND ij.status = 'completed'
  AND ij.filial_id IS NOT NULL;