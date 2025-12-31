import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 500;
const PROGRESS_UPDATE_INTERVAL = 5000; // Update progress every 5k lines

// Only process these record types
const VALID_PREFIXES = ["|0000|", "|C010|", "|C100|", "|C500|", "|C600|", "|D010|", "|D100|", "|D500|"];

interface ProcessingContext {
  currentPeriod: string;
  currentCNPJ: string;
}

interface ParsedRecord {
  table: "mercadorias" | "energia_agua" | "fretes";
  data: Record<string, any>;
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

// Block limits control
interface BlockLimits {
  c100: { count: number; limit: number };
  c500: { count: number; limit: number };
  c600: { count: number; limit: number };
  d100: { count: number; limit: number };
  d500: { count: number; limit: number };
}

function createBlockLimits(c100Limit: number): BlockLimits {
  // Se c100Limit = 0, significa sem limite para todos (importação completa)
  // Se c100Limit > 0, aplica limite apenas ao C100, demais blocos sem limite
  return {
    c100: { count: 0, limit: c100Limit },  // Usa o limite definido
    c500: { count: 0, limit: 0 },          // Sempre sem limite - importa todos
    c600: { count: 0, limit: 0 },          // Sempre sem limite - importa todos
    d100: { count: 0, limit: 0 },          // Sempre sem limite - importa todos
    d500: { count: 0, limit: 0 },          // Sempre sem limite - importa todos
  };
}

function allLimitsReached(limits: BlockLimits): boolean {
  // Pegar apenas blocos que têm limite definido (limit > 0)
  const blocksWithLimits = Object.values(limits).filter(b => b.limit > 0);
  
  // Se nenhum bloco tem limite (todos = 0), nunca para antecipadamente
  if (blocksWithLimits.length === 0) return false;
  
  // Retorna true apenas se TODOS os blocos COM limite atingiram seus limites
  return blocksWithLimits.every(b => b.count >= b.limit);
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

function processLine(
  line: string,
  context: ProcessingContext
): { record: ParsedRecord | null; context: ProcessingContext; blockType?: string } {
  if (!VALID_PREFIXES.some(p => line.startsWith(p))) {
    return { record: null, context };
  }

  const fields = line.split("|");
  if (fields.length < 2) {
    return { record: null, context };
  }

  const registro = fields[1];
  let record: ParsedRecord | null = null;
  let blockType: string | undefined;

  switch (registro) {
    case "0000":
      if (fields.length > 9) {
        context.currentPeriod = getPeriodFromHeader(fields);
        context.currentCNPJ = fields[9]?.replace(/\D/g, "") || "";
      }
      break;

    case "C010":
    case "D010":
      if (fields.length > 2 && fields[2]) {
        context.currentCNPJ = fields[2].replace(/\D/g, "");
      }
      break;

    case "C100":
      // Layout EFD ICMS/IPI - C100 (após split com índice 0 vazio):
      // 2=IND_OPER, 8=NUM_DOC, 12=VL_DOC, 22=VL_ICMS, 25=VL_IPI, 26=VL_PIS, 27=VL_COFINS
      blockType = "c100";
      if (fields.length > 27) {
        const indOper = fields[2];
        const tipo = indOper === "0" ? "entrada" : "saida";
        const valorDoc = parseNumber(fields[12]); // Campo 12: VL_DOC
        
        if (valorDoc > 0) {
          record = {
            table: "mercadorias",
            data: {
              tipo,
              mes_ano: context.currentPeriod,
              ncm: null,
              descricao: `NF-e ${fields[8] || ""}`.trim().substring(0, 200) || "NF-e",
              valor: valorDoc,
              pis: parseNumber(fields[26]),    // Campo 26: VL_PIS
              cofins: parseNumber(fields[27]), // Campo 27: VL_COFINS
              icms: parseNumber(fields[22]),   // Campo 22: VL_ICMS
              ipi: parseNumber(fields[25]),    // Campo 25: VL_IPI
            },
          };
        }
      }
      break;

    case "C500":
      // Layout EFD ICMS/IPI - C500 (Energia/Água):
      // 2=IND_OPER, 4=COD_PART, 5=COD_MOD, 7=SER, 10=VL_DOC, 13=VL_ICMS, 16=VL_PIS, 18=VL_COFINS
      blockType = "c500";
      if (fields.length > 18) {
        const indOper = fields[2];
        const tipoOperacao = indOper === "0" ? "credito" : "debito";
        const codMod = fields[5] || "";
        // Only process energia (06) or agua (29), ignore other codes
        const tipoServico = codMod === "06" ? "energia" : codMod === "29" ? "agua" : null;
        const cnpjFornecedor = fields[4]?.replace(/\D/g, "") || null;
        const valorDoc = parseNumber(fields[10]);

        // Only create record if valid tipo_servico and valor > 0
        if (valorDoc > 0 && tipoServico !== null) {
          record = {
            table: "energia_agua",
            data: {
              tipo_operacao: tipoOperacao,
              tipo_servico: tipoServico,
              cnpj_fornecedor: cnpjFornecedor,
              descricao: `${tipoServico === "energia" ? "Energia Elétrica" : "Água"} - ${fields[7] || ""}`.trim().substring(0, 200),
              mes_ano: context.currentPeriod,
              valor: valorDoc,
              pis: parseNumber(fields[16]),
              cofins: parseNumber(fields[18]),
              icms: parseNumber(fields[13]),
            },
          };
        }
      }
      break;

    case "C600":
      // Layout EFD ICMS/IPI - C600 (Consolidação diária):
      // 2=COD_MOD, 3=COD_MUN, 7=VL_DOC, 12=VL_ICMS, 15=VL_PIS, 16=VL_COFINS
      blockType = "c600";
      if (fields.length > 16) {
        const valorDoc = parseNumber(fields[7]);
        
        if (valorDoc > 0) {
          record = {
            table: "mercadorias",
            data: {
              tipo: "saida",
              mes_ano: context.currentPeriod,
              ncm: null,
              descricao: `Consolidação NF ${fields[2] || ""} ${fields[3] || ""}`.trim().substring(0, 200) || "Consolidação diária",
              valor: valorDoc,
              pis: parseNumber(fields[15]),
              cofins: parseNumber(fields[16]),
              icms: parseNumber(fields[12]),
              ipi: 0,
            },
          };
        }
      }
      break;

    case "D100":
      // Layout EFD ICMS/IPI - D100 (CT-e):
      // 2=IND_OPER, 5=COD_PART, 8=NUM_DOC, 14=VL_DOC, 23=VL_ICMS, 24=VL_PIS, 26=VL_COFINS
      blockType = "d100";
      if (fields.length > 26) {
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
              icms: parseNumber(fields[23]),
            },
          };
        }
      }
      break;

