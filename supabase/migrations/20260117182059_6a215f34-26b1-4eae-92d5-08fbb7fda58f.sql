-- 1. Criar o trigger on_auth_user_created que está faltando
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 2. Corrigir o usuário existente sem role
INSERT INTO public.user_roles (user_id, role)
VALUES ('180276e0-c0fe-4544-a1bf-452f67a2c58d', 'user')
ON CONFLICT (user_id, role) DO NOTHING;