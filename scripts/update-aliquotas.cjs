
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env file in project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateAliquotas() {
  console.log('Iniciando atualização de alíquotas (2027-2033)...');

  const { data: aliquotas, error } = await supabase
    .from('aliquotas')
    .select('*')
    .gte('ano', 2027)
    .lte('ano', 2033);

  if (error) {
    console.error('Erro ao buscar alíquotas:', error);
    return;
  }

  console.log(`Encontrados ${aliquotas.length} registros.`);

  for (const row of aliquotas) {
    let updates = {};
    let needsUpdate = false;

    // Corrigir CBS para 8.8 fixo
    if (row.cbs !== 8.8) {
        updates.cbs = 8.8;
        needsUpdate = true;
    }

    // Corrigir IBS Estadual (se for decimal < 1, multiplicar por 100)
    // Assumindo que nenhuma alíquota real seria < 1% (exceto zero)
    if (row.ibs_estadual > 0 && row.ibs_estadual < 1) {
        updates.ibs_estadual = row.ibs_estadual * 100;
        needsUpdate = true;
    }

    // Corrigir IBS Municipal
    if (row.ibs_municipal > 0 && row.ibs_municipal < 1) {
        updates.ibs_municipal = row.ibs_municipal * 100;
        needsUpdate = true;
    }
    
    // Corrigir Reduções
    if (row.reduc_icms > 0 && row.reduc_icms < 1) {
        updates.reduc_icms = row.reduc_icms * 100;
        needsUpdate = true;
    }
    
    if (row.reduc_piscofins > 0 && row.reduc_piscofins < 1) {
        updates.reduc_piscofins = row.reduc_piscofins * 100;
        needsUpdate = true;
    }

    if (needsUpdate) {
        console.log(`Atualizando Ano ${row.ano}:`, updates);
        const { error: updateError } = await supabase
            .from('aliquotas')
            .update(updates)
            .eq('id', row.id);
            
        if (updateError) {
            console.error(`Erro ao atualizar ano ${row.ano}:`, updateError);
        } else {
            console.log(`Ano ${row.ano} atualizado com sucesso.`);
        }
    } else {
        console.log(`Ano ${row.ano} já está correto.`);
    }
  }
  
  console.log('Processo finalizado.');
}

updateAliquotas();
