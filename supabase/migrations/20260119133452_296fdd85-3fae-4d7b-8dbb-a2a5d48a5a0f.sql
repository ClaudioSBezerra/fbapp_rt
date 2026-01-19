-- Adicionar coluna cnpj_normalizado na tabela participantes
ALTER TABLE public.participantes 
ADD COLUMN IF NOT EXISTS cnpj_normalizado VARCHAR(14);

-- Criar função para normalizar CNPJ automaticamente
CREATE OR REPLACE FUNCTION public.normalize_participante_cnpj()
RETURNS TRIGGER AS $$
BEGIN
  NEW.cnpj_normalizado := REGEXP_REPLACE(COALESCE(NEW.cnpj, ''), '[^0-9]', '', 'g');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para normalização automática
DROP TRIGGER IF EXISTS tr_normalize_cnpj ON public.participantes;
CREATE TRIGGER tr_normalize_cnpj
BEFORE INSERT OR UPDATE ON public.participantes
FOR EACH ROW
EXECUTE FUNCTION public.normalize_participante_cnpj();

-- Atualizar dados existentes
UPDATE public.participantes 
SET cnpj_normalizado = REGEXP_REPLACE(COALESCE(cnpj, ''), '[^0-9]', '', 'g')
WHERE cnpj_normalizado IS NULL OR cnpj_normalizado = '';

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_participantes_cnpj_normalizado 
ON public.participantes(cnpj_normalizado);

-- Criar função RPC para estatísticas de vinculação
CREATE OR REPLACE FUNCTION public.get_simples_link_stats()
RETURNS TABLE(
  total_simples bigint,
  vinculados_uso_consumo bigint,
  vinculados_mercadorias bigint,
  optantes_vinculados bigint
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT ut.tenant_id INTO v_tenant_id
  FROM user_tenants ut
  WHERE ut.user_id = auth.uid()
  LIMIT 1;
  
  IF v_tenant_id IS NULL THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM simples_nacional WHERE tenant_id = v_tenant_id)::bigint,
    (SELECT COUNT(DISTINCT sn.cnpj) 
     FROM simples_nacional sn
     INNER JOIN participantes p ON p.cnpj_normalizado = sn.cnpj
     INNER JOIN uso_consumo_imobilizado uci ON uci.cod_part = p.cod_part AND uci.filial_id = p.filial_id
     INNER JOIN filiais f ON f.id = uci.filial_id
     INNER JOIN empresas e ON e.id = f.empresa_id
     INNER JOIN grupos_empresas g ON g.id = e.grupo_id
     WHERE sn.tenant_id = v_tenant_id AND g.tenant_id = v_tenant_id)::bigint,
    (SELECT COUNT(DISTINCT sn.cnpj) 
     FROM simples_nacional sn
     INNER JOIN participantes p ON p.cnpj_normalizado = sn.cnpj
     INNER JOIN mercadorias m ON m.cod_part = p.cod_part AND m.filial_id = p.filial_id
     INNER JOIN filiais f ON f.id = m.filial_id
     INNER JOIN empresas e ON e.id = f.empresa_id
     INNER JOIN grupos_empresas g ON g.id = e.grupo_id
     WHERE sn.tenant_id = v_tenant_id AND g.tenant_id = v_tenant_id)::bigint,
    (SELECT COUNT(DISTINCT sn.cnpj) 
     FROM simples_nacional sn
     INNER JOIN participantes p ON p.cnpj_normalizado = sn.cnpj
     WHERE sn.tenant_id = v_tenant_id 
       AND sn.is_simples = true
       AND EXISTS (
         SELECT 1 FROM uso_consumo_imobilizado uci 
         INNER JOIN filiais f ON f.id = uci.filial_id
         INNER JOIN empresas e ON e.id = f.empresa_id
         INNER JOIN grupos_empresas g ON g.id = e.grupo_id
         WHERE uci.cod_part = p.cod_part AND uci.filial_id = p.filial_id AND g.tenant_id = v_tenant_id
         UNION
         SELECT 1 FROM mercadorias m 
         INNER JOIN filiais f ON f.id = m.filial_id
         INNER JOIN empresas e ON e.id = f.empresa_id
         INNER JOIN grupos_empresas g ON g.id = e.grupo_id
         WHERE m.cod_part = p.cod_part AND m.filial_id = p.filial_id AND g.tenant_id = v_tenant_id
       ))::bigint;
END;
$$;

-- Atualizar função de refresh
CREATE OR REPLACE FUNCTION public.refresh_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  BEGIN
    REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_detailed;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  
  BEGIN
    REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_participante;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  
  BEGIN
    REFRESH MATERIALIZED VIEW extensions.mv_uso_consumo_aggregated;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  
  BEGIN
    REFRESH MATERIALIZED VIEW extensions.mv_mercadorias_aggregated;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
END;
$$;