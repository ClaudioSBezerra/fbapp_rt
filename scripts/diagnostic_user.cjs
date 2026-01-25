
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file in project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function diagnosticUser(email) {
  console.log(`Diagnostic for user: ${email}`);

  // 1. Get User ID
  const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) {
    console.error('Error listing users:', userError);
    return;
  }

  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    console.error(`User with email ${email} not found.`);
    console.log('Available users:', users.map(u => u.email));
    return;
  }

  console.log(`User ID: ${user.id}`);
  const userId = user.id;

  // 2. Check User Roles
  const { data: roles, error: roleError } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', userId);

  if (roleError) console.error('Error fetching roles:', roleError);
  console.log('User Roles:', roles);

  // 3. Check User Tenants
  const { data: tenants, error: tenantError } = await supabase
    .from('user_tenants')
    .select('*, tenants(*)')
    .eq('user_id', userId);

  if (tenantError) console.error('Error fetching tenants:', tenantError);
  console.log('User Tenants:', JSON.stringify(tenants, null, 2));

  // 4. Check User Empresas (Direct Links)
  const { data: userEmpresas, error: ueError } = await supabase
    .from('user_empresas')
    .select('*, empresas(id, nome, grupo_id, grupos_empresas(id, nome, tenant_id))')
    .eq('user_id', userId);

  if (ueError) console.error('Error fetching user_empresas:', ueError);
  console.log('User Empresas (Direct Links):', JSON.stringify(userEmpresas, null, 2));

  // 5. Check what should be visible via Tenant
  if (tenants && tenants.length > 0) {
    for (const t of tenants) {
      console.log(`\nChecking structure for Tenant: ${t.tenants?.nome} (${t.tenant_id})`);
      
      const { data: grupos, error: gError } = await supabase
        .from('grupos_empresas')
        .select('id, nome')
        .eq('tenant_id', t.tenant_id);
        
      if (gError) console.error('Error fetching groups:', gError);
      console.log(`  Groups (${grupos?.length || 0}):`, grupos);

      if (grupos) {
        for (const g of grupos) {
          const { data: empresas, error: eError } = await supabase
            .from('empresas')
            .select('id, nome')
            .eq('grupo_id', g.id);
            
          if (eError) console.error('Error fetching empresas:', eError);
          console.log(`    Empresas in ${g.nome} (${empresas?.length || 0}):`, empresas);
          
          if (empresas) {
             for (const e of empresas) {
                const { data: filiais, error: fError } = await supabase
                  .from('filiais')
                  .select('id, cnpj, razao_social')
                  .eq('empresa_id', e.id);
                 if (fError) console.error('Error fetching filiais:', fError);
                 console.log(`      Filiais in ${e.nome} (${filiais?.length || 0}):`, filiais?.map(f => `${f.cnpj} - ${f.razao_social}`));
             }
          }
        }
      }
    }
  }
}

const targetEmail = process.argv[2] || 'claudio_bezerra@hotmail.com';
diagnosticUser(targetEmail);
