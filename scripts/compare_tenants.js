
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function compareTenants() {
  const adminEmail = 'claudio_bezerra@hotmail.com'
  const userEmail = 'gilson.costa@hotmail.com'

  console.log(`Comparing tenants for ${adminEmail} and ${userEmail}`)

  // 1. Get User IDs
  const { data: { users }, error: userError } = await supabase.auth.admin.listUsers()
  
  if (userError) {
    console.error('Error fetching users:', userError)
    return
  }

  const admin = users.find(u => u.email?.toLowerCase() === adminEmail.toLowerCase())
  const user = users.find(u => u.email?.toLowerCase() === userEmail.toLowerCase())

  if (!admin) console.error('Admin not found')
  if (!user) console.error('User not found')

  if (!admin || !user) return

  // 2. Get Admin Tenants
  const { data: adminTenants } = await supabase
    .from('user_tenants')
    .select('tenant_id, tenants(nome)')
    .eq('user_id', admin.id)

  console.log('Admin Tenants:', JSON.stringify(adminTenants, null, 2))

  // 3. Get User Tenants
  const { data: userTenants } = await supabase
    .from('user_tenants')
    .select('tenant_id, tenants(nome)')
    .eq('user_id', user.id)

  console.log('User Tenants:', JSON.stringify(userTenants, null, 2))

  // 4. Check for intersection
  const adminTenantIds = adminTenants?.map(t => t.tenant_id) || []
  const userTenantIds = userTenants?.map(t => t.tenant_id) || []
  
  const intersection = adminTenantIds.filter(id => userTenantIds.includes(id))
  
  console.log('Common Tenants:', intersection)

  if (intersection.length === 0) {
      console.log('WARNING: Admin and User do not share any tenants!')
  } else {
      console.log('SUCCESS: Admin and User share at least one tenant.')
  }
}

compareTenants()
