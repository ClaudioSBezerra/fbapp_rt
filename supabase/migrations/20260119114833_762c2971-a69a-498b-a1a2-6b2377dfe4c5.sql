-- Adicionar política para usuários não autenticados verem planos ativos
CREATE POLICY "Public can view active plans"
ON public.subscription_plans
FOR SELECT
TO anon
USING (is_active = true);