-- Enum para roles de usuário
CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'viewer');

-- Tabela de Tenants (Empresas/CNPJs)
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj VARCHAR(18) NOT NULL UNIQUE,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Tabela de Profiles (vinculada ao auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Tabela de User Roles (separada para segurança)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);

-- Tabela de vínculo User-Tenant
CREATE TABLE public.user_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (user_id, tenant_id)
);

-- Tabela de Alíquotas por Ano
CREATE TABLE public.aliquotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ano INTEGER NOT NULL,
  ibs_estadual DECIMAL(5,2) NOT NULL DEFAULT 0,
  ibs_municipal DECIMAL(5,2) NOT NULL DEFAULT 0,
  cbs DECIMAL(5,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  UNIQUE (ano)
);

-- Tabela de Mercadorias (Entradas e Saídas)
CREATE TABLE public.mercadorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  mes_ano DATE NOT NULL,
  ncm VARCHAR(10),
  descricao TEXT,
  valor DECIMAL(15,2) NOT NULL DEFAULT 0,
  pis DECIMAL(15,2) NOT NULL DEFAULT 0,
  cofins DECIMAL(15,2) NOT NULL DEFAULT 0,
  icms DECIMAL(15,2) DEFAULT 0,
  ipi DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aliquotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercadorias ENABLE ROW LEVEL SECURITY;

-- Função para verificar role (security definer)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Função para verificar acesso ao tenant
CREATE OR REPLACE FUNCTION public.has_tenant_access(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_tenants
    WHERE user_id = _user_id AND tenant_id = _tenant_id
  )
$$;

-- RLS Policies para Profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies para User Roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies para Tenants
CREATE POLICY "Users can view their tenants" ON public.tenants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_tenants
      WHERE user_tenants.tenant_id = tenants.id
      AND user_tenants.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage tenants" ON public.tenants
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies para User Tenants
CREATE POLICY "Users can view own tenant links" ON public.user_tenants
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage user tenants" ON public.user_tenants
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies para Alíquotas (todos autenticados podem ver)
CREATE POLICY "Authenticated users can view aliquotas" ON public.aliquotas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage aliquotas" ON public.aliquotas
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies para Mercadorias
CREATE POLICY "Users can view mercadorias of their tenants" ON public.mercadorias
  FOR SELECT USING (public.has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Users can insert mercadorias for their tenants" ON public.mercadorias
  FOR INSERT WITH CHECK (public.has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Users can update mercadorias of their tenants" ON public.mercadorias
  FOR UPDATE USING (public.has_tenant_access(auth.uid(), tenant_id));

CREATE POLICY "Users can delete mercadorias of their tenants" ON public.mercadorias
  FOR DELETE USING (public.has_tenant_access(auth.uid(), tenant_id));

-- Trigger para criar profile automaticamente ao registrar
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name');
  
  -- Atribuir role 'user' por padrão
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_aliquotas_updated_at
  BEFORE UPDATE ON public.aliquotas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mercadorias_updated_at
  BEFORE UPDATE ON public.mercadorias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir alíquotas da transição (2026-2033)
INSERT INTO public.aliquotas (ano, ibs_estadual, ibs_municipal, cbs) VALUES
  (2026, 0.10, 0.10, 0.90),
  (2027, 0.20, 0.20, 1.80),
  (2028, 0.40, 0.40, 3.60),
  (2029, 0.60, 0.60, 5.40),
  (2030, 0.80, 0.80, 7.20),
  (2031, 1.00, 1.00, 9.00),
  (2032, 1.20, 1.20, 10.80),
  (2033, 14.00, 14.00, 8.80);