import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface JoinTenantRequest {
  tenantId: string;
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
    const { tenantId } = body;

    if (!tenantId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Código do ambiente é obrigatório' }),
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

    // Check if user is already linked to this tenant
    const { data: existingLink, error: linkCheckError } = await supabaseAdmin
      .from('user_tenants')
      .select('id')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .single();

    if (existingLink) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Você já está vinculado a este ambiente',
          tenant_id: tenant.id,
          tenant_nome: tenant.nome
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Link user to tenant
    const { error: insertError } = await supabaseAdmin
      .from('user_tenants')
      .insert({
        user_id: user.id,
        tenant_id: tenantId
      });

    if (insertError) {
      console.error('Failed to link user to tenant:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao vincular ao ambiente' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User successfully linked to tenant');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Vinculado ao ambiente com sucesso!',
        tenant_id: tenant.id,
        tenant_nome: tenant.nome
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
