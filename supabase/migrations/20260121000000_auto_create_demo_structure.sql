-- Atualiza a função handle_new_user para criar estrutura DEMO para o primeiro usuário
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
BEGIN
  -- Criar profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name');
  
  -- Verificar se existe algum admin no sistema
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'
  ) INTO admin_exists;
  
  -- Se não houver admin, primeiro usuário vira admin
  IF admin_exists THEN
    new_role := 'user';
  ELSE
    new_role := 'admin';
  END IF;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, new_role);
  
  -- Se for o primeiro usuário (Admin), criar estrutura DEMO automaticamente
  IF new_role = 'admin' THEN
    -- Criar Tenant DEMO
    INSERT INTO public.tenants (nome)
    VALUES ('TENANT_DEMO')
    RETURNING id INTO v_tenant_id;
    
    -- Vincular usuário ao Tenant
    INSERT INTO public.user_tenants (user_id, tenant_id)
    VALUES (NEW.id, v_tenant_id);
    
    -- Criar Grupo DEMO
    INSERT INTO public.grupos_empresas (tenant_id, nome)
    VALUES (v_tenant_id, 'GRUPO_DEMO')
    RETURNING id INTO v_grupo_id;
    
    -- Criar Empresa DEMO
    INSERT INTO public.empresas (grupo_id, nome)
    VALUES (v_grupo_id, 'EMPRESA_DEMO')
    RETURNING id INTO v_empresa_id;
    
    -- Vincular usuário à Empresa
    INSERT INTO public.user_empresas (user_id, empresa_id)
    VALUES (NEW.id, v_empresa_id);
    
  END IF;
  
  RETURN NEW;
END;
$$;
