-- Ensure Access Control Functions Exist
-- Copied from 20260114172027_remix_migration_from_pg_dump.sql to guarantee availability

-- 1. has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) 
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 2. has_tenant_access
CREATE OR REPLACE FUNCTION public.has_tenant_access(_user_id uuid, _tenant_id uuid) 
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_tenants
    WHERE user_id = _user_id AND tenant_id = _tenant_id
  )
$$;

-- 3. has_empresa_access
CREATE OR REPLACE FUNCTION public.has_empresa_access(_user_id uuid, _empresa_id uuid) 
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    -- Admin tem acesso a todas empresas do tenant
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.user_tenants ut ON ut.user_id = ur.user_id
        JOIN public.grupos_empresas g ON g.tenant_id = ut.tenant_id
        JOIN public.empresas e ON e.grupo_id = g.id
        WHERE ur.user_id = _user_id 
          AND ur.role = 'admin'
          AND e.id = _empresa_id
    )
    OR 
    -- Usuario tem vínculo direto com a empresa
    EXISTS (
        SELECT 1 FROM public.user_empresas
        WHERE user_id = _user_id AND empresa_id = _empresa_id
    )
$$;

-- 4. has_filial_access
CREATE OR REPLACE FUNCTION public.has_filial_access(_user_id uuid, _filial_id uuid) 
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.filiais f
        JOIN public.empresas e ON e.id = f.empresa_id
        JOIN public.grupos_empresas g ON g.id = e.grupo_id
        JOIN public.user_tenants ut ON ut.tenant_id = g.tenant_id
        WHERE f.id = _filial_id 
          AND ut.user_id = _user_id
          AND has_empresa_access(_user_id, e.id)
    )
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_tenant_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_empresa_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_filial_access(uuid, uuid) TO authenticated;
