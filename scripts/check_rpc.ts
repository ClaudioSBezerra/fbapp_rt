
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = "https://lfrkfthmlxrotqfrdmwq.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmcmtmdGhtbHhyb3RxZnJkbXdxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODk1MzkwMSwiZXhwIjoyMDg0NTI5OTAxfQ.9werAn5DpmIZWaPFoZmSasK-LXzp8chwSMev75V6ej8";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkFunction() {
  console.log('--- Checking Totals RPC ---');
  // Check Totals first (we know this works and returns 91/9)
  const { data: totals, error: errorTotals } = await supabase.rpc('get_mercadorias_participante_totals', {
    p_mes_ano: null,
    p_participante: null,
    p_only_simples: null,
    p_empresa_id: null 
  });

  if (errorTotals) {
    console.error('Error calling Totals RPC:', errorTotals);
  } else {
    console.log('Totals RPC Result:', totals);
  }

  console.log('\n--- Checking Page RPC ---');
  // Check Page RPC with same parameters
  const { data, error } = await supabase.rpc('get_mercadorias_participante_page', {
    p_limit: 10,
    p_offset: 0,
    p_mes_ano: null,
    p_participante: null,
    p_tipo: null, // Try with null first
    p_only_simples: null,
    p_empresa_id: null 
  });

  if (error) {
    console.error('Error calling Page RPC:', error);
  } else {
    console.log('Page RPC Success. Data length:', data ? data.length : 0);
    if (data && data.length > 0) {
      console.log('First row sample:', JSON.stringify(data[0], null, 2));
      
      const entradas = data.filter((r: any) => r.tipo === 'entrada').length;
      const saidas = data.filter((r: any) => r.tipo === 'saida').length;
      console.log(`Counts in page (limit 10): Entrada=${entradas}, Saida=${saidas}`);
    } else {
      console.log('Page RPC returned empty array.');
    }
  }

    console.log('\n--- Checking Page RPC with explicit empty string params ---');
  // Check Page RPC with empty strings (frontend might be sending empty strings)
  const { data: data2, error: error2 } = await supabase.rpc('get_mercadorias_participante_page', {
    p_limit: 10,
    p_offset: 0,
    p_mes_ano: null,
    p_participante: '', // Empty string
    p_tipo: null,
    p_only_simples: null,
    p_empresa_id: null 
  });
  
    if (error2) {
    console.error('Error calling Page RPC 2:', error2);
  } else {
    console.log('Page RPC 2 (empty strings) Success. Data length:', data2 ? data2.length : 0);
  }
}

checkFunction();
