-- ================================================
-- CONFIGURAR USUÁRIO claudio_bezerra@hotmail.com
-- ================================================

-- 1. Criar Tenant Demo
INSERT INTO tenants (id, nome, subscription_status, trial_started_at, trial_ends_at)
VALUES (
  '11111111-1111-1111-1111-111111111111', 
  'Tenant Demo',
  'trial',
  now(),
  now() + interval '14 days'
);

-- 2. Criar Grupo Demo
INSERT INTO grupos_empresas (id, tenant_id, nome)
VALUES (
  '22222222-2222-2222-2222-222222222222', 
  '11111111-1111-1111-1111-111111111111', 
  'Grupo Demo'
);

-- 3. Criar Empresa Demo
INSERT INTO empresas (id, grupo_id, nome, is_demo)
VALUES (
  '33333333-3333-3333-3333-333333333333', 
  '22222222-2222-2222-2222-222222222222', 
  'Empresa Demo',
  true
);

-- 4. Criar Profile do usuário
INSERT INTO profiles (id, email, full_name, account_type)
VALUES (
  '7ca229cb-02c5-4dc9-9235-8533aa3fb887', 
  'claudio_bezerra@hotmail.com', 
  'Claudio Bezerra',
  'demo'
);

-- 5. Vincular usuário ao tenant
INSERT INTO user_tenants (user_id, tenant_id)
VALUES (
  '7ca229cb-02c5-4dc9-9235-8533aa3fb887', 
  '11111111-1111-1111-1111-111111111111'
);

-- 6. Vincular usuário à empresa
INSERT INTO user_empresas (user_id, empresa_id)
VALUES (
  '7ca229cb-02c5-4dc9-9235-8533aa3fb887', 
  '33333333-3333-3333-3333-333333333333'
);

-- 7. Atribuir role de admin
INSERT INTO user_roles (user_id, role)
VALUES (
  '7ca229cb-02c5-4dc9-9235-8533aa3fb887', 
  'admin'
);