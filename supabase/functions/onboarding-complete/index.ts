import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface OnboardingRequest {
  tenantNome: string
  grupoNome: string
  empresaNome: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.error('No authorization header provided')
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with the user's JWT
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // First, verify the user's JWT using anon key
    const supabaseAnon = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: { headers: { Authorization: authHeader } }
      }
    )

    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser()
    
    if (userError || !user) {
      console.error('User authentication failed:', userError?.message)
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token', details: userError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('User authenticated:', user.id)

    // Use service role client for all database operations (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Ensure user has admin role (since they are creating a new tenant)
    console.log('Promoting user to admin:', user.id)
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .upsert({ user_id: user.id, role: 'admin' }, { onConflict: 'user_id' })

    if (roleError) {
      console.error('Error promoting user to admin:', roleError)
      return new Response(
        JSON.stringify({ error: 'Erro ao atribuir permissões de administrador' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('User promoted to admin, proceeding with onboarding')

    // Parse request body
    const body: OnboardingRequest = await req.json()
    const { tenantNome, grupoNome, empresaNome } = body

    // Validate input
    if (!tenantNome || tenantNome.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: 'Nome do ambiente deve ter pelo menos 2 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!grupoNome || grupoNome.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: 'Nome do grupo deve ter pelo menos 2 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!empresaNome || empresaNome.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: 'Nome da empresa deve ter pelo menos 2 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Step 1: Create Tenant
    console.log('Creating tenant:', tenantNome)
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .insert({ nome: tenantNome.trim() })
      .select()
      .single()

    if (tenantError) {
      console.error('Error creating tenant:', tenantError)
      return new Response(
        JSON.stringify({ 
          error: 'Erro ao criar ambiente', 
          details: tenantError.message,
          code: tenantError.code 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Tenant created:', tenant.id)

    // Step 2: Link user to tenant
    console.log('Linking user to tenant:', user.id, tenant.id)
    const { error: linkError } = await supabaseAdmin
      .from('user_tenants')
      .insert({ user_id: user.id, tenant_id: tenant.id })

    if (linkError) {
      console.error('Error linking user to tenant:', linkError)
      // Rollback: delete tenant
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id)
      return new Response(
        JSON.stringify({ 
          error: 'Erro ao vincular usuário ao ambiente', 
          details: linkError.message,
          code: linkError.code 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('User linked to tenant')

    // Step 3: Create Grupo de Empresas
    console.log('Creating grupo:', grupoNome)
    const { data: grupo, error: grupoError } = await supabaseAdmin
      .from('grupos_empresas')
      .insert({ tenant_id: tenant.id, nome: grupoNome.trim() })
      .select()
      .single()

    if (grupoError) {
      console.error('Error creating grupo:', grupoError)
      // Rollback: delete user_tenant and tenant
      await supabaseAdmin.from('user_tenants').delete().eq('tenant_id', tenant.id)
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id)
      return new Response(
        JSON.stringify({ 
          error: 'Erro ao criar grupo de empresas', 
          details: grupoError.message,
          code: grupoError.code 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Grupo created:', grupo.id)

    // Step 4: Create Empresa
    console.log('Creating empresa:', empresaNome)
    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from('empresas')
      .insert({ grupo_id: grupo.id, nome: empresaNome.trim() })
      .select()
      .single()

    if (empresaError) {
      console.error('Error creating empresa:', empresaError)
      // Rollback: delete grupo, user_tenant and tenant
      await supabaseAdmin.from('grupos_empresas').delete().eq('id', grupo.id)
      await supabaseAdmin.from('user_tenants').delete().eq('tenant_id', tenant.id)
      await supabaseAdmin.from('tenants').delete().eq('id', tenant.id)
      return new Response(
        JSON.stringify({ 
          error: 'Erro ao criar empresa', 
          details: empresaError.message,
          code: empresaError.code 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Empresa created:', empresa.id)
    console.log('Onboarding completed successfully!')

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenant.id,
        grupo_id: grupo.id,
        empresa_id: empresa.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Erro inesperado no servidor', 
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
