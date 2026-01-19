-- Criar enum para status de assinatura
CREATE TYPE public.subscription_status AS ENUM (
  'trial',
  'active', 
  'past_due',
  'cancelled',
  'expired'
);

-- Adicionar campos de assinatura na tabela tenants
ALTER TABLE public.tenants
ADD COLUMN trial_started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
ADD COLUMN trial_ends_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + INTERVAL '14 days'),
ADD COLUMN subscription_status public.subscription_status DEFAULT 'trial',
ADD COLUMN stripe_customer_id TEXT,
ADD COLUMN stripe_subscription_id TEXT;

-- Criar tabela de planos de assinatura
CREATE TABLE public.subscription_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  stripe_price_id TEXT,
  price_monthly NUMERIC NOT NULL DEFAULT 0,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Todos podem ver planos ativos
CREATE POLICY "Anyone can view active plans"
ON public.subscription_plans
FOR SELECT
USING (is_active = true);

-- Apenas admins podem gerenciar planos
CREATE POLICY "Admins can manage plans"
ON public.subscription_plans
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Criar função para verificar status da assinatura do tenant
CREATE OR REPLACE FUNCTION public.get_tenant_subscription_info(p_user_id UUID)
RETURNS TABLE (
  tenant_id UUID,
  tenant_nome TEXT,
  subscription_status public.subscription_status,
  trial_started_at TIMESTAMP WITH TIME ZONE,
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  trial_days_left INTEGER,
  is_expired BOOLEAN,
  can_write BOOLEAN
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id as tenant_id,
    t.nome as tenant_nome,
    t.subscription_status,
    t.trial_started_at,
    t.trial_ends_at,
    GREATEST(0, EXTRACT(DAY FROM (t.trial_ends_at - now()))::INTEGER) as trial_days_left,
    CASE 
      WHEN t.subscription_status = 'expired' THEN true
      WHEN t.subscription_status = 'trial' AND t.trial_ends_at < now() THEN true
      ELSE false
    END as is_expired,
    CASE 
      WHEN t.subscription_status IN ('trial', 'active') THEN
        CASE 
          WHEN t.subscription_status = 'trial' AND t.trial_ends_at < now() THEN false
          ELSE true
        END
      ELSE false
    END as can_write
  FROM tenants t
  INNER JOIN user_tenants ut ON ut.tenant_id = t.id
  WHERE ut.user_id = p_user_id
  LIMIT 1;
END;
$$;

-- Criar trigger para atualizar trial_ends_at automaticamente quando trial_started_at é definido
CREATE OR REPLACE FUNCTION public.set_trial_end_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.trial_started_at IS NOT NULL AND NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := NEW.trial_started_at + INTERVAL '14 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_trial_end_date_trigger
BEFORE INSERT OR UPDATE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.set_trial_end_date();

-- Atualizar tenants existentes para terem trial de 14 dias a partir de agora
UPDATE public.tenants 
SET 
  trial_started_at = created_at,
  trial_ends_at = created_at + INTERVAL '14 days',
  subscription_status = 'trial'
WHERE trial_started_at IS NULL;