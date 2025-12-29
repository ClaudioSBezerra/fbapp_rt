import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

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

async function extractHeader(file: File): Promise<EfdHeader | null> {
  const reader = file.stream()
    .pipeThrough(new TextDecoderStream())
    .getReader();

  let buffer = "";
  let linesRead = 0;
  const MAX_HEADER_LINES = 100;

  try {
    while (linesRead < MAX_HEADER_LINES) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("|0000|")) {
          const fields = line.split("|");
          if (fields.length > 9) {
            await reader.cancel();
            return parseHeaderLine(fields);
          }
        }
        linesRead++;
        if (linesRead >= MAX_HEADER_LINES) break;
      }
    }
  } catch (e) {
    console.error("Error extracting header:", e);
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Reader already closed
    }
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

    // Get file and empresa_id from FormData
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const empresaId = formData.get("empresa_id") as string;

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!empresaId) {
      return new Response(
        JSON.stringify({ error: "No empresa_id provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: `Arquivo muito grande. Máximo: ${MAX_FILE_SIZE / 1024 / 1024}MB` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Received EFD file: ${file.name}, size: ${file.size} bytes`);

    // Verify user access to empresa
    const { data: empresa, error: empresaError } = await supabase
      .from("empresas")
      .select("id, nome, grupo_id, grupos_empresas!inner(tenant_id)")
      .eq("id", empresaId)
      .single();

    if (empresaError || !empresa) {
      console.error("Empresa error:", empresaError);
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
      return new Response(
        JSON.stringify({ error: "Access denied to this empresa" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract header to validate file
    const header = await extractHeader(file);

    if (!header || !header.cnpj) {
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
        return new Response(
          JSON.stringify({ error: "Failed to create filial: " + createError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      filialId = newFilial.id;
      filialCreated = true;
      console.log(`Created new filial: ${filialId}`);
    }

    // Upload file to Storage
    const timestamp = Date.now();
    const filePath = `${user.id}/${timestamp}_${file.name}`;
    
    const fileArrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from("efd-files")
      .upload(filePath, fileArrayBuffer, {
        contentType: "text/plain",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: "Failed to upload file: " + uploadError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`File uploaded to: ${filePath}`);

    // Create import job
    const { data: job, error: jobError } = await supabase
      .from("import_jobs")
      .insert({
        user_id: user.id,
        empresa_id: empresaId,
        filial_id: filialId,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        status: "pending",
        progress: 0,
        total_lines: 0,
        counts: { mercadorias: 0, energia_agua: 0, fretes: 0 },
      })
      .select()
      .single();

    if (jobError) {
      console.error("Job creation error:", jobError);
      // Clean up uploaded file
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
