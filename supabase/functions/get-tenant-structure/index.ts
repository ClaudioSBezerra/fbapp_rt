import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GetTenantStructureRequest {
  tenantId: string;
}

interface Empresa {
  id: string;
  nome: string;
}

interface Grupo {
  id: string;
  nome: string;
  empresas: Empresa[];
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
    const body: GetTenantStructureRequest = await req.json();
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

    // Use service role to fetch tenant structure
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

    // Fetch grupos with their empresas
    const { data: grupos, error: gruposError } = await supabaseAdmin
      .from('grupos_empresas')
      .select('id, nome')
      .eq('tenant_id', tenantId)
      .order('nome');

    if (gruposError) {
      console.error('Error fetching grupos:', gruposError);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao buscar grupos do ambiente' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!grupos || grupos.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Este ambiente não possui grupos/empresas cadastrados. Contate o administrador.' 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch empresas for each grupo
    const grupoIds = grupos.map(g => g.id);
    const { data: empresas, error: empresasError } = await supabaseAdmin
      .from('empresas')
      .select('id, nome, grupo_id')
      .in('grupo_id', grupoIds)
      .order('nome');

    if (empresasError) {
      console.error('Error fetching empresas:', empresasError);
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao buscar empresas do ambiente' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build the structure with grupos and their empresas
    const gruposWithEmpresas: Grupo[] = grupos.map(grupo => ({
      id: grupo.id,
      nome: grupo.nome,
      empresas: (empresas || [])
        .filter(e => e.grupo_id === grupo.id)
        .map(e => ({ id: e.id, nome: e.nome }))
    }));

    console.log('Structure fetched successfully:', {
      tenant: tenant.nome,
      gruposCount: gruposWithEmpresas.length,
      empresasCount: empresas?.length || 0
    });

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenant.id,
        tenant_nome: tenant.nome,
        grupos: gruposWithEmpresas
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
