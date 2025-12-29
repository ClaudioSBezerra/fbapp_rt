-- Adicionar constraint UNIQUE para evitar duplicidade de vínculo user-tenant
ALTER TABLE public.user_tenants 
ADD CONSTRAINT user_tenants_user_tenant_unique UNIQUE (user_id, tenant_id);

-- Adicionar constraint UNIQUE para evitar duplicidade de CNPJ por empresa
ALTER TABLE public.filiais 
ADD CONSTRAINT filiais_empresa_cnpj_unique UNIQUE (empresa_id, cnpj);