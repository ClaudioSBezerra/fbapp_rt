-- Etapa 1: Criar tabela user_empresas
CREATE TABLE public.user_empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, empresa_id)
);

-- Habilitar RLS
ALTER TABLE public.user_empresas ENABLE ROW LEVEL SECURITY;

-- Índices para performance
CREATE INDEX idx_user_empresas_user ON user_empresas(user_id);
CREATE INDEX idx_user_empresas_empresa ON user_empresas(empresa_id);

-- Etapa 2: Criar função has_empresa_access
CREATE OR REPLACE FUNCTION public.has_empresa_access(_user_id UUID, _empresa_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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

-- Etapa 3: Atualizar função has_filial_access
CREATE OR REPLACE FUNCTION public.has_filial_access(_user_id UUID, _filial_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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

-- Etapa 4: Políticas RLS para user_empresas
-- Usuarios veem seus próprios vínculos
CREATE POLICY "Users can view own empresa links"
ON user_empresas FOR SELECT
USING (auth.uid() = user_id);

-- Admins podem gerenciar todos os vínculos
CREATE POLICY "Admins can manage user_empresas"
ON user_empresas FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Usuarios podem se vincular (usado no onboarding)
CREATE POLICY "Users can link themselves"
ON user_empresas FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Etapa 5: Inserir vínculos iniciais
-- Kellwy -> FCM
INSERT INTO user_empresas (user_id, empresa_id)
VALUES ('edf5d5cc-bce2-48a2-9ec4-b11978fe3f74', '3603aff4-7d62-4c22-b7b5-3d379ae913e2');

-- Anselmo -> Ferreira Costa
INSERT INTO user_empresas (user_id, empresa_id)
VALUES ('bd44bd4c-e4b1-4541-9566-4f3f657d24f9', '62d37b76-1c83-485a-853d-fdb54157d414');