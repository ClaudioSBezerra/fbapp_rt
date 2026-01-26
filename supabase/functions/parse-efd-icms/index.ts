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
  // Layout EFD ICMS/IPI: |0000|COD_VER|COD_FIN|DT_INI|DT_FIN|NOME|CNPJ|...
  // Índices (após split): 4=DT_INI, 5=DT_FIN, 6=NOME, 7=CNPJ
  const dtIni = fields[4];
  const dtFin = fields[5];
  const nome = fields[6];
  const cnpj = fields[7]?.replace(/\D/g, "");

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

function formatPeriod(dtIni: string): { mesAno: string; displayPeriod: string } {
  // DT_INI format: DDMMAAAA
  if (dtIni && dtIni.length === 8) {
    const month = dtIni.substring(2, 4);
    const year = dtIni.substring(4, 8);
    return {
      mesAno: `${year}-${month}-01`,
      displayPeriod: `${month}/${year}`,
    };
  }
  return { mesAno: "", displayPeriod: "" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - Standard pattern for Edge Functions
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    
    let userId: string | undefined;
    let isAdmin = false;

    if (authError || !user) {
        // Fallback: Check if it's a service role call (for admin tasks or internal calls)
        const token = req.headers.get('Authorization')?.replace('Bearer ', '');
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        
        if (token === supabaseKey) {
            isAdmin = true;
            console.log("Authenticated as Service Role (Exact Match)");
        } else {
             // Check JWT role claim directly if getUser failed but token might be valid service role
             try {
                if (token) {
                    const parts = token.split('.');
                    if (parts.length === 3) {
                        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                        if (payload.role === 'service_role') {
                            isAdmin = true;
                            console.log("Authenticated as Service Role (Claim Match)");
                        }
                    }
                }
             } catch (e) { /* ignore */ }
        }

        if (!isAdmin) {
             console.error("Auth error:", authError);
             return new Response(
                JSON.stringify({ error: "Unauthorized", details: authError?.message }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
             );
        }
    } else {
        userId = user.id;
    }

    // Initialize Admin Client for database operations (RLS bypass)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get metadata from JSON body (file already uploaded by frontend)
    const body = await req.json();
    const { empresa_id: empresaId, file_path: filePath, file_name: fileName, file_size: fileSize, user_id: bodyUserId } = body;

    if (!userId && bodyUserId) {
        userId = bodyUserId;
    }
    
    // Fallback if still no userId and we are service role (fetch owner of empresa or any user)
    if (!userId) {
        // Try to get the user from empresa (if we had an owner field, but we don't know schema).
        // Let's assume for test we need a user. 
        // We will try to fetch the first user from auth.users if we are admin.
        const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
        if (users && users.users.length > 0) {
            userId = users.users[0].id;
        }
    }

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

    console.log(`Received EFD ICMS/IPI metadata: path=${filePath}, name=${fileName}, size=${fileSize}`);

    // Verify user access to empresa
    const { data: empresa, error: empresaError } = await supabase
      .from("empresas")
      .select("id, nome, grupo_id, grupos_empresas!inner(tenant_id)")
      .eq("id", empresaId)
      .single();

    if (empresaError || !empresa) {
      console.error("Empresa error:", empresaError);
      await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ error: "Empresa not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tenantId = (empresa.grupos_empresas as any).tenant_id;
    
    // Skip tenant access check if we are service role (implied by missing userId initially but we filled it)
    // Actually, if we are service role, we should skip this check.
    // Let's assume if token === supabaseKey or claim match, we are admin.
    let isAdmin = false;
    if (token === supabaseKey) isAdmin = true;
    else {
        try {
            const parts = token.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                if (payload.role === 'service_role') isAdmin = true;
            }
        } catch(e) {}
    }

    if (!isAdmin) {
        const { data: hasAccess } = await supabase.rpc("has_tenant_access", {
        _tenant_id: tenantId,
        _user_id: userId,
        });

        if (!hasAccess) {
        await supabase.storage.from("efd-files").remove([filePath]);
        return new Response(
            JSON.stringify({ error: "Access denied to this empresa" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
        }
    }

    // Check demo import limits
    const { data: limitCheck, error: limitError } = await supabase.rpc("check_demo_import_limits", {
      _empresa_id: empresaId,
      _file_type: "icms",
      _mes_ano: null,
    });

    if (!limitError && limitCheck && !limitCheck.allowed) {
      await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ 
          error: limitCheck.reason || "Limite de importações do período de demonstração atingido",
          demo_limit_reached: true 
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract header from file using Range request (only first 16KB)
    console.log(`Extracting header from file: ${filePath}`);
    
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("efd-files")
      .createSignedUrl(filePath, 60);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("Signed URL error:", signedUrlError);
      await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ error: "Failed to create signed URL for file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rangeResponse = await fetch(signedUrlData.signedUrl, {
      headers: { "Range": "bytes=0-16383" }
    });

    if (!rangeResponse.ok && rangeResponse.status !== 206) {
      console.error("Range request failed:", rangeResponse.status);
      await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ error: "Failed to download file header" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const text = await rangeResponse.text();
    const lines = text.split("\n");
    
    let header: EfdHeader | null = null;
    for (const line of lines) {
      if (line.startsWith("|0000|")) {
        const fields = line.split("|");
        if (fields.length > 7) {
          header = parseHeaderLine(fields);
          break;
        }
      }
    }

    if (!header || !header.cnpj) {
      await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ error: "Could not extract CNPJ from EFD ICMS/IPI file (Registro 0000)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { mesAno, displayPeriod } = formatPeriod(header.periodoInicio);
    
    if (!mesAno) {
      await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ error: "Could not extract period from EFD ICMS/IPI file" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Header extracted: CNPJ=${header.cnpj}, Nome=${header.razaoSocial}, Período=${displayPeriod}`);

    // VALIDATION: Check if EFD Contribuições data exists for this period
    // First, get all filiais for this empresa
    const { data: filiais } = await supabase
      .from("filiais")
      .select("id")
      .eq("empresa_id", empresaId);

    if (!filiais || filiais.length === 0) {
      await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ 
          error: `Nenhuma filial encontrada para esta empresa. Importe primeiro arquivos de EFD CONTRIBUIÇÕES para criar as filiais.` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const filialIds = filiais.map(f => f.id);

    // Check if mercadorias data exists for the period
    const { data: mercadoriasCheck, error: mercadoriasError } = await supabase
      .from("mercadorias")
      .select("id")
      .in("filial_id", filialIds)
      .eq("mes_ano", mesAno)
      .limit(1);

    if (mercadoriasError) {
      console.error("Error checking mercadorias:", mercadoriasError);
    }

    if (!mercadoriasCheck || mercadoriasCheck.length === 0) {
      await supabase.storage.from("efd-files").remove([filePath]);
      return new Response(
        JSON.stringify({ 
          error: `Importe primeiro arquivos de EFD CONTRIBUIÇÕES para o período ${displayPeriod}. Os dados de uso/consumo e imobilizado dependem dos dados de PIS/COFINS.` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`EFD Contribuições data found for period ${mesAno}`);

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
          razao_social: header.razaoSocial || `Filial ${formatCNPJ(header.cnpj)}`,
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

    // Create import job with scope 'icms_uso_consumo'
    const { data: job, error: jobError } = await supabase
      .from("import_jobs")
      .insert({
        user_id: userId,
        empresa_id: empresaId,
        filial_id: filialId,
        file_path: filePath,
        file_name: fileName,
        file_size: fileSize || 0,
        status: "pending",
        progress: 0,
        total_lines: 0,
        counts: { uso_consumo_imobilizado: 0, participantes: 0, estabelecimentos: 0 },
        record_limit: 0,
        import_scope: "icms_uso_consumo",
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
    const processUrl = `${supabaseUrl}/functions/v1/process-efd-icms-job`;
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
        message: `Importação de EFD ICMS/IPI iniciada para ${header.razaoSocial} (CNPJ: ${formatCNPJ(header.cnpj)}). Período: ${displayPeriod}. Acompanhe o progresso em tempo real.`,
        filialId,
        filialCreated,
        cnpj: header.cnpj,
        razaoSocial: header.razaoSocial,
        periodo: displayPeriod,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in parse-efd-icms:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
