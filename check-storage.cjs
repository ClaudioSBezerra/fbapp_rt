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

async function checkStorage() {
  console.log('Checking storage bucket "efd-files"...');
  
  // List all files in the bucket (recursive requires listing folders first, but let's try root and some subfolders if known)
  // Actually, list method is per folder. We don't know the user folder.
  // But we can try to list root folders (which are user IDs).
  
  const { data: folders, error } = await supabase
    .storage
    .from('efd-files')
    .list();

  if (error) {
    console.error('Error listing root:', error);
    return;
  }

  console.log(`Found ${folders.length} folders/files in root.`);
  
  for (const folder of folders) {
    console.log(`- ${folder.name} (${folder.id || 'folder'})`);
    // If it looks like a user ID (UUID), list inside
    if (folder.id === null) { // folders have id null usually in list response? No, they have id but metadata is different.
       // Let's just try to list inside everything that looks like a folder
       const { data: files, error: err2 } = await supabase
         .storage
         .from('efd-files')
         .list(folder.name);
         
       if (files && files.length > 0) {
         console.log(`  Files in ${folder.name}:`);
         files.forEach(f => {
           console.log(`    - ${f.name} (${(f.metadata.size / 1024 / 1024).toFixed(2)} MB) - ${f.created_at}`);
         });
       }
    }
  }
}

checkStorage();
