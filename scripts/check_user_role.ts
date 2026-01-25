
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Load environment variables from .env file
const envPath = path.resolve(process.cwd(), '.env')
const envFile = fs.readFileSync(envPath, 'utf8')
const env: Record<string, string> = {}
for (const line of envFile.split('\n')) {
  const parts = line.split('=')
  if (parts.length >= 2) {
    const key = parts[0].trim()
    let value = parts.slice(1).join('=').trim()
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
}

const supabaseUrl = env['VITE_SUPABASE_URL']
const supabaseServiceKey = env['SUPABASE_SERVICE_ROLE_KEY'] || env['VITE_SUPABASE_SERVICE_ROLE_KEY']

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase URL or Service Key')
  console.log('Available keys:', Object.keys(env))
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkUserRole(email: string) {
  console.log(`Checking role for ${email}...`)
  
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', email)
    .single()
    
  if (profileError) {
    console.error('Error finding profile:', profileError)
    return
  }
  
  if (!profiles) {
    console.error('Profile not found')
    return
  }
  
  console.log('User ID:', profiles.id)
  
  // Check role
  const { data: roles, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', profiles.id)
    
  if (roleError) {
    console.error('Error fetching roles:', roleError)
    return
  }
  
  console.log('Roles:', roles)
  
  // Also check user_tenants
  const { data: tenants, error: tenantError } = await supabase
    .from('user_tenants')
    .select('tenant_id')
    .eq('user_id', profiles.id)

  if (tenantError) {
    console.error('Error fetching tenants:', tenantError)
    return
  }

  console.log('Tenants:', tenants)
}

checkUserRole('claudio_bezerra@hotmail.com')
