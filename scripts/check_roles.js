
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY)

async function checkRoles() {
  const { data: { users } } = await supabase.auth.admin.listUsers()
  
  const emails = ['claudio_bezerra@hotmail.com', 'gilson.costa@hotmail.com']
  const targetUsers = users.filter(u => emails.includes(u.email?.toLowerCase()))
  
  const ids = targetUsers.map(u => u.id)
  
  const { data: roles } = await supabase
    .from('user_roles')
    .select('*')
    .in('user_id', ids)
    
  console.log('Roles:', JSON.stringify(roles, null, 2))
}

checkRoles()
