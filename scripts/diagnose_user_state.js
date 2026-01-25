
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function diagnose() {
  const email = 'claudio_bezerra@hotmail.com'
  console.log(`Checking user: ${email}`)

  // 1. Check Auth User (List all users and find by email because admin.getUserByEmail might not be available or I prefer listing to see all)
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()
  
  if (listError) {
    console.error('Error listing users:', listError)
    return
  }

  const user = users.find(u => u.email === email)

  if (!user) {
    console.log('User NOT found in Auth.')
    return
  }

  console.log('User found in Auth:', user.id)
  console.log('Metadata:', user.user_metadata)
  console.log('Confirmed:', user.email_confirmed_at)

  // 2. Check Profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError) {
    console.error('Error getting profile:', profileError)
  } else {
    console.log('Profile found:', profile)
  }

  // 3. Check User Roles
  const { data: roles, error: rolesError } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', user.id)

  if (rolesError) {
    console.error('Error getting roles:', rolesError)
  } else {
    console.log('User Roles:', roles)
  }

  // 4. Check Tenant Members
  const { data: members, error: membersError } = await supabase
    .from('user_tenants')
    .select('*, tenant:tenants(*)')
    .eq('user_id', user.id)

  if (membersError) {
    console.error('Error getting tenant members:', membersError)
  } else {
    console.log('Tenant Memberships:', members)
  }
}

diagnose()
