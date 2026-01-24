const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envConfig = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '.env')));
const serviceKey = envConfig.VITE_SUPABASE_SERVICE_ROLE_KEY;
const realKey = (serviceKey && !serviceKey.includes('INSIRA_SUA')) 
  ? serviceKey 
  : envConfig.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase = createClient(envConfig.VITE_SUPABASE_URL, realKey);

async function checkJobs() {
  const { data, error } = await supabase
    .from('import_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Recent jobs:', JSON.stringify(data, null, 2));
}

checkJobs();
