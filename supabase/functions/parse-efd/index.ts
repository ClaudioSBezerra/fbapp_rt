import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 500;
const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150MB

interface ParsedMercadoria {
  tipo: "entrada" | "saida";
  mes_ano: string;
  ncm: string | null;
  descricao: string | null;
  valor: number;
  pis: number;
  cofins: number;
  icms: number;
  ipi: number;
}

interface EfdHeader {
  cnpj: string;
  razaoSocial: string;
  periodoInicio: string;
  periodoFim: string;
}

interface ProcessingState {
  currentPeriod: string;
  currentMercadoria: Partial<ParsedMercadoria> | null;
}

function parseHeaderLine(fields: string[]): EfdHeader | null {
  const dtIni = fields[6]; // DDMMYYYY
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

function getPeriodFromHeader(fields: string[]): string {
  const dtIni = fields[6];
  if (dtIni && dtIni.length === 8) {
    const month = dtIni.substring(2, 4);
    const year = dtIni.substring(4, 8);
    return `${year}-${month}-01`;
  }
  return "";
}

function processLine(
  line: string,
  state: ProcessingState
): { completed: ParsedMercadoria | null; state: ProcessingState } {
  const fields = line.split("|");
  if (fields.length < 2) {
    return { completed: null, state };
  }

  const registro = fields[1];
  let completed: ParsedMercadoria | null = null;

  // Registro 0000 - Extract period
  if (registro === "0000" && fields.length > 9) {
    state.currentPeriod = getPeriodFromHeader(fields);
  }

  // Registro C100 - Documento de entrada/saída (NF-e)
  if (registro === "C100" && fields.length > 7) {
    const indOper = fields[2];
    const tipo = indOper === "0" ? "entrada" : "saida";
    const valorDoc = parseFloat(fields[7]?.replace(",", ".") || "0");

    state.currentMercadoria = {
      tipo,
      mes_ano: state.currentPeriod,
      valor: valorDoc,
      pis: 0,
      cofins: 0,
      icms: 0,
      ipi: 0,
      ncm: null,
      descricao: null,
    };
  }

  // Registro C170 - Itens do documento
  if (registro === "C170" && fields.length > 12 && state.currentMercadoria) {
    const ncm = fields[8] || null;
    const descricao = fields[4] || null;
    const valorItem = parseFloat(fields[7]?.replace(",", ".") || "0");

    if (ncm || descricao) {
      state.currentMercadoria.ncm = ncm;
      state.currentMercadoria.descricao = descricao?.substring(0, 200);
      state.currentMercadoria.valor = valorItem;
    }
  }

  // Registro C175 - Registro Analítico do Documento
  if (registro === "C175" && fields.length > 7) {
    const vlPis = parseFloat(fields[6]?.replace(",", ".") || "0");
    const vlCofins = parseFloat(fields[7]?.replace(",", ".") || "0");

    if (state.currentMercadoria) {
      state.currentMercadoria.pis = vlPis;
      state.currentMercadoria.cofins = vlCofins;
    }
  }

  // Registro M100 - Crédito de PIS
  if (registro === "M100" && fields.length > 7) {
    const vlCredPis = parseFloat(fields[7]?.replace(",", ".") || "0");
    if (state.currentMercadoria && state.currentMercadoria.tipo === "entrada") {
      state.currentMercadoria.pis = (state.currentMercadoria.pis || 0) + vlCredPis;
    }
  }

  // Registro M500 - Crédito de COFINS
  if (registro === "M500" && fields.length > 7) {
    const vlCredCofins = parseFloat(fields[7]?.replace(",", ".") || "0");
    if (state.currentMercadoria && state.currentMercadoria.tipo === "entrada") {
      state.currentMercadoria.cofins = (state.currentMercadoria.cofins || 0) + vlCredCofins;
    }
  }

  // Ao encontrar registro de fechamento do documento, salvar mercadoria
  if ((registro === "C190" || registro === "C990") && state.currentMercadoria) {
    if (state.currentMercadoria.valor && state.currentMercadoria.valor > 0) {
      completed = state.currentMercadoria as ParsedMercadoria;
    }
    state.currentMercadoria = null;
  }

  // Bloco F - Demais documentos (Serviços)
  if (registro === "F100" && fields.length > 10) {
    const indOper = fields[2];
    const tipo = indOper === "0" ? "entrada" : "saida";
    const vlOper = parseFloat(fields[6]?.replace(",", ".") || "0");
    const vlPis = parseFloat(fields[8]?.replace(",", ".") || "0");
    const vlCofins = parseFloat(fields[10]?.replace(",", ".") || "0");
    const descricao = fields[3] || "Serviço";

    if (vlOper > 0) {
      completed = {
        tipo,
        mes_ano: state.currentPeriod,
        ncm: null,
        descricao: descricao.substring(0, 200),
        valor: vlOper,
        pis: vlPis,
        cofins: vlCofins,
        icms: 0,
        ipi: 0,
      };
    }
  }

  return { completed, state };
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
        const fields = line.split("|");
        if (fields[1] === "0000" && fields.length > 9) {
          await reader.cancel();
          return parseHeaderLine(fields);
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

async function processFileInBatches(
  supabase: any,
  file: File,
  filialId: string,
  batchSize: number
): Promise<{ totalInserted: number; error: string | null }> {
  const reader = file.stream()
    .pipeThrough(new TextDecoderStream())
    .getReader();

  let buffer = "";
  let batch: any[] = [];
  let totalInserted = 0;
  let state: ProcessingState = {
    currentPeriod: "",
    currentMercadoria: null,
  };

  const flushBatch = async (): Promise<string | null> => {
    if (batch.length === 0) return null;

    const { error } = await supabase.from("mercadorias").insert(batch);
    if (error) {
      console.error("Insert error:", error);
      return error.message;
    }

    totalInserted += batch.length;
    console.log(`Inserted batch: ${batch.length} records, total: ${totalInserted}`);
    batch = [];
    return null;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const result = processLine(line, state);
        state = result.state;

        if (result.completed) {
          batch.push({
            ...result.completed,
            filial_id: filialId,
          });

          if (batch.length >= batchSize) {
            const err = await flushBatch();
            if (err) return { totalInserted, error: err };
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const result = processLine(buffer, state);
      if (result.completed) {
        batch.push({
          ...result.completed,
          filial_id: filialId,
        });
      }
    }

    // Final flush
    const err = await flushBatch();
    if (err) return { totalInserted, error: err };

    return { totalInserted, error: null };
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Reader already closed
    }
  }
}

function formatCNPJ(cnpj: string): string {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: `Arquivo muito grande. Máximo: ${MAX_FILE_SIZE / 1024 / 1024}MB` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing EFD file: ${file.name}, size: ${file.size} bytes`);

    // Verify user access to empresa
    const { data: empresa, error: empresaError } = await supabase
      .from("empresas")
      .select("id, grupo_id, grupos_empresas!inner(tenant_id)")
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

    // PHASE 1: Extract header (streaming - only first lines)
    const header = await extractHeader(file);

    if (!header || !header.cnpj) {
      return new Response(
        JSON.stringify({ error: "Could not extract CNPJ from EFD file (Registro 0000)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Header extracted: CNPJ=${header.cnpj}, Nome=${header.razaoSocial}`);

    // PHASE 2: Get or create filial
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

    // PHASE 3: Process file in streaming batches
    const result = await processFileInBatches(supabase, file, filialId, BATCH_SIZE);

    if (result.error) {
      return new Response(
        JSON.stringify({ error: "Failed to save records: " + result.error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (result.totalInserted === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          count: 0,
          filialId,
          filialCreated,
          cnpj: header.cnpj,
          razaoSocial: header.razaoSocial,
          message: filialCreated
            ? `Filial criada (CNPJ: ${formatCNPJ(header.cnpj)}), mas nenhum registro de mercadoria encontrado no arquivo.`
            : `Nenhum registro de mercadoria encontrado no arquivo.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully inserted ${result.totalInserted} mercadorias for filial ${filialId}`);

    return new Response(
      JSON.stringify({
        success: true,
        count: result.totalInserted,
        filialId,
        filialCreated,
        cnpj: header.cnpj,
        razaoSocial: header.razaoSocial,
        message: filialCreated
          ? `Filial criada automaticamente (CNPJ: ${formatCNPJ(header.cnpj)}). Importados ${result.totalInserted} registros.`
          : `Importados ${result.totalInserted} registros para ${header.razaoSocial} (CNPJ: ${formatCNPJ(header.cnpj)}).`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing EFD:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
