-- 1. Atualizar a função handle_new_user para garantir que o claudio_bezerra@hotmail.com seja Admin e tenha o ambiente
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  admin_exists boolean;
  new_role app_role;
  v_tenant_id uuid;
  v_grupo_id uuid;
  v_empresa_id uuid;
  is_target_user boolean;
BEGIN
  -- Criar profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name');
  
  -- Verificar se é o usuário específico
  is_target_user := (NEW.email = 'claudio_bezerra@hotmail.com');

  -- Verificar se existe algum admin no sistema
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'
  ) INTO admin_exists;
  
  -- Se não houver admin OU for o usuário alvo, vira admin
  IF NOT admin_exists OR is_target_user THEN
    new_role := 'admin';
  ELSE
    new_role := 'user';
  END IF;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, new_role);
  
  -- Se for admin (incluindo o usuário alvo), criar estrutura DEMO
  -- Mas para evitar criar DEMO para todo admin futuro, vamos restringir ao usuário alvo ou se for o PRIMEIRO admin
  IF new_role = 'admin' AND (is_target_user OR NOT admin_exists) THEN
    
    -- Se for o usuário alvo, usa nomes específicos
    IF is_target_user THEN
        -- Criar/Recuperar Tenant DEMO
        INSERT INTO public.tenants (nome) VALUES ('TENANT_DEMO') 
        ON CONFLICT DO NOTHING;
        SELECT id INTO v_tenant_id FROM public.tenants WHERE nome = 'TENANT_DEMO';
        
        -- Vincular usuário ao Tenant
        INSERT INTO public.user_tenants (user_id, tenant_id) VALUES (NEW.id, v_tenant_id)
        ON CONFLICT DO NOTHING;
        
        -- Criar/Recuperar Grupo DEMO
        INSERT INTO public.grupos_empresas (tenant_id, nome) VALUES (v_tenant_id, 'GRUPO_DEMO')
        ON CONFLICT DO NOTHING;
        SELECT id INTO v_grupo_id FROM public.grupos_empresas WHERE tenant_id = v_tenant_id AND nome = 'GRUPO_DEMO';
        
        -- Criar/Recuperar Empresa DEMO
        INSERT INTO public.empresas (grupo_id, nome) VALUES (v_grupo_id, 'EMPRESA_DEMO')
        ON CONFLICT DO NOTHING;
        SELECT id INTO v_empresa_id FROM public.empresas WHERE grupo_id = v_grupo_id AND nome = 'EMPRESA_DEMO';
        
        -- Vincular usuário à Empresa
        INSERT INTO public.user_empresas (user_id, empresa_id) VALUES (NEW.id, v_empresa_id)
        ON CONFLICT DO NOTHING;
    ELSE
        -- Lógica padrão para outros primeiros admins (cria um ambiente genérico)
        INSERT INTO public.tenants (nome) VALUES ('Meu Ambiente') RETURNING id INTO v_tenant_id;
        INSERT INTO public.user_tenants (user_id, tenant_id) VALUES (NEW.id, v_tenant_id);
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2. Garantir que o Trigger existe na tabela auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Bloco DO para corrigir o usuário se ele já existir (pois o trigger não roda no login)
DO $$
DECLARE
    v_user_id uuid;
    v_tenant_id uuid;
    v_grupo_id uuid;
    v_empresa_id uuid;
BEGIN
    -- Tentar encontrar o usuário na tabela auth.users
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'claudio_bezerra@hotmail.com';

    IF v_user_id IS NOT NULL THEN
        RAISE NOTICE 'Corrigindo usuário existente: %', v_user_id;

        -- 1. Garantir Profile
        INSERT INTO public.profiles (id, email, full_name)
        VALUES (v_user_id, 'claudio_bezerra@hotmail.com', 'Claudio Bezerra')
        ON CONFLICT (id) DO NOTHING;

        -- 2. Garantir Role Admin
        INSERT INTO public.user_roles (user_id, role)
        VALUES (v_user_id, 'admin')
        ON CONFLICT (user_id, role) DO NOTHING;

        -- 3. Criar/Recuperar Tenant DEMO
        SELECT id INTO v_tenant_id FROM public.tenants WHERE nome = 'TENANT_DEMO';
        IF v_tenant_id IS NULL THEN
            INSERT INTO public.tenants (nome) VALUES ('TENANT_DEMO') RETURNING id INTO v_tenant_id;
        END IF;

        -- 4. Vincular Tenant
        INSERT INTO public.user_tenants (user_id, tenant_id)
        VALUES (v_user_id, v_tenant_id)
        ON CONFLICT (user_id, tenant_id) DO NOTHING;

        -- 5. Criar/Recuperar Grupo
        SELECT id INTO v_grupo_id FROM public.grupos_empresas WHERE nome = 'GRUPO_DEMO' AND tenant_id = v_tenant_id;
        IF v_grupo_id IS NULL THEN
            INSERT INTO public.grupos_empresas (tenant_id, nome) VALUES (v_tenant_id, 'GRUPO_DEMO') RETURNING id INTO v_grupo_id;
        END IF;

        -- 6. Criar/Recuperar Empresa
        SELECT id INTO v_empresa_id FROM public.empresas WHERE nome = 'EMPRESA_DEMO' AND grupo_id = v_grupo_id;
        IF v_empresa_id IS NULL THEN
            INSERT INTO public.empresas (grupo_id, nome) VALUES (v_grupo_id, 'EMPRESA_DEMO') RETURNING id INTO v_empresa_id;
        END IF;

        -- 7. Vincular Empresa
        INSERT INTO public.user_empresas (user_id, empresa_id)
        VALUES (v_user_id, v_empresa_id)
        ON CONFLICT (user_id, empresa_id) DO NOTHING;
    END IF;
END $$;
