-- Adicionar política para admins verem todos os perfis de usuários do mesmo tenant
CREATE POLICY "Admins can view all profiles in tenant" 
ON public.profiles 
FOR SELECT 
TO authenticated 
USING (
  -- Verifica se o usuário logado é admin
  public.has_role(auth.uid(), 'admin'::app_role) 
  AND 
  -- E se o perfil pertence ao mesmo tenant
  id IN (
    SELECT ut2.user_id 
    FROM public.user_tenants ut1
    JOIN public.user_tenants ut2 ON ut1.tenant_id = ut2.tenant_id
    WHERE ut1.user_id = auth.uid()
  )
);