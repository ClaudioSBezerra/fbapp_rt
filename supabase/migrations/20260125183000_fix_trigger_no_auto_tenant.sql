-- Redefine handle_new_user to NOT create automatic tenant for claudio_bezerra@hotmail.com
-- He should only be promoted to Admin, and then create the tenant manually via onboarding.

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  admin_exists boolean;
  new_role app_role;
  is_target_user boolean;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name');
  
  -- Check if it is the target user
  is_target_user := (NEW.email = 'claudio_bezerra@hotmail.com');

  -- Check if any admin exists
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'
  ) INTO admin_exists;
  
  -- Promote to admin if first admin OR target user
  IF NOT admin_exists OR is_target_user THEN
    new_role := 'admin';
  ELSE
    new_role := 'user';
  END IF;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, new_role);
  
  -- NO AUTOMATIC TENANT CREATION for target user.
  -- He will create it via onboarding flow.
  
  RETURN NEW;
END;
$$;

-- Cleanup existing data for claudio_bezerra@hotmail.com to reset him to "No Tenant" state
DO $$
DECLARE
    v_user_id uuid;
    v_tenant_id uuid;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'claudio_bezerra@hotmail.com';

    IF v_user_id IS NOT NULL THEN
        -- Remove from user_tenants
        DELETE FROM public.user_tenants WHERE user_id = v_user_id;
        
        -- Also clean up any 'TENANT_DEMO' created by the previous trigger if it has no other users
        -- Find TENANT_DEMO id
        SELECT id INTO v_tenant_id FROM public.tenants WHERE nome = 'TENANT_DEMO';
        
        IF v_tenant_id IS NOT NULL THEN
             -- Check if other users exist
             IF NOT EXISTS (SELECT 1 FROM public.user_tenants WHERE tenant_id = v_tenant_id) THEN
                 -- Delete related data (cascade should handle it, but being explicit is safer if no cascade)
                 DELETE FROM public.user_empresas WHERE empresa_id IN (
                     SELECT id FROM public.empresas WHERE grupo_id IN (
                         SELECT id FROM public.grupos_empresas WHERE tenant_id = v_tenant_id
                     )
                 );
                 DELETE FROM public.grupos_empresas WHERE tenant_id = v_tenant_id;
                 DELETE FROM public.tenants WHERE id = v_tenant_id;
             END IF;
        END IF;
        
        -- Ensure he is admin
        UPDATE public.user_roles SET role = 'admin' WHERE user_id = v_user_id;
        INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'admin') ON CONFLICT (user_id) DO NOTHING;
    END IF;
END $$;
