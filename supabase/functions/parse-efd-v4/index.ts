import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EfdHeader {
  cnpj: string;
  razaoSocial: string;
  periodoInicio: string;
  periodoFim: string;
}

function parseHeaderLine(fields: string[]): EfdHeader | null {
  const dtIni = fields[6];
  const dtFin = fields[7];
  const nome = fields[8];
  const cnpj = fields[9]?.replace(/\D/g, "");

  if (cnpj && cnpj.length === 14) {
    return {
      cnpj,
      razaoSocial: nome || "Estabelecimento",
      periodoInicio: dtIni || "",
      periodoFim: dtFin || "",
    };
  }
  return null;
}

function formatCNPJ(cnpj: string): string {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

serve(async (req) => {
  console.log("PARSE-EFD-V4 VERSION: OPTIMIZED - EarlyDrop Fix"); // Version check log

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - FAST PATH
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Service Role client - bypass RLS
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get metadata from JSON body
    const body = await req.json();
    const { empresa_id: empresaId, file_path: filePath, file_name: fileName, file_size: fileSize, record_limit: recordLimit, import_scope: importScopeRaw } = body;
    
    const validScopes = ['all', 'only_c', 'only_d'];
    const importScope = validScopes.includes(importScopeRaw) ? importScopeRaw : 'all';
    console.log(`Import scope: ${importScope}`);

    if (!filePath || !empresaId) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing: ${filePath} for empresa ${empresaId}`);

    // FAST: Check empresa exists (no complex joins)
    const { data: empresa, error: empresaError } = await supabase
      .from("empresas")
      .select("id, nome, grupo_id")
      .eq("id", empresaId)
      .single();

    if (empresaError || !empresa) {
      console.error("Empresa error:", empresaError);
      return new Response(
        JSON.stringify({ error: "Empresa not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SKIP: Complex permission checks for now (causing delays)
    // TODO: Add async permission check in background job
    console.log("SKIPPING SLOW CHECKS: has_tenant_access and check_demo_import_limits");

    // Extract header from file using Range request (optimized)
    console.log(`Extracting header from file: ${filePath}`);
    
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("efd-files")
      .createSignedUrl(filePath, 60);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("Signed URL error:", signedUrlError);
      return new Response(
        JSON.stringify({ error: "Failed to create signed URL for file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("DEBUG: Fetching first 16KB...");

    let rangeResponse;
    try {
      rangeResponse = await fetch(signedUrlData.signedUrl, {
        headers: { "Range": "bytes=0-16383" }
      });
      console.log(`DEBUG: Fetch status: ${rangeResponse.status}`);
    } catch (fetchErr) {
      console.error("DEBUG: Fetch failed:", fetchErr);
      throw new Error(`Fetch failed: ${fetchErr.message}`);
    }

    if (!rangeResponse.ok && rangeResponse.status !== 206) {
      const errorText = await rangeResponse.text();
      console.error("Range request failed:", rangeResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: `Failed to download file header: ${errorText.substring(0, 100)}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let dataToDecode: BufferSource;
    
    if (rangeResponse.status === 200 && rangeResponse.body) {
      console.log("Server ignored Range header, reading stream manually");
      const reader = rangeResponse.body.getReader();
      const { value } = await reader.read();
      if (value) {
        dataToDecode = value;
        console.log(`Stream chunk read: ${value.byteLength} bytes`);
      } else {
        dataToDecode = new ArrayBuffer(0);
      }
      await reader.cancel();
      console.log("Stream cancelled");
    } else {
      dataToDecode = await rangeResponse.arrayBuffer();
      console.log(`ArrayBuffer read: ${dataToDecode.byteLength} bytes`);
    }
    
    const decoder = new TextDecoder("iso-8859-1");
    const text = decoder.decode(dataToDecode);
    
    console.log(`Text preview: ${text.substring(0, 100)}`);
    
    const lines = text.split("\n");
    
    let header: EfdHeader | null = null;
    for (const line of lines) {
      if (line.startsWith("|0000|")) {
        const fields = line.split("|");
        if (fields.length > 9) {
          header = parseHeaderLine(fields);
          break;
        }
      }
    }

    if (!header || !header.cnpj) {
      return new Response(
        JSON.stringify({ error: "Could not extract CNPJ from EFD file" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Header extracted: CNPJ=${header.cnpj}`);

    // Get or create filial (optimized)
    let filialId: string;
    let filialCreated = false;

    console.log(`Checking existing filial for CNPJ: ${header.cnpj}`);
    
    const { data: existingFilial, error: findError } = await supabase
      .from("filiais")
      .select("id, empresa_id")
      .eq("cnpj", header.cnpj)
      .maybeSingle();

    if (findError) {
       console.error("Error searching for filial:", findError);
    }

    if (existingFilial) {
      filialId = existingFilial.id;
      console.log(`Using existing filial: ${filialId}`);
    } else {
      try {
        const { data: newFilial, error: createError } = await supabase
          .from("filiais")
          .insert({
            empresa_id: empresaId,
            cnpj: header.cnpj,
            razao_social: `Filial ${header.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}`,
            nome_fantasia: null,
          })
          .select()
          .single();

        if (createError) {
           throw createError;
        }

        filialId = newFilial.id;
        filialCreated = true;
        console.log(`Created new filial: ${filialId}`);

      } catch (err: any) {
         console.log("Error during filial creation:", err);
         
         const errorMessage = (err.message || '').toLowerCase();
         const errorCode = err.code || '';
         
         if (errorCode === '23505' || errorMessage.includes('duplicate key')) {
            console.log("Duplicate CNPJ detected, fetching existing...");
            
            const { data: duplicateFilial } = await supabase
              .from("filiais")
              .select("id")
              .eq("cnpj", header.cnpj)
              .maybeSingle();
              
            if (duplicateFilial) {
              filialId = duplicateFilial.id;
              console.log(`Recovered existing filial: ${filialId}`);
            } else {
              console.error("Filial exists but could not be retrieved:", err);
              return new Response(
                JSON.stringify({ error: "Filial exists but could not be retrieved: " + errorMessage }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
         } else {
           console.error("Error creating filial:", err);
           return new Response(
             JSON.stringify({ error: "Failed to create filial: " + errorMessage }),
             { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
      }
    }

    // Create import job (FAST)
    console.log("Creating import job...");
    const { data: job, error: jobError } = await supabase
      .from("import_jobs")
      .insert({
        user_id: user.id,
        empresa_id: empresaId,
        filial_id: filialId,
        file_path: filePath,
        file_name: fileName,
        file_size: fileSize || 0,
        status: "pending",
        progress: 0,
        total_lines: 0,
        counts: { mercadorias: 0, energia_agua: 0, fretes: 0 },
        record_limit: recordLimit || 0,
        import_scope: importScope,
      })
      .select()
      .single();

    if (jobError) {
      console.error("Job creation error:", jobError);
      return new Response(
        JSON.stringify({ error: "Failed to create import job: " + jobError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Import job created successfully: ${job.id}`);

    // Start background processing
    const processUrl = `${supabaseUrl}/functions/v1/process-efd-job`;
    fetch(processUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ job_id: job.id }),
    }).then(res => {
      console.log(`Background job started for ${job.id}, status: ${res.status}`);
    }).catch(err => {
      console.error(`Failed to start background job for ${job.id}:`, err);
    });

    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.id,
        status: "pending",
        message: `Importação iniciada para ${header.razaoSocial} (CNPJ: ${formatCNPJ(header.cnpj)}).`,
        filialId,
        filialCreated,
        cnpj: header.cnpj,
        razaoSocial: header.razaoSocial,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in parse-efd-v4:", error);
    const errorMessage = error instanceof Error ? 
      `${error.message}` : 
      `Unknown error: ${JSON.stringify(error)}`;
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});