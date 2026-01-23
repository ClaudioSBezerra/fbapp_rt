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
  console.log("PARSE-EFD-V3 VERSION: INITIAL_DEPLOY"); // Version check log

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Explicitly configure client to use Service Role and bypass RLS
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

    // Get metadata from JSON body (file already uploaded by frontend)
    const body = await req.json();
    const { empresa_id: empresaId, file_path: filePath, file_name: fileName, file_size: fileSize, record_limit: recordLimit, import_scope: importScopeRaw } = body;
    
    // Validate import_scope (default to 'all' if not provided or invalid)
    const validScopes = ['all', 'only_c', 'only_d'];
    const importScope = validScopes.includes(importScopeRaw) ? importScopeRaw : 'all';
    console.log(`Import scope: ${importScope}`);

    if (!filePath) {
      return new Response(
        JSON.stringify({ error: "No file_path provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!empresaId) {
      return new Response(
        JSON.stringify({ error: "No empresa_id provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Received EFD metadata: path=${filePath}, name=${fileName}, size=${fileSize}`);

    // Verify user access to empresa
    const { data: empresa, error: empresaError } = await supabase
      .from("empresas")
      .select("id, nome, grupo_id, grupos_empresas!inner(tenant_id)")
      .eq("id", empresaId)
      .single();

    if (empresaError || !empresa) {
      console.error("Empresa error:", empresaError);
      // Clean up uploaded file
      // await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ error: "Empresa not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenantId = (empresa.grupos_empresas as any).tenant_id;
    const { data: hasAccess } = await supabase.rpc("has_tenant_access", {
      _tenant_id: tenantId,
      _user_id: user.id,
    });

    if (!hasAccess) {
      // Clean up uploaded file
      // await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ error: "Access denied to this empresa" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check demo import limits
    const { data: limitCheck, error: limitError } = await supabase.rpc("check_demo_import_limits", {
      _empresa_id: empresaId,
      _file_type: "contrib",
      _mes_ano: null, // Will check overall limit
    });

    if (!limitError && limitCheck && !limitCheck.allowed) {
      // await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ 
          error: limitCheck.reason || "Limite de importações do período de demonstração atingido",
          demo_limit_reached: true 
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract header from file using Range request (only first 16KB, not entire file)
    console.log(`Extracting header from file: ${filePath}`);
    
    // Generate signed URL to use with Range request
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("efd-files")
      .createSignedUrl(filePath, 60); // URL valid for 60 seconds

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("Signed URL error:", signedUrlError);
      // await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ error: "Failed to create signed URL for file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("DEBUG: Signed URL created. Fetching first 16KB...");

    // Download only the first 16KB using Range request (avoids loading entire file into memory)
    let rangeResponse;
    try {
      rangeResponse = await fetch(signedUrlData.signedUrl, {
        headers: {
          "Range": "bytes=0-16383" // First 16KB only
        }
      });
      console.log(`DEBUG: Fetch status: ${rangeResponse.status}, OK=${rangeResponse.ok}`);
    } catch (fetchErr) {
      console.error("DEBUG: Fetch failed completely:", fetchErr);
      throw new Error(`Fetch failed: ${fetchErr.message}`);
    }

    if (!rangeResponse.ok && rangeResponse.status !== 206) {
      const errorText = await rangeResponse.text();
      console.error("Range request failed:", rangeResponse.status, errorText);
      // await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ error: `Failed to download file header (Status ${rangeResponse.status}): ${errorText.substring(0, 100)}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decode as ISO-8859-1 (standard for SPED/EFD files) to avoid UTF-8 errors
    let dataToDecode: BufferSource;
    console.log("DEBUG: Starting stream reading logic...");
    
    if (rangeResponse.status === 200 && rangeResponse.body) {
      console.log("Server ignored Range header (200 OK), reading stream manually to avoid OOM");
      const reader = rangeResponse.body.getReader();
      const { value } = await reader.read();
      if (value) {
        dataToDecode = value; // Use the Uint8Array view directly
        console.log(`DEBUG: Stream chunk read, size: ${value.byteLength} bytes`);
      } else {
        dataToDecode = new ArrayBuffer(0);
        console.log("DEBUG: Stream empty");
      }
      // Important: cancel the stream to prevent downloading the rest of the file
      await reader.cancel();
      console.log("DEBUG: Stream cancelled");
    } else {
      dataToDecode = await rangeResponse.arrayBuffer();
      console.log(`DEBUG: ArrayBuffer read, size: ${dataToDecode.byteLength} bytes`);
    }
    
    const decoder = new TextDecoder("iso-8859-1");
    const text = decoder.decode(dataToDecode);
    
    console.log(`Decoded text preview (first 100 chars): ${text.substring(0, 100)}`);
    
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
      // await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ error: "Could not extract CNPJ from EFD file (Registro 0000)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Header extracted: CNPJ=${header.cnpj}, Nome=${header.razaoSocial}`);

    // Get or create filial
    let filialId: string;
    let filialCreated = false;

    // Check if filial exists (GLOBALLY by CNPJ, ignoring empresa_id to prevent duplicates)
    console.log(`Checking existing filial for CNPJ: ${header.cnpj} (Service Role Access)`);
    
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
      console.log(`Using existing filial: ${filialId} (Empresa: ${existingFilial.empresa_id})`);
      
      // Optional: Check if empresa_id matches. If not, we might want to warn or link it?
      // For now, we just use it to allow the import to proceed.
      if (existingFilial.empresa_id !== empresaId) {
         console.warn(`WARNING: Filial ${filialId} belongs to empresa ${existingFilial.empresa_id}, but import is for ${empresaId}.`);
      }
    } else {
      // Try to create - WRAPPED IN TRY/CATCH because supabase-js might throw
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
           throw createError; // Throw to catch block
        }

        filialId = newFilial.id;
        filialCreated = true;
        console.log(`Created new filial: ${filialId}`);

      } catch (err: any) {
         console.log("Error during filial creation:", err);
         console.log("Error code:", err.code, "Message:", err.message);

         // Handle duplicate key error (CNPJ already exists but maybe under different empresa_id or race condition)
         const errorMessage = (err.message || '').toLowerCase();
         const errorCode = err.code || '';
         
         if (errorCode === '23505' || errorMessage.includes('duplicate key') || errorMessage.includes('unique constraint')) {
            console.log("Duplicate CNPJ detected (caught in try/catch). Fetching existing filial by CNPJ...");
            
            const { data: duplicateFilial } = await supabase
              .from("filiais")
              .select("id")
              .eq("cnpj", header.cnpj)
              .maybeSingle();
              
            if (duplicateFilial) {
              filialId = duplicateFilial.id;
              console.log(`Recovered existing filial ID from duplicate error: ${filialId}`);
            } else {
              // If we still can't find it, it's a real error
              console.error("Filial exists but could not be retrieved:", err);
              return new Response(
                JSON.stringify({ error: "[FATAL v3-init] Filial exists but could not be retrieved: " + errorMessage }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
         } else {
           console.error("Error creating filial:", err);
           return new Response(
             JSON.stringify({ error: "[FATAL v3-init] Failed to create filial: " + errorMessage }),
             { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
           );
         }
      }
    }

    // Create import job
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
      // await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ error: "[FATAL v3-init] Failed to create import job: " + jobError.message + " | Code: " + jobError.code }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Import job created: ${job.id}`);

    // Start background processing (fire and forget)
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

    // Return immediately with job info
    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.id,
        status: "pending",
        message: `Importação iniciada para ${header.razaoSocial} (CNPJ: ${formatCNPJ(header.cnpj)}). Acompanhe o progresso em tempo real.`,
        filialId,
        filialCreated,
        cnpj: header.cnpj,
        razaoSocial: header.razaoSocial,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in parse-efd-v3:", error);
    const errorMessage = error instanceof Error ? 
      `${error.message} (Stack: ${error.stack})` : 
      `Unknown error: ${JSON.stringify(error)}`;
      
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});