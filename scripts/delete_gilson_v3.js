import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load env from root
dotenv.config({ path: path.join(process.cwd(), '.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function main() {
  console.log('Searching for user "gilson.costa"...')
  
  const { data: { users }, error } = await supabase.auth.admin.listUsers()
  
  if (error) {
    console.error('Error fetching users:', error)
    return
  }

  const targets = users.filter(u => u.email && u.email.toLowerCase().includes('gilson.costa'))

  if (targets.length === 0) {
    console.log('No user found matching "gilson.costa"')
    return
  }

  console.log(`Found ${targets.length} users matching "gilson.costa". Deleting...`)

  for (const user of targets) {
    console.log(`Deleting user ${user.email} (${user.id})...`)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id)
    if (deleteError) {
      console.error(`Failed to delete user ${user.id}:`, deleteError)
    } else {
      console.log(`Deleted user ${user.email}`)
    }
  }
  
  console.log('Operation complete.')
}

main()
