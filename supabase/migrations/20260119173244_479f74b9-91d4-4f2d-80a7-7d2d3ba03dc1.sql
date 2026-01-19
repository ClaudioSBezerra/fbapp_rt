-- =====================================================
-- SIMULAÇÃO GRÁTIS: Estrutura para contas demo
-- =====================================================

-- 1. Criar ENUM para tipos de conta
CREATE TYPE public.account_type AS ENUM ('standard', 'demo', 'paid');

-- 2. Adicionar coluna account_type na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN account_type public.account_type NOT NULL DEFAULT 'standard';

-- 3. Adicionar colunas de controle demo na tabela empresas
ALTER TABLE public.empresas 
ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN demo_owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. Adicionar coluna demo_trial_ends_at na tabela profiles
ALTER TABLE public.profiles
ADD COLUMN demo_trial_ends_at TIMESTAMP WITH TIME ZONE;

-- 5. Criar índices para consultas
CREATE INDEX idx_profiles_account_type ON public.profiles(account_type);
CREATE INDEX idx_empresas_demo ON public.empresas(is_demo, demo_owner_id);

-- 6. Criar função RPC para verificar limites de importação demo
CREATE OR REPLACE FUNCTION public.check_demo_import_limits(
  _empresa_id UUID,
  _file_type TEXT, -- 'contrib' ou 'icms'
  _mes_ano DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_demo BOOLEAN;
  v_contrib_count INT;
  v_icms_count INT;
BEGIN
  -- Verificar se é empresa demo
  SELECT is_demo INTO v_is_demo
  FROM empresas WHERE id = _empresa_id;
  
  -- Se não for demo, permitir sempre
  IF v_is_demo IS NULL OR NOT v_is_demo THEN
    RETURN jsonb_build_object('allowed', true, 'is_demo', false);
  END IF;
  
  -- Contar importações existentes para o período
  SELECT 
    COALESCE(SUM(CASE WHEN import_scope = 'all' THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN import_scope = 'icms_uso_consumo' THEN 1 ELSE 0 END), 0)
  INTO v_contrib_count, v_icms_count
  FROM import_jobs
  WHERE empresa_id = _empresa_id
    AND status = 'completed'
    AND mes_ano = _mes_ano;
  
  -- Verificar limites (1 EFD Contrib, 2 EFD ICMS por período)
  IF _file_type = 'contrib' AND v_contrib_count >= 1 THEN
    RETURN jsonb_build_object(
      'allowed', false, 
      'is_demo', true,
      'reason', 'Limite de 1 EFD Contribuições por período atingido',
      'current_count', v_contrib_count,
      'max_allowed', 1
    );
  ELSIF _file_type = 'icms' AND v_icms_count >= 2 THEN
    RETURN jsonb_build_object(
      'allowed', false, 
      'is_demo', true,
      'reason', 'Limite de 2 EFD ICMS/IPI por período atingido',
      'current_count', v_icms_count,
      'max_allowed', 2
    );
  END IF;
  
  RETURN jsonb_build_object(
    'allowed', true, 
    'is_demo', true,
    'contrib_count', v_contrib_count,
    'icms_count', v_icms_count
  );
END;
$$;

-- 7. Criar função RPC para obter status demo do usuário
CREATE OR REPLACE FUNCTION public.get_demo_status(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_type account_type;
  v_trial_ends_at TIMESTAMP WITH TIME ZONE;
  v_empresa_id UUID;
  v_import_stats JSONB;
BEGIN
  -- Buscar dados do profile
  SELECT account_type, demo_trial_ends_at 
  INTO v_account_type, v_trial_ends_at
  FROM profiles WHERE id = _user_id;
  
  -- Se não for demo, retornar simples
  IF v_account_type IS NULL OR v_account_type != 'demo' THEN
    RETURN jsonb_build_object(
      'is_demo', false,
      'account_type', COALESCE(v_account_type::text, 'standard')
    );
  END IF;
  
  -- Buscar empresa demo do usuário
  SELECT id INTO v_empresa_id
  FROM empresas
  WHERE demo_owner_id = _user_id AND is_demo = true
  LIMIT 1;
  
  -- Contar importações
  SELECT jsonb_build_object(
    'efd_contrib', COALESCE(SUM(CASE WHEN import_scope = 'all' AND status = 'completed' THEN 1 ELSE 0 END), 0),
    'efd_icms', COALESCE(SUM(CASE WHEN import_scope = 'icms_uso_consumo' AND status = 'completed' THEN 1 ELSE 0 END), 0)
  ) INTO v_import_stats
  FROM import_jobs
  WHERE empresa_id = v_empresa_id;
  
  RETURN jsonb_build_object(
    'is_demo', true,
    'account_type', 'demo',
    'trial_ends_at', v_trial_ends_at,
    'trial_expired', v_trial_ends_at < now(),
    'days_remaining', GREATEST(0, EXTRACT(DAY FROM v_trial_ends_at - now())::int),
    'empresa_id', v_empresa_id,
    'import_counts', COALESCE(v_import_stats, '{"efd_contrib": 0, "efd_icms": 0}'::jsonb),
    'limits', jsonb_build_object('efd_contrib', 1, 'efd_icms', 2)
  );
END;
$$;

-- 8. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.check_demo_import_limits(UUID, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_demo_status(UUID) TO authenticated;