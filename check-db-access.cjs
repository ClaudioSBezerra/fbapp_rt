
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAccess() {
  const userId = 'a0681926-1290-46ca-bb1d-5ed747731da1';
  const filialId = '0a76e9a2-d82c-43c2-9009-6a81d2392839'; // Filial from the failed job

  console.log(`Checking access for user ${userId} to filial ${filialId}...`);

  // 1. Check has_filial_access function directly via RPC if possible (requires exposing it or using a wrapper)
  // Since has_filial_access is a database function, we can call it via rpc if it's exposed, or run a query.
  // However, has_filial_access takes (uuid, uuid) and returns boolean.
  // We can try to simulate the query it does.

  // Query:
  /*
    SELECT EXISTS (
        SELECT 1 FROM public.filiais f
        JOIN public.empresas e ON e.id = f.empresa_id
        JOIN public.grupos_empresas g ON g.id = e.grupo_id
        JOIN public.user_tenants ut ON ut.tenant_id = g.tenant_id
        WHERE f.id = _filial_id 
          AND ut.user_id = _user_id
          AND has_empresa_access(_user_id, e.id)
    )
  */

  // Let's break it down.
  
  // 1. Check User Tenant
  const { data: userTenants, error: utError } = await supabase
    .from('user_tenants')
    .select('*')
    .eq('user_id', userId);
    
  console.log('User Tenants:', userTenants);
  if (utError) console.error('Error fetching user_tenants:', utError);

  // 2. Check Filial -> Empresa -> Grupo -> Tenant
  const { data: filialInfo, error: fError } = await supabase
    .from('filiais')
    .select(`
      id, 
      empresa_id,
      empresas (
        id,
        grupo_id,
        grupos_empresas (
          id,
          tenant_id
        )
      )
    `)
    .eq('id', filialId)
    .single();

  console.log('Filial Info:', JSON.stringify(filialInfo, null, 2));
  if (fError) console.error('Error fetching filial info:', fError);

  if (filialInfo && userTenants) {
    const tenantId = filialInfo.empresas.grupos_empresas.tenant_id;
    const hasTenantAccess = userTenants.some(ut => ut.tenant_id === tenantId);
    console.log(`User has access to tenant ${tenantId}? ${hasTenantAccess}`);
    
    // 3. Check has_empresa_access (if applicable)
    // Assuming has_empresa_access checks user_empresas
    const { data: userEmpresas, error: ueError } = await supabase
      .from('user_empresas')
      .select('*')
      .eq('user_id', userId)
      .eq('empresa_id', filialInfo.empresa_id);

    console.log('User Empresas Link:', userEmpresas);
    const hasEmpresaLink = userEmpresas && userEmpresas.length > 0;
    console.log(`User has explicit link to empresa ${filialInfo.empresa_id}? ${hasEmpresaLink}`);

    // Check if user is admin (might bypass empresa check if logic allows, but SQL said AND has_empresa_access)
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
      
    console.log('User Roles:', userRoles);
  }
}

checkAccess();
