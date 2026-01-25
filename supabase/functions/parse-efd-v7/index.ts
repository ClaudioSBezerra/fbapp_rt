import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("PARSE-EFD-V7: ULTRA LEVE - SEM PARSE");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Supabase client com SERVICE ROLE
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parâmetros do body
    const body = await req.json();
    const { empresa_id: empresaId, file_path: filePath, file_name: fileName, file_size: fileSize } = body;

    if (!filePath || !empresaId) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Creating job for: ${filePath}`);

    // Verificar empresa
    const { data: empresa } = await supabase
      .from("empresas")
      .select("id")
      .eq("id", empresaId)
      .single();

    if (!empresa) {
      return new Response(
        JSON.stringify({ error: "Empresa not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Criar import job com status 'uploaded'
    const { data: job, error: jobError } = await supabase
      .from("import_jobs")
      .insert({
        empresa_id: empresaId,
        filial_id: null, // Será preenchido depois
        file_path: filePath,
        file_name: fileName,
        file_size: fileSize || 0,
        status: "uploaded",
        progress: 0,
        total_lines: 0,
        counts: { mercadorias: 0, energia_agua: 0, fretes: 0 },
        record_limit: 0,
        import_scope: "all"
      })
      .select()
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: `Failed to create import job: ${jobError?.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.id,
        status: "uploaded",
        message: `Arquivo recebido com sucesso. Parse será feito em background.`,
        next_step: "process-efd-job"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in PARSE-EFD-V7:", error);
    return new Response(
      JSON.stringify({ error: `Server error: ${error.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
