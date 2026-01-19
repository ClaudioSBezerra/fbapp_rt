-- Fix: Function search_path mutable
CREATE OR REPLACE FUNCTION public.normalize_participante_cnpj()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.cnpj_normalizado := REGEXP_REPLACE(COALESCE(NEW.cnpj, ''), '[^0-9]', '', 'g');
  RETURN NEW;
END;
$$;

-- Fix: RLS enabled no policy (password_reset_tokens)
-- Ensure RLS is enabled
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Create minimal safe policies for authenticated users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='password_reset_tokens' AND policyname='Users can view own reset tokens'
  ) THEN
    CREATE POLICY "Users can view own reset tokens"
    ON public.password_reset_tokens
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='password_reset_tokens' AND policyname='Users can create own reset tokens'
  ) THEN
    CREATE POLICY "Users can create own reset tokens"
    ON public.password_reset_tokens
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='password_reset_tokens' AND policyname='Users can update own reset tokens'
  ) THEN
    CREATE POLICY "Users can update own reset tokens"
    ON public.password_reset_tokens
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;