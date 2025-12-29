import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 500;
const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150MB

// Only process these record types (fast prefix filter)
const VALID_PREFIXES = ["|0000|", "|C010|", "|C100|", "|C500|", "|C600|", "|D010|", "|D100|", "|D500|"];

interface EfdHeader {
  cnpj: string;
  razaoSocial: string;
  periodoInicio: string;
  periodoFim: string;
}

interface ProcessingContext {
  currentPeriod: string;
  currentCNPJ: string;
}

interface ParsedRecord {
  table: "mercadorias" | "energia_agua" | "fretes";
  data: Record<string, any>;
}

function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  return parseFloat(value.replace(",", ".")) || 0;
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

function processLine(
  line: string,
  context: ProcessingContext
): { record: ParsedRecord | null; context: ProcessingContext } {
  // Fast prefix filter - skip lines that don't start with valid prefixes
  if (!VALID_PREFIXES.some(p => line.startsWith(p))) {
    return { record: null, context };
  }

  const fields = line.split("|");
  if (fields.length < 2) {
    return { record: null, context };
  }

  const registro = fields[1];
  let record: ParsedRecord | null = null;

  switch (registro) {
    case "0000":
      // Header - Extract period
      if (fields.length > 9) {
        context.currentPeriod = getPeriodFromHeader(fields);
        context.currentCNPJ = fields[9]?.replace(/\D/g, "") || "";
      }
      break;

    case "C010":
      // Estabelecimento bloco C - Update context CNPJ if present
      if (fields.length > 2 && fields[2]) {
        context.currentCNPJ = fields[2].replace(/\D/g, "");
      }
      break;

    case "D010":
      // Estabelecimento bloco D - Update context CNPJ if present
      if (fields.length > 2 && fields[2]) {
        context.currentCNPJ = fields[2].replace(/\D/g, "");
      }
      break;

    case "C100":
      // NF-e documento -> mercadorias
      // Layout: |C100|IND_OPER|IND_EMIT|...|VL_DOC(idx 11)|...|VL_PIS(idx 23)|VL_COFINS(idx 25)|
      if (fields.length > 11) {
        const indOper = fields[2];
        const tipo = indOper === "0" ? "entrada" : "saida";
        const valorDoc = parseNumber(fields[11]);
        
        if (valorDoc > 0) {
          record = {
            table: "mercadorias",
            data: {
              tipo,
              mes_ano: context.currentPeriod,
              ncm: null,
              descricao: `NF-e ${fields[8] || ""}`.trim().substring(0, 200) || "NF-e",
              valor: valorDoc,
              pis: parseNumber(fields[23]),
              cofins: parseNumber(fields[25]),
              icms: 0,
              ipi: 0,
            },
          };
        }
      }
      break;

    case "C500":
      // Energia Elétrica/Água -> energia_agua
      // Layout: |C500|IND_OPER|IND_EMIT|COD_PART|COD_MOD|...|VL_DOC(idx 10)|VL_PIS(idx 16)|VL_COFINS(idx 18)|
      if (fields.length > 10) {
        const indOper = fields[2];
        const tipoOperacao = indOper === "0" ? "entrada" : "saida";
        const codMod = fields[5] || "";
        // COD_MOD: 06 = energia elétrica, 29 = água
        const tipoServico = codMod === "06" ? "energia" : codMod === "29" ? "agua" : "outros";
        const cnpjFornecedor = fields[4]?.replace(/\D/g, "") || null;
        const valorDoc = parseNumber(fields[10]);

        if (valorDoc > 0) {
          record = {
            table: "energia_agua",
            data: {
              tipo_operacao: tipoOperacao,
              tipo_servico: tipoServico,
              cnpj_fornecedor: cnpjFornecedor,
              descricao: `${tipoServico === "energia" ? "Energia Elétrica" : tipoServico === "agua" ? "Água" : "Serviço"} - ${fields[7] || ""}`.trim().substring(0, 200),
              mes_ano: context.currentPeriod,
              valor: valorDoc,
              pis: parseNumber(fields[16]),
              cofins: parseNumber(fields[18]),
            },
          };
        }
      }
      break;

    case "C600":
      // Consolidação diária de NF -> mercadorias
      // Layout: |C600|COD_MOD|COD_MUN|SER|...|VL_DOC(idx 7)|VL_PIS(idx 15)|VL_COFINS(idx 16)|
      if (fields.length > 7) {
        const valorDoc = parseNumber(fields[7]);
        
        if (valorDoc > 0) {
          record = {
            table: "mercadorias",
            data: {
              tipo: "saida", // C600 é consolidação de saída
              mes_ano: context.currentPeriod,
              ncm: null,
              descricao: `Consolidação NF ${fields[2] || ""} ${fields[3] || ""}`.trim().substring(0, 200) || "Consolidação diária",
              valor: valorDoc,
              pis: parseNumber(fields[15]),
              cofins: parseNumber(fields[16]),
              icms: 0,
              ipi: 0,
            },
          };
        }
      }
      break;

    case "D100":
      // CT-e (transporte) -> fretes
      // Layout: |D100|IND_OPER|IND_EMIT|...|COD_PART(idx 5)|...|VL_DOC(idx 14)|VL_PIS(idx 24)|VL_COFINS(idx 26)|
      if (fields.length > 14) {
        const indOper = fields[2];
        const tipo = indOper === "0" ? "entrada" : "saida";
        const cnpjTransportadora = fields[5]?.replace(/\D/g, "") || null;
        const valorDoc = parseNumber(fields[14]);

        if (valorDoc > 0) {
          record = {
            table: "fretes",
            data: {
              tipo,
              mes_ano: context.currentPeriod,
              ncm: null,
              descricao: `CT-e ${fields[8] || ""}`.trim().substring(0, 200) || "Conhecimento de Transporte",
              cnpj_transportadora: cnpjTransportadora,
              valor: valorDoc,
              pis: parseNumber(fields[24]),
              cofins: parseNumber(fields[26]),
            },
          };
        }
      }
      break;

    case "D500":
      // Telecom/Comunicação -> fretes
      // Layout: |D500|IND_OPER|IND_EMIT|...|COD_PART(idx 4)|...|VL_DOC(idx 11)|VL_PIS(idx 17)|VL_COFINS(idx 19)|
      if (fields.length > 11) {
        const indOper = fields[2];
        const tipo = indOper === "0" ? "entrada" : "saida";
        const cnpjFornecedor = fields[4]?.replace(/\D/g, "") || null;
        const valorDoc = parseNumber(fields[11]);

        if (valorDoc > 0) {
          record = {
            table: "fretes",
            data: {
              tipo,
              mes_ano: context.currentPeriod,
              ncm: null,
              descricao: `Telecom/Comunicação ${fields[7] || ""}`.trim().substring(0, 200) || "Serviço de Comunicação",
              cnpj_transportadora: cnpjFornecedor,
              valor: valorDoc,
              pis: parseNumber(fields[17]),
              cofins: parseNumber(fields[19]),
            },
          };
        }
      }
      break;
  }

  return { record, context };
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

interface BatchBuffers {
  mercadorias: any[];
  energia_agua: any[];
  fretes: any[];
}

interface InsertCounts {
  mercadorias: number;
  energia_agua: number;
  fretes: number;
}

async function processFileInBatches(
  supabase: any,
  file: File,
  filialId: string,
  batchSize: number
): Promise<{ counts: InsertCounts; error: string | null }> {
  const reader = file.stream()
    .pipeThrough(new TextDecoderStream())
    .getReader();

  let buffer = "";
  const batches: BatchBuffers = {
    mercadorias: [],
    energia_agua: [],
    fretes: [],
  };
  const counts: InsertCounts = {
    mercadorias: 0,
    energia_agua: 0,
    fretes: 0,
  };
  let context: ProcessingContext = {
    currentPeriod: "",
    currentCNPJ: "",
  };
  let linesProcessed = 0;

  const flushBatch = async (table: keyof BatchBuffers): Promise<string | null> => {
    if (batches[table].length === 0) return null;

    const { error } = await supabase.from(table).insert(batches[table]);
    if (error) {
      console.error(`Insert error for ${table}:`, error);
      return error.message;
    }

    counts[table] += batches[table].length;
    console.log(`Inserted batch: ${batches[table].length} records into ${table}, total: ${counts[table]}`);
    batches[table] = [];
    return null;
  };

  const flushAllBatches = async (): Promise<string | null> => {
    for (const table of ["mercadorias", "energia_agua", "fretes"] as const) {
      const err = await flushBatch(table);
      if (err) return err;
    }
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
        linesProcessed++;
        
        const result = processLine(line, context);
        context = result.context;

        if (result.record) {
          const { table, data } = result.record;
          batches[table].push({
            ...data,
            filial_id: filialId,
          });

          if (batches[table].length >= batchSize) {
            const err = await flushBatch(table);
            if (err) return { counts, error: err };
          }
        }

        // Log progress every 100k lines
        if (linesProcessed % 100000 === 0) {
          console.log(`Progress: ${linesProcessed} lines processed`);
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const result = processLine(buffer, context);
      if (result.record) {
        const { table, data } = result.record;
        batches[table].push({
          ...data,
          filial_id: filialId,
        });
      }
    }

    // Final flush
    const err = await flushAllBatches();
    if (err) return { counts, error: err };

    console.log(`Finished processing ${linesProcessed} lines`);
    return { counts, error: null };
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

    const totalRecords = result.counts.mercadorias + result.counts.energia_agua + result.counts.fretes;

    if (totalRecords === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          counts: result.counts,
          totalRecords: 0,
          filialId,
          filialCreated,
          cnpj: header.cnpj,
          razaoSocial: header.razaoSocial,
          message: filialCreated
            ? `Filial criada (CNPJ: ${formatCNPJ(header.cnpj)}), mas nenhum registro encontrado no arquivo.`
            : `Nenhum registro encontrado no arquivo.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully inserted ${totalRecords} records for filial ${filialId}:`, result.counts);

    return new Response(
      JSON.stringify({
        success: true,
        counts: result.counts,
        totalRecords,
        filialId,
        filialCreated,
        cnpj: header.cnpj,
        razaoSocial: header.razaoSocial,
        message: filialCreated
          ? `Filial criada automaticamente (CNPJ: ${formatCNPJ(header.cnpj)}). Importados ${totalRecords} registros.`
          : `Importados ${totalRecords} registros para ${header.razaoSocial} (CNPJ: ${formatCNPJ(header.cnpj)}).`,
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