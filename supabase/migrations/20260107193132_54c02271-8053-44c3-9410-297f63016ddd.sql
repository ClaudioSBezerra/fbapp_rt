-- Fase 1: Atualizar funções RPC de batch delete com validação de acesso

-- Atualizar delete_mercadorias_batch com validação de user_id
CREATE OR REPLACE FUNCTION public.delete_mercadorias_batch(
  _user_id uuid,
  _filial_ids uuid[], 
  _batch_size integer DEFAULT 10000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count int;
  valid_filial_ids uuid[];
BEGIN
  -- Filtrar apenas filiais que o usuário tem acesso
  SELECT array_agg(id) INTO valid_filial_ids
  FROM unnest(_filial_ids) AS id
  WHERE has_filial_access(_user_id, id);
  
  IF valid_filial_ids IS NULL OR array_length(valid_filial_ids, 1) = 0 THEN
    RETURN 0;
  END IF;
  
  WITH deleted AS (
    DELETE FROM mercadorias
    WHERE id IN (
      SELECT m.id FROM mercadorias m
      WHERE m.filial_id = ANY(valid_filial_ids)
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- Atualizar delete_energia_agua_batch com validação de user_id
CREATE OR REPLACE FUNCTION public.delete_energia_agua_batch(
  _user_id uuid,
  _filial_ids uuid[], 
  _batch_size integer DEFAULT 10000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count int;
  valid_filial_ids uuid[];
BEGIN
  -- Filtrar apenas filiais que o usuário tem acesso
  SELECT array_agg(id) INTO valid_filial_ids
  FROM unnest(_filial_ids) AS id
  WHERE has_filial_access(_user_id, id);
  
  IF valid_filial_ids IS NULL OR array_length(valid_filial_ids, 1) = 0 THEN
    RETURN 0;
  END IF;
  
  WITH deleted AS (
    DELETE FROM energia_agua
    WHERE id IN (
      SELECT e.id FROM energia_agua e
      WHERE e.filial_id = ANY(valid_filial_ids)
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- Atualizar delete_fretes_batch com validação de user_id
CREATE OR REPLACE FUNCTION public.delete_fretes_batch(
  _user_id uuid,
  _filial_ids uuid[], 
  _batch_size integer DEFAULT 10000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count int;
  valid_filial_ids uuid[];
BEGIN
  -- Filtrar apenas filiais que o usuário tem acesso
  SELECT array_agg(id) INTO valid_filial_ids
  FROM unnest(_filial_ids) AS id
  WHERE has_filial_access(_user_id, id);
  
  IF valid_filial_ids IS NULL OR array_length(valid_filial_ids, 1) = 0 THEN
    RETURN 0;
  END IF;
  
  WITH deleted AS (
    DELETE FROM fretes
    WHERE id IN (
      SELECT f.id FROM fretes f
      WHERE f.filial_id = ANY(valid_filial_ids)
      LIMIT _batch_size
    )
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- Fase 3: Criar tabela de auditoria
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  action text NOT NULL,
  table_name text,
  record_count integer,
  details jsonb,
  created_at timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Política para visualização por tenant
CREATE POLICY "Users can view their tenant audit logs"
ON public.audit_logs FOR SELECT
USING (has_tenant_access(auth.uid(), tenant_id));

-- Política para inserção (service role pode inserir)
CREATE POLICY "Authenticated users can insert audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);