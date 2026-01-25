-- 0. Add subscription_status to tenants if not exists
ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'active';

-- 0.1 Add unique constraints to user_roles and user_tenants if they don't exist
DO $$
BEGIN
    -- user_roles
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_user_id_key') THEN
        -- Cleanup duplicates (keep latest)
        DELETE FROM public.user_roles a USING public.user_roles b WHERE a.id < b.id AND a.user_id = b.user_id;
        ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);
    END IF;

    -- user_tenants
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_tenants_user_id_tenant_id_key') THEN
        -- Cleanup duplicates
        DELETE FROM public.user_tenants a USING public.user_tenants b WHERE a.id < b.id AND a.user_id = b.user_id AND a.tenant_id = b.tenant_id;
        ALTER TABLE public.user_tenants ADD CONSTRAINT user_tenants_user_id_tenant_id_key UNIQUE (user_id, tenant_id);
    END IF;
END $$;

-- 1. Ensure AMB_DEMO exists with Fixed ID (Rename/Create)
INSERT INTO public.tenants (id, nome, subscription_status)
VALUES ('11111111-1111-1111-1111-111111111111', 'AMB_DEMO', 'active')
ON CONFLICT (id) DO UPDATE SET nome = 'AMB_DEMO', subscription_status = 'active';

-- 2. Ensure AMB_DEMO_GRUPO exists with Fixed ID
INSERT INTO public.grupos_empresas (id, tenant_id, nome)
VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'AMB_DEMO_GRUPO')
ON CONFLICT (id) DO UPDATE SET nome = 'AMB_DEMO_GRUPO';

-- 3. Create AMB_PRD Tenant
INSERT INTO public.tenants (nome, subscription_status)
SELECT 'AMB_PRD', 'active'
WHERE NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE nome = 'AMB_PRD'
);

-- 4. Add recovery fields to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS recovery_city TEXT,
ADD COLUMN IF NOT EXISTS recovery_dob DATE;

-- 5. Helper function to get user ID by email (needed for Edge Functions)
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(user_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (SELECT id FROM auth.users WHERE email = user_email);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO authenticated, service_role;

-- 6. Ensure claudio_bezerra@hotmail.com is admin
CREATE OR REPLACE FUNCTION promote_admin_by_email(admin_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_user_id UUID;
  amb_demo_id UUID := '11111111-1111-1111-1111-111111111111';
  amb_prd_id UUID;
BEGIN
  SELECT id INTO target_user_id FROM auth.users WHERE email = admin_email;
  SELECT id INTO amb_prd_id FROM public.tenants WHERE nome = 'AMB_PRD';

  IF target_user_id IS NOT NULL THEN
    -- Update/Insert into user_roles
    INSERT INTO public.user_roles (user_id, role)
    VALUES (target_user_id, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

    -- Link to AMB_DEMO
    INSERT INTO public.user_tenants (user_id, tenant_id)
    VALUES (target_user_id, amb_demo_id)
    ON CONFLICT (user_id, tenant_id) DO NOTHING;

    -- Link to AMB_PRD
    IF amb_prd_id IS NOT NULL THEN
      INSERT INTO public.user_tenants (user_id, tenant_id)
      VALUES (target_user_id, amb_prd_id)
      ON CONFLICT (user_id, tenant_id) DO NOTHING;
    END IF;
  END IF;
END;
$$;

SELECT promote_admin_by_email('claudio_bezerra@hotmail.com');
