
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://lfrkfthmlxrotqfrdmwq.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmcmtmdGhtbHhyb3RxZnJkbXdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5NTM5MDEsImV4cCI6MjA4NDUyOTkwMX0.jBXVs1b4CcBvYjgR1ovz8OoO_JE55_Xz3GSFKHkF7IY";
const supabase = createClient(supabaseUrl, supabaseKey);

async function validateSchema() {
  console.log("Validando schema do banco de dados...");
  
  // 1. Validar existência da tabela import_job_logs
  console.log("\n1. Verificando tabela import_job_logs...");
  const { error: logsError } = await supabase.from('import_job_logs').select('count', { count: 'exact', head: true });
  if (logsError) {
    if (logsError.code === '42P01') { // undefined_table
      console.error("❌ Tabela 'import_job_logs' NÃO EXISTE. Migração pendente.");
    } else {
      console.error(`⚠️ Erro ao acessar 'import_job_logs': ${logsError.message}`);
    }
  } else {
    console.log("✅ Tabela 'import_job_logs' existe.");
  }
}

validateSchema();
