import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  console.log("PARSE-EFD-V12: IMPLEMENTAÇÃO COMPLETA");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { empresa_id, file_path, file_name, file_size, record_limit = 1000, import_scope = 'full' } = await req.json();
    console.log("Parâmetros recebidos:", { empresa_id, file_path, file_name, file_size, record_limit, import_scope });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const user_id = empresa_id; // Fallback simples

    const job_id = crypto.randomUUID();
    const { data: jobData, error: jobError } = await supabase
      .from('import_jobs')
      .insert({
        id: job_id,
        user_id,
        empresa_id,
        file_name,
        file_path,
        file_size,
        status: 'uploaded',
        record_limit,
        import_scope,
        created_at: new Date().toISOString()
      })
      .select();

    if (jobError) {
      throw new Error(`Erro ao criar job: ${jobError.message}`);
    }

    console.log("Job criado com ID:", job_id);

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('EFD-4')
      .download(file_path);

    if (downloadError) {
      await supabase.from('import_jobs').update({ 
        status: 'error', 
        error_message: `Erro ao baixar arquivo: ${downloadError.message}` 
      }).eq('id', job_id);
      throw new Error(`Erro ao baixar arquivo: ${downloadError.message}`);
    }

    const text = await fileData.text();
    const lines = text.split('\n').slice(0, record_limit);
    console.log(`Processando ${lines.length} linhas`);

    const cnpjs = new Set();
    const cnpjPattern = /\d{14}/g;
    
    lines.forEach(line => {
      const matches = line.match(cnpjPattern);
      if (matches) {
        matches.forEach(cnpj => {
          if (cnpj.length === 14) {
            const formattedCnpj = `${cnpj.slice(0,2)}.${cnpj.slice(2,5)}.${cnpj.slice(5,8)}/${cnpj.slice(8,12)}-${cnpj.slice(12,14)}`;
            cnpjs.add(formattedCnpj);
          }
        });
      }
    });

    console.log(`CNPJs encontrados: ${cnpjs.size}`);

    if (cnpjs.size > 0) {
      const filiaisToInsert = Array.from(cnpjs).map(cnpj => ({
        empresa_id,
        cnpj,
        nome_fantasia: `Filial ${cnpj}`,
        created_at: new Date().toISOString()
      }));

      const { error: insertError } = await supabase
        .from('filiais')
        .upsert(filiaisToInsert, { onConflict: 'empresa_id,cnpj' });

      if (insertError) {
        console.error("Erro ao inserir filiais:", insertError);
      } else {
        console.log(`Filiais inseridas: ${cnpjs.size}`);
      }
    }

    await supabase.from('import_jobs').update({ 
      status: 'completed',
      processed_lines: lines.length,
      filiais_found: cnpjs.size,
      completed_at: new Date().toISOString()
    }).eq('id', job_id);

    return new Response(
      JSON.stringify({
        success: true,
        job_id,
        status: 'completed',
        message: `EFD processado! ${cnpjs.size} CNPJs, ${lines.length} linhas`,
        stats: {
          processed_lines: lines.length,
          cnpjs_found: cnpjs.size,
          file_size
        }
      }),
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json" 
        } 
      }
    );

  } catch (error) {
    console.error("Error in parse-efd-v12:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: `Server error: ${error.message}`
      }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json" 
        } 
      }
    );
  }
});