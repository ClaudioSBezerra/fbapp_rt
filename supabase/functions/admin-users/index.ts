
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    // Check if user is admin
    const { data: userRole } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (userRole?.role !== 'admin') {
      throw new Error('Forbidden: Admin access required')
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    )

    if (req.method === 'POST') {
      const { email, password, full_name, role, tenant_id, empresa_ids } = await req.json()
      
      if (!email || !password || !tenant_id) {
        throw new Error('Email, password and tenant_id are required')
      }

      // 1. Create user in Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name }
      })

      if (authError) throw authError
      const newUserId = authData.user.id

      try {
        // 2. Create profile
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .insert({
            id: newUserId,
            email,
            full_name
          })
        if (profileError) throw profileError

        // 3. Link to tenant
        const { error: tenantError } = await supabaseAdmin
          .from('user_tenants')
          .insert({
            user_id: newUserId,
            tenant_id
          })
        if (tenantError) throw tenantError

        // 4. Assign role
        const { error: roleError } = await supabaseAdmin
          .from('user_roles')
          .insert({
            user_id: newUserId,
            role: role || 'user'
          })
        if (roleError) throw roleError

        // 5. Link to empresas
        if (empresa_ids && empresa_ids.length > 0) {
          const links = empresa_ids.map((empresa_id: string) => ({
            user_id: newUserId,
            empresa_id
          }))
          const { error: empresasError } = await supabaseAdmin
            .from('user_empresas')
            .insert(links)
          if (empresasError) throw empresasError
        }

        return new Response(
          JSON.stringify({ message: 'User created successfully', user: authData.user }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

      } catch (error) {
        // Rollback: delete user if auxiliary data creation fails
        await supabaseAdmin.auth.admin.deleteUser(newUserId)
        throw error
      }
    }

    if (req.method === 'DELETE') {
       const { user_id } = await req.json()
       if (!user_id) throw new Error('user_id is required')

       // Manual Cascade Delete to ensure cleanup
       // 1. Delete user_empresas
       await supabaseAdmin.from('user_empresas').delete().eq('user_id', user_id)
       
       // 2. Delete user_tenants
       await supabaseAdmin.from('user_tenants').delete().eq('user_id', user_id)
       
       // 3. Delete user_roles
       await supabaseAdmin.from('user_roles').delete().eq('user_id', user_id)
       
       // 4. Delete profile (if exists)
       await supabaseAdmin.from('profiles').delete().eq('id', user_id)

       // 5. Delete user from Auth
       const { data, error } = await supabaseAdmin.auth.admin.deleteUser(user_id)
       
       if (error) throw error

       return new Response(
         JSON.stringify({ message: 'User deleted successfully', data }),
         { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
       )
    }

    // Optional: List users with pagination if needed beyond what RLS allows
    if (req.method === 'GET') {
      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers()
      if (error) throw error

      return new Response(
        JSON.stringify({ users }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    throw new Error('Method not allowed')

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
