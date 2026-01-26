
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing env vars VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Helper to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTest() {
  console.log('Starting EFD ICMS Import Test...');

  const cnpj = '12345678000199';
  const dtIni = '01012026';
  const dtFin = '31012026';
  
  // Header: 0000
  const header = `|0000|013|0|${dtIni}|${dtFin}|EMPRESA TESTE|${cnpj}|UF|IE|COD_MUN|IM|SUFRAMA|IND_PERFIL|IND_ATIV|`;
  
  // 0140: Estabelecimento
  const reg0140 = `|0140|COD_EST_TEST|EMPRESA TESTE|${cnpj}|UF|IE|COD_MUN|IM|SUFRAMA|`;

  // 0150: Participante
  const reg0150 = `|0150|PART01|FORNECEDOR TESTE|1058|CNPJ_PART||IE|COD_MUN|`;

  // C010: Header Bloco C
  const c010 = `|C010|${cnpj}|1|`;

  // C100 Doc 1
  const c100_1 = `|C100|0|1|PART01|55|00|1|1001|KEY1|${dtIni}|${dtIni}|1500,00|0|0|0|1500,00|0|0|0|0|1500,00|270,00|0|0|0|24,75|114,00|0|0|`;
  
  // C170 Items for Doc 1
  // 1. CFOP 1556 (Uso/Consumo) -> Should be imported
  // VL_ITEM=500,00, VL_ICMS=90,00
  const c170_1_1 = `|C170|1|ITEM01|DESC|1|UN|500,00|0|0|000|1556|NAT|500,00|18,00|90,00|0|0|0|0|50|ENQ|0|0|0|50|500,00|1,65|0|0|8,25|50|500,00|7,60|0|0|38,00|||`;
  
  // 2. CFOP 1551 (Imobilizado) -> Should be imported
  // VL_ITEM=500,00, VL_ICMS=90,00
  const c170_1_2 = `|C170|2|ITEM02|DESC|1|UN|500,00|0|0|000|1551|NAT|500,00|18,00|90,00|0|0|0|0|50|ENQ|0|0|0|50|500,00|1,65|0|0|8,25|50|500,00|7,60|0|0|38,00|||`;

  // 3. CFOP 1102 (Revenda) -> Should be IGNORED
  const c170_1_3 = `|C170|3|ITEM03|DESC|1|UN|500,00|0|0|000|1102|NAT|500,00|18,00|90,00|0|0|0|0|50|ENQ|0|0|0|50|500,00|1,65|0|0|8,25|50|500,00|7,60|0|0|38,00|||`;

  const trailer = `|9999|10|`;
  
  const fileContent = [header, reg0140, reg0150, c010, c100_1, c170_1_1, c170_1_2, c170_1_3, trailer].join('\r\n');
  
  const fileName = `test_icms_${Date.now()}.txt`;
  
  // 2. Upload
  console.log(`Uploading ${fileName}...`);
  // Ensure bucket exists or handle error (assuming 'imports' bucket exists per migration)
  // Actually, 'imports' bucket might be 'efd-files' based on code read: supabase.storage.from("efd-files")
  const bucketName = 'efd-files';

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(`${fileName}`, fileContent, {
      contentType: 'text/plain',
      upsert: true
    });
    
  if (uploadError) {
    console.error('Upload failed:', uploadError);
    return;
  }
  
  console.log('Upload successful:', uploadData);
  
  // 3. Invoke parse-efd-icms
  // Find an empresa
  const { data: empresas } = await supabase.from('empresas').select('id').limit(1);
  if (!empresas || empresas.length === 0) {
    console.error('No empresa found');
    return;
  }
  const empresaId = empresas[0].id;

  // Ensure prerequisites exist (Filial and Mercadoria for the period)
  console.log("Ensuring prerequisites (Filial, Mercadorias)...");
  
  // Check/Create Filial
  let { data: filial } = await supabase
    .from('filiais')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('cnpj', '12345678000199')
    .maybeSingle();

  if (!filial) {
      console.log("Creating dummy filial...");
      const { data: newFilial, error: filialError } = await supabase
        .from('filiais')
         .insert({
             empresa_id: empresaId,
             cnpj: '12345678000199',
             razao_social: 'Empresa Teste Filial'
         })
         .select()
         .single();
      
      if (filialError) {
          console.error("Failed to create filial:", filialError);
          // Try to find ANY filial to use
          const { data: anyFilial } = await supabase.from('filiais').select('id').eq('empresa_id', empresaId).limit(1).single();
          if (anyFilial) filial = anyFilial;
          else return;
      } else {
          filial = newFilial;
      }
  }
  
  if (filial) {
      // Check/Create Mercadoria for 2026-01-01
      const mesAno = '2026-01-01';
      const { count } = await supabase
        .from('mercadorias')
        .select('*', { count: 'exact', head: true })
        .eq('filial_id', filial.id)
        .eq('mes_ano', mesAno);
        
      if (count === 0) {
          console.log("Creating dummy mercadoria for prerequisites...");
          const { error: mercError } = await supabase
             .from('mercadorias')
             .insert({
                 filial_id: filial.id,
                 mes_ano: mesAno,
                 tipo: 'entrada',
                 descricao: 'ITEM TESTE',
                 ncm: '00000000',
                 valor: 1000,
                 pis: 10,
                 cofins: 50
             });
           if (mercError) console.error("Failed to create mercadoria:", mercError);
      }
  }
  
  console.log(`Invoking parse-efd-icms for empresa ${empresaId}...`);
  const { data: funcData, error: funcError } = await supabase.functions.invoke('parse-efd-icms', {
    body: {
      empresa_id: empresaId,
      file_path: fileName,
      file_name: fileName,
      file_size: fileContent.length,
      import_scope: 'icms_uso_consumo'
    },
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`
    }
  });
  
  if (funcError) {
    console.error('Function invoke failed:', funcError);
    if (funcError.context && typeof funcError.context.json === 'function') {
        try {
            const body = await funcError.context.json();
            console.error('Error Body:', JSON.stringify(body, null, 2));
        } catch (e) {
            console.error('Could not read error body:', e);
        }
    }
    return;
  }
  
  console.log('Function invoked:', funcData);
  const jobId = funcData.jobId || funcData.job_id; 
  
  if (!jobId) {
    console.error('No jobId returned');
    return;
  }
  
  // 4. Poll job status
  console.log(`Polling job ${jobId}...`);
  let status = 'pending';
  let attempts = 0;
  while ((status === 'pending' || status === 'processing' || status === 'refreshing_views') && attempts < 30) {
    await wait(2000);
    const { data: job } = await supabase.from('import_jobs').select('*').eq('id', jobId).single();
    if (job) {
      status = job.status;
      console.log(`Job status: ${status} (${job.progress}%) - ${job.message || ''}`);
      if (status === 'error' || status === 'failed') {
        console.error('Job failed:', job.error_message);
        return;
      }
    }
    attempts++;
  }
  
  // 5. Verify data
  console.log('Verifying uso_consumo_imobilizado...');
  const { data: records, error: dbError } = await supabase
    .from('uso_consumo_imobilizado')
    .select('*')
    .eq('num_doc', '1001'); // Our dummy doc number
    
  if (dbError) {
    console.error('Verification query failed:', dbError);
  } else {
    console.log(`Found ${records.length} records.`);
    console.table(records.map(r => ({
        tipo: r.tipo_operacao,
        cfop: r.cfop,
        valor: r.valor,
        icms: r.valor_icms
    })));
    
    // Check assertions
    const hasUsoConsumo = records.some(r => r.cfop === '1556' && r.tipo_operacao === 'uso_consumo');
    const hasImobilizado = records.some(r => r.cfop === '1551' && r.tipo_operacao === 'imobilizado');
    const hasRevenda = records.some(r => r.cfop === '1102');
    
    if (hasUsoConsumo && hasImobilizado && !hasRevenda) {
        console.log('SUCCESS: Imported Uso/Consumo and Imobilizado, ignored Revenda.');
    } else {
        console.error('FAILURE: Assertions failed.');
        console.log('Expected: 1556 (uso_consumo), 1551 (imobilizado). NO 1102.');
    }
  }
}

runTest();
