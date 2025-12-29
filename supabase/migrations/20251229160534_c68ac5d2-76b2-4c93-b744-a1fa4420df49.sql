-- Remove CNPJ from tenants table (tenant is just an organizational unit now)
ALTER TABLE public.tenants DROP COLUMN cnpj;
ALTER TABLE public.tenants DROP COLUMN razao_social;
ALTER TABLE public.tenants DROP COLUMN nome_fantasia;
ALTER TABLE public.tenants ADD COLUMN nome text NOT NULL DEFAULT 'Meu Ambiente';

-- Create grupos_empresas table (company groups - name only)
CREATE TABLE public.grupos_empresas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create empresas table (companies - name only)
CREATE TABLE public.empresas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  grupo_id uuid NOT NULL REFERENCES public.grupos_empresas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create filiais table (branches - has CNPJ)
CREATE TABLE public.filiais (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cnpj varchar(14) NOT NULL UNIQUE,
  razao_social text NOT NULL,
  nome_fantasia text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Update mercadorias to link to filiais instead of tenants
ALTER TABLE public.mercadorias DROP CONSTRAINT IF EXISTS mercadorias_tenant_id_fkey;
ALTER TABLE public.mercadorias RENAME COLUMN tenant_id TO filial_id;
ALTER TABLE public.mercadorias ADD CONSTRAINT mercadorias_filial_id_fkey FOREIGN KEY (filial_id) REFERENCES public.filiais(id) ON DELETE CASCADE;

-- Enable RLS on new tables
ALTER TABLE public.grupos_empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filiais ENABLE ROW LEVEL SECURITY;

-- Create helper function to check if user has access to a filial
CREATE OR REPLACE FUNCTION public.has_filial_access(_user_id uuid, _filial_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.filiais f
    JOIN public.empresas e ON e.id = f.empresa_id
    JOIN public.grupos_empresas g ON g.id = e.grupo_id
    JOIN public.user_tenants ut ON ut.tenant_id = g.tenant_id
    WHERE f.id = _filial_id AND ut.user_id = _user_id
  )
$$;

-- RLS policies for grupos_empresas
CREATE POLICY "Users can view grupos of their tenants"
ON public.grupos_empresas FOR SELECT
USING (has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Users can insert grupos for their tenants"
ON public.grupos_empresas FOR INSERT
WITH CHECK (has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Users can update grupos of their tenants"
ON public.grupos_empresas FOR UPDATE
USING (has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Users can delete grupos of their tenants"
ON public.grupos_empresas FOR DELETE
USING (has_tenant_access(auth.uid(), tenant_id));

-- RLS policies for empresas (access through grupo -> tenant)
CREATE POLICY "Users can view empresas of their grupos"
ON public.empresas FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.grupos_empresas g
  WHERE g.id = grupo_id AND has_tenant_access(auth.uid(), g.tenant_id)
));

CREATE POLICY "Users can insert empresas for their grupos"
ON public.empresas FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.grupos_empresas g
  WHERE g.id = grupo_id AND has_tenant_access(auth.uid(), g.tenant_id)
));

CREATE POLICY "Users can update empresas of their grupos"
ON public.empresas FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.grupos_empresas g
  WHERE g.id = grupo_id AND has_tenant_access(auth.uid(), g.tenant_id)
));

CREATE POLICY "Users can delete empresas of their grupos"
ON public.empresas FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.grupos_empresas g
  WHERE g.id = grupo_id AND has_tenant_access(auth.uid(), g.tenant_id)
));

-- RLS policies for filiais (access through empresa -> grupo -> tenant)
CREATE POLICY "Users can view filiais of their empresas"
ON public.filiais FOR SELECT
USING (has_filial_access(auth.uid(), id));

CREATE POLICY "Users can insert filiais for their empresas"
ON public.filiais FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.empresas e
  JOIN public.grupos_empresas g ON g.id = e.grupo_id
  WHERE e.id = empresa_id AND has_tenant_access(auth.uid(), g.tenant_id)
));

CREATE POLICY "Users can update filiais of their empresas"
ON public.filiais FOR UPDATE
USING (has_filial_access(auth.uid(), id));

CREATE POLICY "Users can delete filiais of their empresas"
ON public.filiais FOR DELETE
USING (has_filial_access(auth.uid(), id));

-- Update mercadorias RLS policies
DROP POLICY IF EXISTS "Users can view mercadorias of their tenants" ON public.mercadorias;
DROP POLICY IF EXISTS "Users can insert mercadorias for their tenants" ON public.mercadorias;
DROP POLICY IF EXISTS "Users can update mercadorias of their tenants" ON public.mercadorias;
DROP POLICY IF EXISTS "Users can delete mercadorias of their tenants" ON public.mercadorias;

CREATE POLICY "Users can view mercadorias of their filiais"
ON public.mercadorias FOR SELECT
USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can insert mercadorias for their filiais"
ON public.mercadorias FOR INSERT
WITH CHECK (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can update mercadorias of their filiais"
ON public.mercadorias FOR UPDATE
USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can delete mercadorias of their filiais"
ON public.mercadorias FOR DELETE
USING (has_filial_access(auth.uid(), filial_id));

-- Add triggers for updated_at
CREATE TRIGGER update_grupos_empresas_updated_at
BEFORE UPDATE ON public.grupos_empresas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_empresas_updated_at
BEFORE UPDATE ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_filiais_updated_at
BEFORE UPDATE ON public.filiais
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();