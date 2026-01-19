-- Limpar planos existentes e inserir novos
DELETE FROM subscription_plans;

INSERT INTO subscription_plans (name, price_monthly, stripe_price_id, features, is_active)
VALUES 
  (
    'Profissional',
    1000,
    'price_1SrHHxIxxX0LNvvtwcduGIzN',
    '["Até 5 empresas", "Importação ilimitada de arquivos EFD", "Dashboards completos", "Exportação para Excel", "Suporte por email"]'::jsonb,
    true
  ),
  (
    'Empresarial',
    5000,
    'price_1SrHIAIxxX0LNvvtEyEe98sk',
    '["Empresas ilimitadas", "Importação ilimitada de arquivos EFD", "Dashboards completos", "Exportação para Excel", "Múltiplos usuários", "Suporte prioritário", "Relatórios personalizados"]'::jsonb,
    true
  );