-- Função para validar se tenant existe (pode ser chamada por qualquer usuário autenticado)
CREATE OR REPLACE FUNCTION public.validate_tenant_exists(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = _tenant_id
  )
$$;

-- Função para obter nome do tenant (para exibir ao usuário após validação)
CREATE OR REPLACE FUNCTION public.get_tenant_name(_tenant_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nome FROM public.tenants WHERE id = _tenant_id
$$;