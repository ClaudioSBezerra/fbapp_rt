const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envConfig = dotenv.parse(fs.readFileSync(path.resolve(__dirname, '.env')));
const serviceKey = envConfig.VITE_SUPABASE_SERVICE_ROLE_KEY;
// Force service key check
if (!serviceKey || serviceKey.includes('INSIRA_SUA')) {
    console.error('Error: VITE_SUPABASE_SERVICE_ROLE_KEY is required correctly in .env for cleanup operations.');
    process.exit(1);
}

const supabase = createClient(envConfig.VITE_SUPABASE_URL, serviceKey);

async function cleanUp() {
    console.log('Starting cleanup...');

    // 1. Clean Jobs
    const { data: jobs, error: jobsError } = await supabase
        .from('import_jobs')
        .select('id');

    if (jobsError) {
        console.error('Error listing jobs:', jobsError);
    } else {
        console.log(`Found ${jobs.length} jobs to delete.`);
        if (jobs.length > 0) {
            const { error: deleteError } = await supabase
                .from('import_jobs')
                .delete()
                .in('id', jobs.map(j => j.id));
            
            if (deleteError) console.error('Error deleting jobs:', deleteError);
            else console.log('All jobs deleted successfully.');
        }
    }

    // 2. Clean Storage
    const { data: rootItems, error: listError } = await supabase
        .storage
        .from('efd-files')
        .list();

    if (listError) {
        console.error('Error listing storage bucket:', listError);
    } else {
        console.log(`Found ${rootItems.length} root items in efd-files.`);
        for (const item of rootItems) {
            // Assume these are user folders. List contents.
            const { data: files, error: filesError } = await supabase
                .storage
                .from('efd-files')
                .list(item.name);

            if (filesError) {
                console.error(`Error listing folder ${item.name}:`, filesError);
                continue;
            }

            if (files.length > 0) {
                const filesToRemove = files.map(f => `${item.name}/${f.name}`);
                console.log(`Deleting ${filesToRemove.length} files in ${item.name}...`);
                const { error: removeError } = await supabase
                    .storage
                    .from('efd-files')
                    .remove(filesToRemove);
                
                if (removeError) console.error(`Error removing files in ${item.name}:`, removeError);
                else console.log(`Files in ${item.name} deleted.`);
            }
        }
    }
    
    console.log('Cleanup finished.');
}

cleanUp();
