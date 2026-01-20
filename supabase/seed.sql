-- Script de Bootstrap/Seed para Supabase
-- Este script insere dados iniciais para testes ou configuração básica

BEGIN;

-- 1. Criar Tenant Inicial (se não existir)
INSERT INTO public.tenants (nome)
VALUES ('Ambiente de Desenvolvimento')
ON CONFLICT DO NOTHING;

-- 2. Obter ID do Tenant (para usar nos próximos inserts)
DO $$
DECLARE
    v_tenant_id uuid;
    v_grupo_id uuid;
    v_empresa_id uuid;
BEGIN
    SELECT id INTO v_tenant_id FROM public.tenants WHERE nome = 'Ambiente de Desenvolvimento' LIMIT 1;

    -- 3. Criar Grupo de Empresas
    INSERT INTO public.grupos_empresas (tenant_id, nome)
    VALUES (v_tenant_id, 'Grupo Principal')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_grupo_id;

    -- Se não inseriu (já existia), busca o ID
    IF v_grupo_id IS NULL THEN
        SELECT id INTO v_grupo_id FROM public.grupos_empresas WHERE tenant_id = v_tenant_id AND nome = 'Grupo Principal' LIMIT 1;
    END IF;

    -- 4. Criar Empresa Exemplo
    INSERT INTO public.empresas (grupo_id, nome)
    VALUES (v_grupo_id, 'Empresa Matriz Ltda')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_empresa_id;

    -- Se não inseriu (já existia), busca o ID
    IF v_empresa_id IS NULL THEN
        SELECT id INTO v_empresa_id FROM public.empresas WHERE grupo_id = v_grupo_id AND nome = 'Empresa Matriz Ltda' LIMIT 1;
    END IF;

    -- 5. Criar Filial Exemplo
    INSERT INTO public.filiais (empresa_id, cnpj, razao_social, nome_fantasia, cod_est)
    VALUES (v_empresa_id, '00000000000191', 'Empresa Matriz Ltda', 'Matriz', '0001')
    ON CONFLICT (cnpj) DO NOTHING;

    -- 6. Inserir Alíquotas Padrão (2024, 2025, 2026)
    INSERT INTO public.aliquotas (ano, ibs_estadual, ibs_municipal, cbs, is_active)
    VALUES 
        (2024, 17.00, 2.00, 9.00, true),
        (2025, 17.50, 2.00, 9.00, true),
        (2026, 18.00, 2.00, 9.00, true)
    ON CONFLICT (ano) DO UPDATE 
    SET ibs_estadual = EXCLUDED.ibs_estadual,
        ibs_municipal = EXCLUDED.ibs_municipal,
        cbs = EXCLUDED.cbs;

END $$;

COMMIT;
