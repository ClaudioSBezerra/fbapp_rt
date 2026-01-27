
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
    // Verify user is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing Authorization header')
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      console.error('Auth error:', userError)
      throw new Error('Unauthorized: ' + (userError?.message || 'Invalid token'))
    }

    // Check if user is admin
    const { data: userRole, error: roleCheckError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if (roleCheckError && roleCheckError.code !== 'PGRST116') {
        console.error('Role check error:', roleCheckError)
        throw new Error('Error checking admin privileges')
    }

    if (userRole?.role !== 'admin') {
      console.error('User is not admin:', user.id, userRole)
      throw new Error('Forbidden: Admin access required')
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    if (req.method === 'POST') {
      let body;
      try {
        body = await req.json()
      } catch (e) {
        throw new Error('Invalid JSON body')
      }

      const { email, password, full_name, role, tenant_id, empresa_ids, recovery_city, recovery_dob } = body

      if (!email || !password || !tenant_id) {
        throw new Error('Email, password and tenant_id are required')
      }

      console.log(`Creating user ${email} with role ${role} for tenant ${tenant_id}`)

      // 1. Create user in Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name }
      })

      if (authError) {
        console.error('Auth create error:', authError)
        throw authError
      }
      const newUserId = authData.user.id
      console.log(`User created in Auth: ${newUserId}`)

      try {
        // 2. Create or update profile (trigger might have created it)
        const { error: profileError } = await supabaseAdmin
          .from('profiles')
          .upsert({
            id: newUserId,
            email,
            full_name,
            recovery_city,
            recovery_dob
          })
        if (profileError) {
            console.error('Profile upsert error:', profileError)
            throw profileError
        }

        // 3. Link to tenant
        const { error: tenantError } = await supabaseAdmin
          .from('user_tenants')
          .upsert({
            user_id: newUserId,
            tenant_id
          })
        if (tenantError) {
            console.error('Tenant link error:', tenantError)
            throw tenantError
        }

        // 4. Assign role
        const { error: roleError } = await supabaseAdmin
          .from('user_roles')
          .upsert({
             user_id: newUserId,
             role: role || 'user'
          }, { onConflict: 'user_id' })
        
        if (roleError) {
            console.error('Role assign error:', roleError)
            throw roleError
        }

        // 5. Link to empresas
        if (empresa_ids && Array.isArray(empresa_ids) && empresa_ids.length > 0) {
          const links = empresa_ids.map((empresa_id: string) => ({
            user_id: newUserId,
            empresa_id
          }))
          const { error: empresasError } = await supabaseAdmin
            .from('user_empresas')
            .insert(links)
          if (empresasError) {
             console.error('Empresas link error:', empresasError)
             throw empresasError
          }
        }

        return new Response(
          JSON.stringify({ message: 'User created successfully', user: authData.user }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

      } catch (error) {
        console.error('Rollback triggered due to:', error)
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
      const url = new URL(req.url)
      const tenant_id = url.searchParams.get('tenant_id')
      
      if (!tenant_id) {
        // Fallback to listing all users if no tenant_id provided (or error?)
        // For admin panel, we usually want tenant specific.
        // But let's keep original behavior if param missing, or throw?
        // Original behavior was listUsers() which returns everything.
        // Let's keep it restricted.
        throw new Error('tenant_id is required')
      }

      // 1. Fetch users in tenant
      const { data: userTenants, error: utError } = await supabaseAdmin
        .from('user_tenants')
        .select('user_id')
        .eq('tenant_id', tenant_id)
      
      if (utError) throw utError
      
      const userIds = userTenants.map((ut: any) => ut.user_id)
      
      if (userIds.length === 0) {
         return new Response(JSON.stringify({ users: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // 2. Fetch profiles
      const { data: profiles, error: pError } = await supabaseAdmin
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds)
      if (pError) throw pError

      // 3. Fetch roles
      const { data: roles, error: rError } = await supabaseAdmin
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', userIds)
      if (rError) throw rError

      // 4. Fetch user_empresas
      const { data: userEmpresas, error: ueError } = await supabaseAdmin
        .from('user_empresas')
        .select('user_id, empresa_id')
        .in('user_id', userIds)
      if (ueError) throw ueError

      // 5. Combine data
      const combinedUsers = profiles.map((p: any) => {
          const r = roles.find((r: any) => r.user_id === p.id)
          const ue = userEmpresas.filter((ue: any) => ue.user_id === p.id)
          return {
              id: p.id,
              email: p.email,
              full_name: p.full_name,
              role: r?.role || 'user',
              empresas: ue.map((ue: any) => ue.empresa_id)
          }
      })

      return new Response(
        JSON.stringify({ users: combinedUsers }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    throw new Error('Method not allowed')

  } catch (error) {
    console.error("Error in admin-users:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
