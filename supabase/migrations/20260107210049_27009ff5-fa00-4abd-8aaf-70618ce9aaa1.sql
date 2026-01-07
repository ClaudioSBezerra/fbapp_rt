-- Atualizar função handle_new_user para fazer o primeiro usuário ser admin automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  admin_exists boolean;
  new_role app_role;
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
  
  RETURN NEW;
END;
$$;