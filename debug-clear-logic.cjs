const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function debugClearLogic() {
  const userId = 'a0681926-1290-46ca-bb1d-5ed747731da1';
  console.log(`Starting debug logic for user ${userId}`);

    // Verificar se usuário é admin
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    const isAdmin = userRole?.role === 'admin';
    console.log(`User role: ${userRole?.role}, isAdmin: ${isAdmin}`);

    // Buscar tenant do usuário
    const { data: userTenants } = await supabaseAdmin
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', userId);

    if (!userTenants || userTenants.length === 0) {
      console.log("No tenants found for user");
      return;
    }

    const tenantIds = userTenants.map(t => t.tenant_id);
    console.log(`Found ${tenantIds.length} tenants:`, tenantIds);

    // Buscar grupos
    const { data: grupos } = await supabaseAdmin
      .from('grupos_empresas')
      .select('id')
      .in('tenant_id', tenantIds);

    if (!grupos || grupos.length === 0) {
      console.log("No groups found");
      return;
    }

    const grupoIds = grupos.map(g => g.id);
    console.log(`Found ${grupoIds.length} groups:`, grupoIds);

    let empresaIds;

    if (isAdmin) {
      // Admin pode limpar todas as empresas do tenant
      const { data: empresas } = await supabaseAdmin
        .from('empresas')
        .select('id')
        .in('grupo_id', grupoIds);

      if (!empresas || empresas.length === 0) {
        console.log("No companies found");
        return;
      }

      empresaIds = empresas.map(e => e.id);
      console.log(`Admin: Found ${empresaIds.length} companies to clear`);
    } else {
      // Usuário comum só pode limpar empresas vinculadas
      const { data: userEmpresas } = await supabaseAdmin
        .from('user_empresas')
        .select('empresa_id')
        .eq('user_id', userId);

      if (!userEmpresas || userEmpresas.length === 0) {
        console.log("No linked companies found for user");
        // return; // Don't return here to see if maybe this is the issue
      }

      empresaIds = userEmpresas ? userEmpresas.map(ue => ue.empresa_id) : [];
      console.log(`User: Found ${empresaIds.length} linked companies to clear`);
    }

    console.log(`Found ${empresaIds.length} companies:`, empresaIds);

    if (empresaIds.length === 0) return;

    // Buscar filiais
    const { data: filiais } = await supabaseAdmin
      .from('filiais')
      .select('id, cod_est')
      .in('empresa_id', empresaIds);

    const filialIds = filiais?.map(f => f.id) || [];
    console.log(`Found ${filialIds.length} branches:`, filiais?.map(f => f.cod_est));

}

debugClearLogic();
