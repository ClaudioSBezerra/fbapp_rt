
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  console.log("Inspecting database state...");

  // 1. Check participantes count
  const { count: partCount, error: partError } = await supabase
    .from('participantes')
    .select('*', { count: 'exact', head: true });
  
  if (partError) console.error("Error checking participantes:", partError.message);
  else console.log(`Table 'participantes': ${partCount} rows`);

  // 2. Check mercadorias count
  const { count: mercCount, error: mercError } = await supabase
    .from('mercadorias')
    .select('*', { count: 'exact', head: true });

  if (mercError) console.error("Error checking mercadorias:", mercError.message);
  else console.log(`Table 'mercadorias': ${mercCount} rows`);

  // 3. Check uso_consumo_imobilizado count
  const { count: usoCount, error: usoError } = await supabase
    .from('uso_consumo_imobilizado')
    .select('*', { count: 'exact', head: true });

  if (usoError) console.error("Error checking uso_consumo_imobilizado:", usoError.message);
  else console.log(`Table 'uso_consumo_imobilizado': ${usoCount} rows`);

  // 4. Check mv_mercadorias_participante via RPC
  const { data: mvData, error: mvError } = await supabase.rpc('get_mercadorias_participante_totals');
  
  if (mvError) {
    console.error("Error checking mv_mercadorias_participante via RPC:", mvError.message);
  } else {
    console.log("mv_mercadorias_participante totals:", mvData);
  }

  // 5. Check sample match
  if (mercCount > 0 && partCount > 0) {
    const { data: sampleMerc } = await supabase.from('mercadorias').select('cod_part, filial_id').limit(5);
    console.log("Sample mercadorias cod_part:", sampleMerc);
    
    if (sampleMerc && sampleMerc.length > 0) {
      const codPart = sampleMerc[0].cod_part;
      const filialId = sampleMerc[0].filial_id;
      if (codPart) {
        const { data: matchPart } = await supabase
          .from('participantes')
          .select('cod_part, nome')
          .eq('cod_part', codPart)
          .eq('filial_id', filialId);
        console.log(`Match check for cod_part '${codPart}' in filial '${filialId}':`, matchPart);
      }
    }
  }
}

inspect();
