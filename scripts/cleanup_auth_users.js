import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load env from root
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function main() {
  console.log('Fetching users...')
  // Pagination might be needed if many users, but listUsers defaults to page 1, 50 users
  // For total cleanup, we might need a loop
  let allUsers = []
  let page = 1
  const perPage = 50

  while (true) {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) {
      console.error('Error fetching users:', error)
      break
    }
    if (!users || users.length === 0) break
    allUsers = [...allUsers, ...users]
    page++
  }

  console.log(`Found ${allUsers.length} users. Deleting...`)

  for (const user of allUsers) {
    console.log(`Deleting user ${user.email} (${user.id})...`)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id)
    if (deleteError) {
      console.error(`Failed to delete user ${user.id}:`, deleteError)
    } else {
      console.log(`Deleted user ${user.id}`)
    }
  }
  
  console.log('Cleanup complete.')
}

main()
