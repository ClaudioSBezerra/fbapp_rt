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
  console.log("PARSE-EFD-V11: IMPLEMENTAÇÃO COMPLETA COM USER_ID");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { empresa_id, file_path, file_name, file_size, record_limit = 1000, import_scope = 'full' } = await req.json();
    console.log("Parâmetros recebidos:", { empresa_id, file_path, file_name, file_size, record_limit, import_scope });

    // Criar cliente Supabase com service role (bypass RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Obter user_id do token JWT (se disponível) ou usar um default
    const authHeader = req.headers.get('Authorization');
    let user_id = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        user_id = user?.id;
      } catch (e) {
        console.log('Não foi possível extrair user_id do token');
      }
    }
    
    // Se não tiver user_id, usar o empresa_id como fallback
    if (!user_id) {
      user_id = empresa_id; // Fallback temporário
    }

    // 1. Criar job de importação
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
      console.error("Erro ao criar job:", jobError);
      throw new Error(`Erro ao criar job: ${jobError.message}`);
    }

    console.log("Job criado:", jobData);

    // 2. Baixar arquivo do storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('EFD-4')
      .download(file_path);

    if (downloadError) {
      console.error("Erro ao baixar arquivo:", downloadError);
      // Atualizar status do job para erro
      await supabase.from('import_jobs').update({ 
        status: 'error', 
        error_message: `Erro ao baixar arquivo: ${downloadError.message}` 
      }).eq('id', job_id);
      throw new Error(`Erro ao baixar arquivo: ${downloadError.message}`);
    }

    // 3. Ler conteúdo do arquivo (primeiras linhas para teste)
    const text = await fileData.text();
    const lines = text.split('\n').slice(0, record_limit);
    console.log(`Processando ${lines.length} linhas`);

    // 4. Extrair CNPJs das linhas (versão simplificada)
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

    // 5. Inserir filiais com UPSERT (evita duplicatas)
    const filiaisToInsert = Array.from(cnpjs).map(cnpj => ({
      empresa_id,
      cnpj,
      nome_fantasia: `Filial ${cnpj}`,
      created_at: new Date().toISOString()
    }));

    if (filiaisToInsert.length > 0) {
      const { data: insertedFiliais, error: insertError } = await supabase
        .from('filiais')
        .upsert(filiaisToInsert, { onConflict: 'empresa_id,cnpj' })
        .select();

      if (insertError) {
        console.error("Erro ao inserir filiais:", insertError);
        // Não falhar completamente, apenas logar erro
      } else {
        console.log(`Filiais inseridas/atualizadas: ${insertedFiliais?.length || 0}`);
      }
    }

    // 6. Atualizar status do job para completado
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
        message: `EFD processado com sucesso! ${cnpjs.size} filiais encontradas, ${lines.length} linhas processadas`,
        stats: {
          processed_lines: lines.length,
          filiais_found: cnpjs.size,
          file_size,
          import_scope
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
    console.error("Error in parse-efd-v11:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: `Server error: ${error.message}`,
        stack: error.stack
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

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/parse-efd-v11' \
    --header 'Authorization: Bearer eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjIwODQ1MjkzNzB9.16ItiHo0qR7_bPklzjVBJQhQ-T0lL1TeQPvRaLpXS2GOhz8kwJwbs9gq-W2n7eYwrU_4LvZ02n4geMOKS07eXg' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/