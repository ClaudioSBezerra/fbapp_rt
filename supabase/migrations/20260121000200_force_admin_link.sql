DO $$
DECLARE
    v_target_email text := 'claudio_bezerra@hotmail.com';
    v_user_id uuid;
    v_tenant_id uuid;
    v_grupo_id uuid;
    v_empresa_id uuid;
    v_role_exists boolean;
BEGIN
    -- 1. Buscar o usuário (insensível a maiúsculas/minúsculas)
    SELECT id INTO v_user_id 
    FROM auth.users 
    WHERE email ILIKE v_target_email;

    IF v_user_id IS NULL THEN
        RAISE WARNING 'Usuário % não encontrado na tabela auth.users', v_target_email;
    ELSE
        RAISE NOTICE 'Usuário encontrado: % (ID: %)', v_target_email, v_user_id;

        -- 2. Garantir Profile
        INSERT INTO public.profiles (id, email, full_name)
        VALUES (v_user_id, v_target_email, 'Claudio Bezerra')
        ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email; -- Garante email atualizado

        -- 3. Forçar Role ADMIN
        -- Primeiro remove qualquer role existente para garantir limpo (opcional, mas seguro)
        DELETE FROM public.user_roles WHERE user_id = v_user_id;
        
        INSERT INTO public.user_roles (user_id, role)
        VALUES (v_user_id, 'admin'::public.app_role);
        
        RAISE NOTICE 'Role ADMIN atribuída ao usuário.';

        -- 4. Garantir Tenant DEMO
        SELECT id INTO v_tenant_id FROM public.tenants WHERE nome = 'TENANT_DEMO';
        
        IF v_tenant_id IS NULL THEN
            INSERT INTO public.tenants (nome) VALUES ('TENANT_DEMO') RETURNING id INTO v_tenant_id;
            RAISE NOTICE 'Tenant DEMO criado: %', v_tenant_id;
        ELSE
            RAISE NOTICE 'Tenant DEMO existente: %', v_tenant_id;
        END IF;

        -- Vincular Tenant
        INSERT INTO public.user_tenants (user_id, tenant_id)
        VALUES (v_user_id, v_tenant_id)
        ON CONFLICT (user_id, tenant_id) DO NOTHING;
        
        RAISE NOTICE 'Usuário vinculado ao Tenant.';

        -- 5. Garantir Grupo DEMO
        SELECT id INTO v_grupo_id FROM public.grupos_empresas WHERE nome = 'GRUPO_DEMO' AND tenant_id = v_tenant_id;
        
        IF v_grupo_id IS NULL THEN
            INSERT INTO public.grupos_empresas (tenant_id, nome) VALUES (v_tenant_id, 'GRUPO_DEMO') RETURNING id INTO v_grupo_id;
            RAISE NOTICE 'Grupo DEMO criado: %', v_grupo_id;
        ELSE
            RAISE NOTICE 'Grupo DEMO existente: %', v_grupo_id;
        END IF;

        -- 6. Garantir Empresa DEMO
        SELECT id INTO v_empresa_id FROM public.empresas WHERE nome = 'EMPRESA_DEMO' AND grupo_id = v_grupo_id;
        
        IF v_empresa_id IS NULL THEN
            INSERT INTO public.empresas (grupo_id, nome) VALUES (v_grupo_id, 'EMPRESA_DEMO') RETURNING id INTO v_empresa_id;
            RAISE NOTICE 'Empresa DEMO criada: %', v_empresa_id;
        ELSE
            RAISE NOTICE 'Empresa DEMO existente: %', v_empresa_id;
        END IF;

        -- 7. Vincular Empresa
        INSERT INTO public.user_empresas (user_id, empresa_id)
        VALUES (v_user_id, v_empresa_id)
        ON CONFLICT (user_id, empresa_id) DO NOTHING;

        RAISE NOTICE 'Usuário vinculado à Empresa.';
        
    END IF;
END $$;
