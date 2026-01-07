-- Drop existing INSERT policies that are too permissive
DROP POLICY IF EXISTS "Authenticated users can create tenants" ON public.tenants;
DROP POLICY IF EXISTS "Users can insert grupos for their tenants" ON public.grupos_empresas;
DROP POLICY IF EXISTS "Users can insert empresas for their grupos" ON public.empresas;
DROP POLICY IF EXISTS "Users can insert filiais for their empresas" ON public.filiais;

-- Create new restrictive INSERT policies - only admins can create tenants, grupos, empresas, and filiais
CREATE POLICY "Only admins can create tenants"
ON public.tenants FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert grupos for their tenants"
ON public.grupos_empresas FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin') AND 
  has_tenant_access(auth.uid(), tenant_id)
);

CREATE POLICY "Admins can insert empresas for their grupos"
ON public.empresas FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin') AND
  EXISTS (
    SELECT 1 FROM grupos_empresas g
    WHERE g.id = empresas.grupo_id AND has_tenant_access(auth.uid(), g.tenant_id)
  )
);

CREATE POLICY "Admins can insert filiais for their empresas"
ON public.filiais FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin') AND
  EXISTS (
    SELECT 1 FROM empresas e
    JOIN grupos_empresas g ON g.id = e.grupo_id
    WHERE e.id = filiais.empresa_id AND has_tenant_access(auth.uid(), g.tenant_id)
  )
);