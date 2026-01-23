// Debug das variáveis de ambiente
require('dotenv').config();

console.log('=== DEBUG DE VARIÁVEIS DE AMBIENTE ===');
console.log('VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL);
console.log('VITE_SUPABASE_PUBLISHABLE_KEY:', process.env.VITE_SUPABASE_PUBLISHABLE_KEY ? 'Presente' : 'Ausente');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Presente' : 'Ausente');
console.log('');

// Listar todas as variáveis que começam com VITE_
Object.keys(process.env).forEach(key => {
  if (key.startsWith('VITE_')) {
    console.log(`${key}: ${key.includes('KEY') ? 'Presente (oculta)' : process.env[key]}`);
  }
});

console.log('\n=== TESTE DE CONEXÃO COM VARIÁVEIS CORRETAS ===');

const { createClient } = require('@supabase/supabase-js');

async function testConnection() {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    
    console.log('URL:', supabaseUrl);
    console.log('Key:', supabaseKey ? 'Presente' : 'Ausente');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Variáveis VITE_ ausentes');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('Testando consulta...');
    const start = Date.now();
    
    const { data, error } = await supabase
      .from('empresas')
      .select('id, nome')
      .limit(1);
      
    const time = Date.now() - start;
    
    if (error) {
      console.error('Erro na consulta:', error);
    } else {
      console.log('Sucesso! Tempo:', time + 'ms');
      console.log('Dados:', data);
    }
    
  } catch (error) {
    console.error('Erro geral:', error.message);
  }
}

testConnection();