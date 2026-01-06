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
    const supabase = createClient(supabaseUrl, supabaseKey);

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
      await supabase.storage.from("efd-files").remove([filePath]);
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
      await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ error: "Access denied to this empresa" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract header from file (stream only first few KB to extract header)
    console.log(`Extracting header from file: ${filePath}`);
    
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("efd-files")
      .download(filePath);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ error: "Failed to download file for header extraction" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Read only first 8KB to extract header (not entire file)
    const firstChunk = fileData.slice(0, 8192);
    const text = await firstChunk.text();
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
      await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ error: "Could not extract CNPJ from EFD file (Registro 0000)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Header extracted: CNPJ=${header.cnpj}, Nome=${header.razaoSocial}`);

    // Get or create filial
    let filialId: string;
    let filialCreated = false;

    const { data: existingFilial } = await supabase
      .from("filiais")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("cnpj", header.cnpj)
      .maybeSingle();

    if (existingFilial) {
      filialId = existingFilial.id;
      console.log(`Using existing filial: ${filialId}`);
    } else {
      const { data: newFilial, error: createError } = await supabase
        .from("filiais")
        .insert({
          empresa_id: empresaId,
          cnpj: header.cnpj,
          razao_social: header.razaoSocial,
          nome_fantasia: null,
        })
        .select()
        .single();

      if (createError) {
        console.error("Error creating filial:", createError);
        await supabase.storage.from("efd-files").remove([filePath]);
        return new Response(
          JSON.stringify({ error: "Failed to create filial: " + createError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      filialId = newFilial.id;
      filialCreated = true;
      console.log(`Created new filial: ${filialId}`);
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
      await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ error: "Failed to create import job: " + jobError.message }),
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
    console.error("Error in parse-efd:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
