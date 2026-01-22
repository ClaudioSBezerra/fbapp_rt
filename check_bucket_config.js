import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lfrkfthmlxrotqfrdmwq.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmcmtmdGhtbHhyb3RxZnJkbXdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5NTM5MDEsImV4cCI6MjA4NDUyOTkwMX0.jBXVs1b4CcBvYjgR1ovz8OoO_JE55_Xz3GSFKHkF7IY'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function checkBucket() {
  const { data, error } = await supabase
    .storage
    .getBucket('efd-files')

  if (error) {
    console.error('Error fetching bucket:', error)
  } else {
    console.log('Bucket config:', data)
  }
}

checkBucket()