    case "D500":
      // Layout EFD ICMS/IPI - D500 (Telecom/Comunicação):
      // 2=IND_OPER, 4=COD_PART, 7=SER, 11=VL_DOC, 14=VL_ICMS, 17=VL_PIS, 19=VL_COFINS
      blockType = "d500";
      if (fields.length > 19) {
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
              icms: parseNumber(fields[14]),
            },
          };
        }
      }
      break;
  }

  return { record, context, blockType };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let jobId: string | null = null;

  try {
    const body = await req.json();
    jobId = body.job_id;

    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting processing for job: ${jobId}`);

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("import_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      console.error("Job not found:", jobError);
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if job was cancelled before starting
    if (job.status === "cancelled") {
      console.log(`Job ${jobId}: Already cancelled, skipping processing`);
      return new Response(
        JSON.stringify({ success: false, message: "Job was cancelled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get record limit from job (0 = no limit)
    const recordLimit = job.record_limit || 0;
    console.log(`Job ${jobId}: Limit configuration - C100: ${recordLimit === 0 ? 'unlimited' : recordLimit}, C500/C600/D100/D500: unlimited`);

    // Update job status to processing
    await supabase
      .from("import_jobs")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", jobId);

    console.log(`Job ${jobId}: Creating signed URL for ${job.file_path}`);

    // Create signed URL for streaming (valid for 1 hour)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("efd-files")
      .createSignedUrl(job.file_path, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error("Signed URL error:", signedUrlError);
      await supabase
        .from("import_jobs")
        .update({ 
          status: "failed", 
          error_message: "Failed to create signed URL: " + (signedUrlError?.message || "Unknown error"),
          completed_at: new Date().toISOString() 
        })
        .eq("id", jobId);
      return new Response(
        JSON.stringify({ error: "Failed to create signed URL" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch file as stream - does NOT load entire file into memory
    const fetchResponse = await fetch(signedUrlData.signedUrl);
    if (!fetchResponse.ok || !fetchResponse.body) {
      console.error("Fetch error:", fetchResponse.status, fetchResponse.statusText);
      await supabase
        .from("import_jobs")
        .update({ 
          status: "failed", 
          error_message: `Failed to fetch file: ${fetchResponse.status} ${fetchResponse.statusText}`,
          completed_at: new Date().toISOString() 
        })
        .eq("id", jobId);
      return new Response(
        JSON.stringify({ error: "Failed to fetch file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Job ${jobId}: Stream connected, starting processing`);

    // STREAMING PROCESSING - read file chunk by chunk
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

    // Initialize block limits
    const blockLimits = createBlockLimits(recordLimit);

    const flushBatch = async (table: keyof BatchBuffers): Promise<string | null> => {
      if (batches[table].length === 0) return null;

      const { error } = await supabase.from(table).insert(batches[table]);
      if (error) {
        console.error(`Insert error for ${table}:`, error);
        return error.message;
      }

      counts[table] += batches[table].length;
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

    // Stream processing using TextDecoderStream - reads chunks without loading entire file
    const reader = fetchResponse.body.pipeThrough(new TextDecoderStream()).getReader();
    
    let buffer = "";
    let linesProcessed = 0;
    let lastProgressUpdate = 0;
    let estimatedTotalLines = Math.ceil(job.file_size / 200); // Rough estimate: ~200 bytes per line

    console.log(`Job ${jobId}: Estimated total lines: ${estimatedTotalLines}`);

    while (true) {
      // Check if all limits reached - exit early
      if (allLimitsReached(blockLimits)) {
        console.log(`Job ${jobId}: All block limits reached, stopping early`);
        reader.cancel();
        break;
      }

      const { done, value } = await reader.read();
      
      if (done) {
        // Process remaining buffer
        if (buffer.trim()) {
          const trimmedLine = buffer.trim();
          const result = processLine(trimmedLine, context);
          context = result.context;
          
          if (result.record && result.blockType) {
            const blockKey = result.blockType as keyof BlockLimits;
            // Check block limit
            if (blockLimits[blockKey].limit === 0 || blockLimits[blockKey].count < blockLimits[blockKey].limit) {
              blockLimits[blockKey].count++;
              const { table, data } = result.record;
              batches[table].push({
                ...data,
                filial_id: job.filial_id,
              });
            }
          }
          linesProcessed++;
        }
        break;
      }

      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        // Check if all limits reached
        if (allLimitsReached(blockLimits)) {
          console.log(`Job ${jobId}: All block limits reached during line processing`);
          break;
        }

        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const result = processLine(trimmedLine, context);
        context = result.context;

        if (result.record && result.blockType) {
          const blockKey = result.blockType as keyof BlockLimits;
          
          // Check block limit before processing
          if (blockLimits[blockKey].limit > 0 && blockLimits[blockKey].count >= blockLimits[blockKey].limit) {
            // Skip this record - limit reached for this block
            linesProcessed++;
            continue;
          }

          // Increment block counter
          blockLimits[blockKey].count++;
          
          const { table, data } = result.record;
          batches[table].push({
            ...data,
            filial_id: job.filial_id,
          });

          if (batches[table].length >= BATCH_SIZE) {
            const err = await flushBatch(table);
            if (err) {
              await supabase
                .from("import_jobs")
                .update({ 
                  status: "failed", 
                  error_message: `Failed to insert ${table}: ${err}`,
                  progress: Math.min(95, Math.round((linesProcessed / estimatedTotalLines) * 100)),
                  total_lines: linesProcessed,
                  counts,
                  completed_at: new Date().toISOString() 
                })
                .eq("id", jobId);
              throw new Error(`Insert error: ${err}`);
            }
          }
        }

        linesProcessed++;

        // Update progress periodically and check for cancellation
        if (linesProcessed - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
          // Check if job was cancelled
          const { data: currentJob } = await supabase
            .from("import_jobs")
            .select("status")
            .eq("id", jobId)
            .single();

          if (currentJob?.status === "cancelled") {
            console.log(`Job ${jobId}: Cancelled by user, stopping processing`);
            reader.cancel();
            return new Response(
              JSON.stringify({ success: false, message: "Job was cancelled by user" }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const progress = Math.min(95, Math.round((linesProcessed / estimatedTotalLines) * 100));
          await supabase
            .from("import_jobs")
            .update({ progress, total_lines: linesProcessed, counts })
            .eq("id", jobId);
          lastProgressUpdate = linesProcessed;
          console.log(`Job ${jobId}: Progress ${progress}% (${linesProcessed} lines, mercadorias: ${counts.mercadorias}, energia_agua: ${counts.energia_agua}, fretes: ${counts.fretes})`);
        }
      }
    }

    // Log block limits info
    console.log(`Job ${jobId}: Block counts - C100: ${blockLimits.c100.count}, C500: ${blockLimits.c500.count}, C600: ${blockLimits.c600.count}, D100: ${blockLimits.d100.count}, D500: ${blockLimits.d500.count}`);

    // Final flush
    const flushErr = await flushAllBatches();
    if (flushErr) {
      await supabase
        .from("import_jobs")
        .update({ 
          status: "failed", 
          error_message: `Final flush error: ${flushErr}`,
          progress: 100,
          total_lines: linesProcessed,
          counts,
          completed_at: new Date().toISOString() 
        })
        .eq("id", jobId);
      throw new Error(`Final flush error: ${flushErr}`);
    }

    const totalRecords = counts.mercadorias + counts.energia_agua + counts.fretes;
    console.log(`Job ${jobId}: Completed! Total lines: ${linesProcessed}, Total records: ${totalRecords}`);

    // Update job as completed
    await supabase
      .from("import_jobs")
      .update({ 
        status: "completed", 
        progress: 100,
        total_lines: linesProcessed,
        counts,
        completed_at: new Date().toISOString() 
      })
      .eq("id", jobId);

    // Delete file from storage
    const { error: deleteError } = await supabase.storage
      .from("efd-files")
      .remove([job.file_path]);
    
    if (deleteError) {
      console.warn(`Job ${jobId}: Failed to delete file:`, deleteError);
    } else {
      console.log(`Job ${jobId}: File deleted from storage`);
    }

    // Send email notification
    try {
      const emailUrl = `${supabaseUrl}/functions/v1/send-import-email`;
      const emailResponse = await fetch(emailUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ job_id: jobId }),
      });
      console.log(`Job ${jobId}: Email notification sent, status: ${emailResponse.status}`);
    } catch (emailErr) {
      console.warn(`Job ${jobId}: Failed to send email:`, emailErr);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        job_id: jobId,
        counts,
        total_records: totalRecords 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`Job ${jobId}: Error processing:`, error);
    
    if (jobId) {
      await supabase
        .from("import_jobs")
        .update({ 
          status: "failed", 
          error_message: error instanceof Error ? error.message : "Unknown error",
          completed_at: new Date().toISOString() 
        })
        .eq("id", jobId);
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
