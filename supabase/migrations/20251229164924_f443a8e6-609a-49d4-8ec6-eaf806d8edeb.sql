-- Política para permitir usuários autenticados criarem novos tenants
CREATE POLICY "Authenticated users can create tenants"
ON public.tenants
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Política para permitir usuários vincularem-se a tenants (apenas seu próprio user_id)
CREATE POLICY "Users can link themselves to tenants"
ON public.user_tenants
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Política para permitir usuários atualizarem tenants aos quais estão vinculados
CREATE POLICY "Users can update their tenants"
ON public.tenants
FOR UPDATE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM user_tenants
  WHERE user_tenants.tenant_id = tenants.id
  AND user_tenants.user_id = auth.uid()
));