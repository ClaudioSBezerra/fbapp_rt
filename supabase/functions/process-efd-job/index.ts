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

// Test limit: only import 100 C100 records from first filial
const C100_LIMIT_FIRST_FILIAL = 100;

interface C100LimitContext {
  firstFilialCNPJ: string | null;
  c100CountFirstFilial: number;
}

function processLine(
  line: string,
  context: ProcessingContext,
  c100Limit?: C100LimitContext
): { record: ParsedRecord | null; context: ProcessingContext; c100Record?: { table: "mercadorias"; data: Record<string, any> } } {
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
      // C100 handled separately with limits
      break;

    case "C500":
      if (fields.length > 10) {
        const indOper = fields[2];
        const tipoOperacao = indOper === "0" ? "entrada" : "saida";
        const codMod = fields[5] || "";
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
      if (fields.length > 7) {
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
              icms: 0,
              ipi: 0,
            },
          };
        }
      }
      break;

    case "D100":
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

    // Update job status to processing
    await supabase
      .from("import_jobs")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", jobId);

    console.log(`Job ${jobId}: Downloading file from ${job.file_path}`);

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("efd-files")
      .download(job.file_path);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      await supabase
        .from("import_jobs")
        .update({ 
          status: "failed", 
          error_message: "Failed to download file: " + (downloadError?.message || "Unknown error"),
          completed_at: new Date().toISOString() 
        })
        .eq("id", jobId);
      return new Response(
        JSON.stringify({ error: "Failed to download file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Job ${jobId}: File downloaded, starting streaming processing`);

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

    // Stream processing using TextDecoderStream
    const stream = fileData.stream();
    const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
    
    let buffer = "";
    let linesProcessed = 0;
    let lastProgressUpdate = 0;
    let estimatedTotalLines = Math.ceil(job.file_size / 200); // Rough estimate: ~200 bytes per line

    // C100 limit control for testing
    let firstFilialCNPJ: string | null = null;
    let c100CountFirstFilial = 0;

    console.log(`Job ${jobId}: Estimated total lines: ${estimatedTotalLines}`);

    // Helper to process C100 with limits
    const processC100WithLimit = (line: string, ctx: ProcessingContext): ParsedRecord | null => {
      const fields = line.split("|");
      if (fields.length <= 11) return null;

      // Only import C100 from first filial, up to limit
      if (firstFilialCNPJ === null) {
        firstFilialCNPJ = ctx.currentCNPJ;
        console.log(`Job ${jobId}: First filial CNPJ = ${firstFilialCNPJ}`);
      }

      // Skip C100 from other filiais
      if (ctx.currentCNPJ !== firstFilialCNPJ) {
        return null;
      }

      // Check limit for first filial
      if (c100CountFirstFilial >= C100_LIMIT_FIRST_FILIAL) {
        return null;
      }

      const indOper = fields[2];
      const tipo = indOper === "0" ? "entrada" : "saida";
      const valorDoc = parseNumber(fields[11]);
      
      if (valorDoc > 0) {
        c100CountFirstFilial++;
        return {
          table: "mercadorias",
          data: {
            tipo,
            mes_ano: ctx.currentPeriod,
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
      return null;
    };

    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        // Process remaining buffer
        if (buffer.trim()) {
          const trimmedLine = buffer.trim();
          const result = processLine(trimmedLine, context);
          context = result.context;
          
          // Check for C100 separately
          if (trimmedLine.startsWith("|C100|")) {
            const c100Record = processC100WithLimit(trimmedLine, context);
            if (c100Record) {
              batches[c100Record.table].push({
                ...c100Record.data,
                filial_id: job.filial_id,
              });
            }
          } else if (result.record) {
            const { table, data } = result.record;
            batches[table].push({
              ...data,
              filial_id: job.filial_id,
            });
          }
          linesProcessed++;
        }
        break;
      }

      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const result = processLine(trimmedLine, context);
        context = result.context;

        // Check for C100 separately with limit
        if (trimmedLine.startsWith("|C100|")) {
          const c100Record = processC100WithLimit(trimmedLine, context);
          if (c100Record) {
            batches[c100Record.table].push({
              ...c100Record.data,
              filial_id: job.filial_id,
            });

            if (batches[c100Record.table].length >= BATCH_SIZE) {
              const err = await flushBatch(c100Record.table);
              if (err) {
                await supabase
                  .from("import_jobs")
                  .update({ 
                    status: "failed", 
                    error_message: `Failed to insert ${c100Record.table}: ${err}`,
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
        } else if (result.record) {
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

    // Log C100 limit info
    console.log(`Job ${jobId}: C100 limit applied - first filial (${firstFilialCNPJ}): ${c100CountFirstFilial} records imported (limit: ${C100_LIMIT_FIRST_FILIAL})`);


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
