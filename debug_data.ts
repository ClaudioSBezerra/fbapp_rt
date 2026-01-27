import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('c:\\Projetos TRAE\\fbapp_rt\\.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; 

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    console.log("Checking mercadorias data...");
    
    // Check distinct types in table
    const { data: types, error: typeError } = await supabase
        .from('mercadorias')
        .select('tipo')
        .limit(100);
        
    if (typeError) {
        console.error("Error fetching mercadorias types:", typeError);
    } else {
        const distinctTypes = [...new Set(types.map(t => t.tipo))];
        console.log("Distinct types in 'mercadorias' table:", distinctTypes);
    }

    // Check distinct types in View
    // Note: To access view we need to select from it. 
    // Usually standard client defaults to 'public'. If view is in 'extensions', we need to specify schema.
    // However, if the view is not exposed in API, we might fail.
    // But 'extensions' is usually in search_path.
    
    // Let's try calling get_mercadorias_participante_totals directly (as postgres/service role)
    // We pass null for p_empresa_id to see if we get anything global (careful with RLS, but service role bypasses RLS)
    // Wait, RPCs are SECURITY DEFINER, so they run as owner.
    // But inside they use auth.uid(). If we call with service role key, auth.uid() is null?
    // Supabase Service Role client does NOT set auth.uid().
    // So has_filial_access(null, ...) will return false.
    // So RPCs will return empty.
    
    // So we MUST query the view/table directly which bypasses RLS with Service Role Key.
    
    console.log("Querying extensions.mv_mercadorias_participante directly...");
    const { data: viewRows, error: viewError } = await supabase
        .schema('extensions')
        .from('mv_mercadorias_participante')
        .select('tipo, valor, participante_nome')
        .limit(5);

    if (viewError) {
        console.error("Error fetching view rows:", viewError);
    } else {
        console.log("Sample rows from view:", viewRows);
        if (viewRows && viewRows.length > 0) {
            const distinctViewTypes = [...new Set(viewRows.map(t => t.tipo))];
            console.log("Distinct types in view sample:", distinctViewTypes);
        } else {
            console.log("View is empty or no access.");
        }
    }
}

checkData();
