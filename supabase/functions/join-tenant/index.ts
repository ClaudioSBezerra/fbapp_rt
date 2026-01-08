import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface JoinTenantRequest {
  tenantId: string;
  empresaId: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header');
      return new Response(
        JSON.stringify({ success: false, error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's auth
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error('User verification failed:', userError);
      return new Response(
        JSON.stringify({ success: false, error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User authenticated:', user.id);

    // Parse request body
    const body: JoinTenantRequest = await req.json();
    const { tenantId, empresaId } = body;

    if (!tenantId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Código do ambiente é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!empresaId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Seleção de empresa é obrigatória' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(tenantId)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Código do ambiente inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!uuidRegex.test(empresaId)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Empresa selecionada inválida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role to perform operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if tenant exists
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('id, nome')
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      console.error('Tenant not found:', tenantError);
      return new Response(
        JSON.stringify({ success: false, error: 'Ambiente não encontrado. Verifique o código informado.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Tenant found:', tenant.nome);

    // Verify empresa belongs to this tenant (through grupo)
    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from('empresas')
      .select(`
        id, 
        nome,
        grupo_id,
        grupos_empresas!inner (
          tenant_id
        )
      `)
      .eq('id', empresaId)
      .single();

    if (empresaError || !empresa) {
      console.error('Empresa not found:', empresaError);
      return new Response(
        JSON.stringify({ success: false, error: 'Empresa não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if empresa belongs to the specified tenant
    const grupoEmpresas = empresa.grupos_empresas as unknown as { tenant_id: string };
    if (grupoEmpresas.tenant_id !== tenantId) {
      console.error('Empresa does not belong to tenant');
      return new Response(
        JSON.stringify({ success: false, error: 'Empresa não pertence a este ambiente' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Empresa verified:', empresa.nome);

    // Check if user is already linked to this tenant
    const { data: existingTenantLink } = await supabaseAdmin
      .from('user_tenants')
      .select('id')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single();

    // Insert user_tenants if not already linked
    if (!existingTenantLink) {
      const { error: insertTenantError } = await supabaseAdmin
        .from('user_tenants')
        .insert({
          user_id: user.id,
          tenant_id: tenantId
        });

      if (insertTenantError) {
        console.error('Failed to link user to tenant:', insertTenantError);
        return new Response(
          JSON.stringify({ success: false, error: 'Erro ao vincular ao ambiente' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log('User linked to tenant');
    }

    // Create user_empresas link for non-admin users
    // Check if user_empresas link already exists
    const { data: existingEmpresaLink } = await supabaseAdmin
      .from('user_empresas')
      .select('id')
      .eq('user_id', user.id)
      .eq('empresa_id', empresaId)
      .single();

    // Insert user_empresas if not already linked
    if (!existingEmpresaLink) {
      const { error: insertEmpresaError } = await supabaseAdmin
        .from('user_empresas')
        .insert({
          user_id: user.id,
          empresa_id: empresaId
        });

      if (insertEmpresaError) {
        console.error('Failed to link user to empresa:', insertEmpresaError);
        return new Response(
          JSON.stringify({ success: false, error: 'Erro ao vincular à empresa' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log('User linked to empresa:', empresaId);
    }

    console.log('User successfully linked to tenant and empresa:', empresa.nome);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Vinculado ao ambiente com sucesso!',
        tenant_id: tenant.id,
        tenant_nome: tenant.nome,
        empresa_id: empresa.id,
        empresa_nome: empresa.nome
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
