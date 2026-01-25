// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
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
  console.log("PARSE-EFD-V13: IMPLEMENTAÇÃO COMPLETA");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { empresa_id, file_path, file_name, file_size, record_limit = 1000, import_scope = 'full' } = await req.json();
    console.log("Parâmetros recebidos:", { empresa_id, file_path, file_name, file_size, record_limit, import_scope });

    // Criar cliente Supabase com service role (bypass RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Obter user_id do token JWT (se disponível)
    const authHeader = req.headers.get('Authorization');
    let user_id = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        
        if (userError) {
          console.error('Erro ao validar token:', userError);
        }
        
        user_id = user?.id;
      } catch (e) {
        console.error('Não foi possível extrair user_id do token:', e);
      }
    }
    
    // Se não tiver user_id, retornar erro (não usar fallback para não quebrar RLS)
    if (!user_id) {
      console.error('ERRO: user_id não identificado no token. Abortando para evitar job órfão.');
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Usuário não autenticado. Token inválido ou expirado.'
        }),
        { 
          status: 401, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json" 
          } 
        }
      );
    }

    // 1. Criar job de importação
    const job_id = crypto.randomUUID();
    console.log('Tentando criar job com:', {
      id: job_id,
      user_id,
      empresa_id,
      file_name,
      file_path,
      file_size,
      status: 'pending',
      record_limit,
      import_scope,
      created_at: new Date().toISOString()
    });
    
    const { data: jobData, error: jobError } = await supabase
      .from('import_jobs')
      .insert({
        id: job_id,
        user_id,
        empresa_id,
        file_name,
        file_path,
        file_size,
        status: 'pending',
        record_limit,
        import_scope,
        created_at: new Date().toISOString()
      })
      .select();
    
    console.log('Resultado do insert:', { jobData, jobError });

    if (jobError) {
      throw new Error(`Erro ao criar job: ${jobError.message}`);
    }

    // 2. Iniciar processamento em background (fire and forget)
    // Invocar a função process-efd-job sem aguardar a resposta
    console.log(`Iniciando processamento background para job ${job_id}`);
    const processUrl = `${supabaseUrl}/functions/v1/process-efd-job`;
    
    // Não usamos await aqui para não bloquear o retorno para o cliente
    fetch(processUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ job_id }),
    }).catch(err => {
      console.error(`Falha ao invocar process-efd-job:`, err);
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Job criado com sucesso!',
        job_id,
        user_id,
        empresa_id 
      }),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json" 
        } 
      }
    );

  } catch (error) {
    console.error("Error in parse-efd-v13:", error);
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

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/parse-efd-v13' \
    --header 'Authorization: Bearer eyJhbGciOiJFUzI1NiIsImtpZCI6ImI4MTI2OWYxLTIxZDgtNGYyZS1iNzE5LWMyMjQwYTg0MGQ5MCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjIwODQ1Mzg2NTh9.cWR5OTXKvdwjl6Ip6vNU-OCoWwT3OfWJ3Tk5f8c3XMRlsXe9hFyB95gNxX6d1eegRwVBw_QrwHmsQPqQc5tpyw' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
