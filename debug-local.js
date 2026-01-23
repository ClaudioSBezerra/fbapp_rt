// Script para testar função parse-efd-emergency localmente
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Simula o ambiente Supabase localmente
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Carrega variáveis de ambiente do .env
const loadEnv = () => {
  try {
    const envText = Deno.readTextFileSync('.env');
    const lines = envText.split('\n');
    for (const line of lines) {
      if (line.includes('=')) {
        const [key, value] = line.split('=');
        Deno.env.set(key.trim(), value.trim().replace(/['"]+/g, ''));
      }
    }
  } catch (e) {
    console.log('Arquivo .env não encontrado, usando variáveis de ambiente do sistema');
  }
};

// Função principal (mesmo código da emergency)
const handleRequest = async (req) => {
  console.log("EMERGENCY LOCAL: Started");
  
  if (req.method === "OPTIONS") {
    console.log("EMERGENCY LOCAL: OPTIONS request");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("EMERGENCY LOCAL: Reading body...");
    const body = await req.json();
    console.log("EMERGENCY LOCAL: Body read successfully", body);

    // Testar conexão com Supabase
    console.log("EMERGENCY LOCAL: Testing Supabase connection...");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Testar consulta simples
    console.log("EMERGENCY LOCAL: Testing simple query...");
    const startTime = Date.now();
    const { data: empresas, error: empresasError } = await supabase
      .from("empresas")
      .select("id, nome")
      .limit(1);
    
    const queryTime = Date.now() - startTime;
    console.log(`EMERGENCY LOCAL: Query took ${queryTime}ms`);
    
    if (empresasError) {
      console.error("EMERGENCY LOCAL: Query error:", empresasError);
      throw empresasError;
    }

    // Immediate response - no DB operations
    console.log("EMERGENCY LOCAL: Sending response...");
    return new Response(
      JSON.stringify({
        success: true,
        message: "Emergency LOCAL test - DB connection successful",
        query_time_ms: queryTime,
        empresas_count: empresas?.length || 0,
        received: {
          empresa_id: body.empresa_id,
          file_path: body.file_path
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("EMERGENCY LOCAL ERROR:", error);
    return new Response(
      JSON.stringify({ 
        error: "Emergency LOCAL error: " + (error instanceof Error ? error.message : String(error))
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

// Inicia servidor local
loadEnv();
console.log("Starting local debug server on http://localhost:9000");
console.log("Press Ctrl+C to stop");
console.log("\nTest with:");
console.log("curl -X POST http://localhost:9000 -H 'Content-Type: application/json' -d '{\"empresa_id\": \"test\", \"file_path\": \"test.txt\"}'");

await serve(handleRequest, { port: 9000 });