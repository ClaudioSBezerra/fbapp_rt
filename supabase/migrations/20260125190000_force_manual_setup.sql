-- Force setup for claudio_bezerra@hotmail.com
-- Sets: Admin, Profile (Goiania, 1969-01-14), Tenant (TENANT_DEMO), Company (Fortes Bezerra Tecnologia)

DO $$
DECLARE
    v_user_id uuid;
    v_tenant_id uuid;
    v_grupo_id uuid;
    v_empresa_id uuid;
BEGIN
    -- 1. Get User ID
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'claudio_bezerra@hotmail.com';

    IF v_user_id IS NULL THEN
        RAISE NOTICE 'User claudio_bezerra@hotmail.com not found in auth.users. Skipping setup.';
        RETURN;
    END IF;

    RAISE NOTICE 'Setting up user: %', v_user_id;

    -- 2. Update Profile
    -- Using explicit date format YYYY-MM-DD
    UPDATE public.profiles
    SET 
        recovery_city = 'Goiania',
        recovery_dob = '1969-01-14',
        full_name = COALESCE(full_name, 'Claudio Bezerra')
    WHERE id = v_user_id;

    -- 3. Ensure Admin Role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

    -- 4. Create/Get Tenant (TENANT_DEMO)
    SELECT id INTO v_tenant_id FROM public.tenants WHERE nome = 'TENANT_DEMO';
    
    IF v_tenant_id IS NULL THEN
        INSERT INTO public.tenants (nome, subscription_status)
        VALUES ('TENANT_DEMO', 'active')
        RETURNING id INTO v_tenant_id;
    END IF;

    -- 5. Link User to Tenant
    INSERT INTO public.user_tenants (user_id, tenant_id)
    VALUES (v_user_id, v_tenant_id)
    ON CONFLICT (user_id, tenant_id) DO NOTHING;

    -- 6. Create/Get Grupo (Grupo Fortes)
    SELECT id INTO v_grupo_id FROM public.grupos_empresas WHERE tenant_id = v_tenant_id LIMIT 1;

    IF v_grupo_id IS NULL THEN
        INSERT INTO public.grupos_empresas (tenant_id, nome)
        VALUES (v_tenant_id, 'Grupo Fortes')
        RETURNING id INTO v_grupo_id;
    END IF;

    -- 7. Create/Get Empresa (Fortes Bezerra Tecnologia)
    SELECT id INTO v_empresa_id FROM public.empresas WHERE grupo_id = v_grupo_id AND nome = 'Fortes Bezerra Tecnologia';

    IF v_empresa_id IS NULL THEN
        INSERT INTO public.empresas (grupo_id, nome)
        VALUES (v_grupo_id, 'Fortes Bezerra Tecnologia')
        RETURNING id INTO v_empresa_id;
    END IF;

    -- 8. Link User to Empresa
    INSERT INTO public.user_empresas (user_id, empresa_id)
    VALUES (v_user_id, v_empresa_id)
    ON CONFLICT (user_id, empresa_id) DO NOTHING;

    RAISE NOTICE 'Setup complete for user % in TENANT_DEMO with company Fortes Bezerra Tecnologia', v_user_id;

END $$;
