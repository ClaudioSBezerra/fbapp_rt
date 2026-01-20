import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 500;
const PROGRESS_UPDATE_INTERVAL = 5000;
const MAX_LINES_PER_CHUNK = 100000;
const MAX_EXECUTION_TIME_MS = 45000;
const INTERMEDIATE_SAVE_INTERVAL = 50000;

// Only process C block records for uso/consumo/imobilizado
const VALID_PREFIXES = ["|0000|", "|0140|", "|0150|", "|C010|", "|C100|", "|C170|"];

// CFOPs for uso/consumo and imobilizado
const CFOP_USO_CONSUMO = ["1556", "2556"];
const CFOP_IMOBILIZADO = ["1551", "2551"];
const VALID_CFOPS = [...CFOP_USO_CONSUMO, ...CFOP_IMOBILIZADO];

interface Participante {
  codPart: string;
  nome: string;
  cnpj: string | null;
  cpf: string | null;
  ie: string | null;
  codMun: string | null;
}

interface C100Context {
  indOper: string;
  codPart: string | null;
  numDoc: string;
  dtES: string; // Data de entrada/saída
}

interface ProcessingContext {
  currentPeriod: string;
  currentCNPJ: string;
  currentFilialId: string | null;
  currentC100: C100Context | null;
  filialMap: Map<string, string>;
  participantesMap: Map<string, Participante>;
  estabelecimentosMap: Map<string, string>;
}

interface BatchBuffers {
  uso_consumo_imobilizado: any[];
  participantes: any[];
}

interface InsertCounts {
  uso_consumo_imobilizado: number;
  participantes: number;
  estabelecimentos: number;
}

function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  return parseFloat(value.replace(",", ".")) || 0;
}

function getPeriodFromHeader(fields: string[]): string {
  // EFD ICMS/IPI: |0000|...|DT_INI|... where DT_INI is at index 4
  const dtIni = fields[4] || '';
  
  if (dtIni && dtIni.length === 8) {
    const month = dtIni.substring(2, 4);
    const year = dtIni.substring(4, 8);
    return `${year}-${month}-01`;
  }
  
  console.warn(`getPeriodFromHeader: Invalid date format: "${dtIni}"`);
  return "";
}

function isRecoverableStreamError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const recoverablePatterns = [
    'error reading a body from connection',
    'connection closed',
    'stream closed',
    'network error',
    'econnreset',
    'socket hang up',
    'connection reset',
    'premature close',
  ];
  return recoverablePatterns.some(pattern => 
    message.toLowerCase().includes(pattern.toLowerCase())
  );
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

    if (job.status === "cancelled") {
      console.log(`Job ${jobId}: Already cancelled, skipping processing`);
      return new Response(
        JSON.stringify({ success: false, message: "Job was cancelled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (job.status === "completed") {
      console.log(`Job ${jobId}: Already completed`);
      return new Response(
        JSON.stringify({ success: true, message: "Job already completed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startByte = job.bytes_processed || 0;
    const chunkNumber = (job.chunk_number || 0) + 1;
    const isResuming = startByte > 0;

    console.log(`Job ${jobId}: Chunk ${chunkNumber}, ${isResuming ? `resuming from byte ${startByte}` : 'starting fresh'}`);

    if (!isResuming) {
      await supabase
        .from("import_jobs")
        .update({ status: "processing", started_at: new Date().toISOString() })
        .eq("id", jobId);
    }

    // Create signed URL with retry logic
    const createSignedUrlWithRetry = async (maxRetries: number = 3): Promise<string | null> => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const { data, error } = await supabase.storage
            .from("efd-files")
            .createSignedUrl(job.file_path, 3600);
          
          if (error) {
            console.error(`Signed URL attempt ${attempt} failed:`, error);
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
              continue;
            }
            return null;
          }
          
          if (data?.signedUrl) return data.signedUrl;
        } catch (e) {
          console.error(`Signed URL attempt ${attempt} threw exception:`, e);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
          }
        }
      }
      return null;
    };

    const signedUrl = await createSignedUrlWithRetry(3);

    if (!signedUrl) {
      await supabase
        .from("import_jobs")
        .update({ 
          status: "failed", 
          error_message: "Failed to create signed URL after 3 attempts.",
          completed_at: new Date().toISOString() 
        })
        .eq("id", jobId);
      return new Response(
        JSON.stringify({ error: "Failed to create signed URL" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fetchHeaders: HeadersInit = {};
    if (startByte > 0) {
      fetchHeaders['Range'] = `bytes=${startByte}-`;
    }

    const fetchResponse = await fetch(signedUrl, { headers: fetchHeaders });
    if (!fetchResponse.ok || !fetchResponse.body) {
      if (fetchResponse.status === 416) {
        await supabase
          .from("import_jobs")
          .update({ status: "completed", progress: 100, completed_at: new Date().toISOString() })
          .eq("id", jobId);
        return new Response(
          JSON.stringify({ success: true, message: "File fully processed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      await supabase
        .from("import_jobs")
        .update({ 
          status: "failed", 
          error_message: `Failed to fetch file: ${fetchResponse.status}`,
          completed_at: new Date().toISOString() 
        })
        .eq("id", jobId);
      return new Response(
        JSON.stringify({ error: "Failed to fetch file" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const chunkStartTime = Date.now();

    const batches: BatchBuffers = {
      uso_consumo_imobilizado: [],
      participantes: [],
    };

    const existingCounts = job.counts as any || { uso_consumo_imobilizado: 0, participantes: 0, estabelecimentos: 0 };
    const counts: InsertCounts = {
      uso_consumo_imobilizado: existingCounts.uso_consumo_imobilizado || 0,
      participantes: existingCounts.participantes || 0,
      estabelecimentos: existingCounts.estabelecimentos || 0,
    };

    // Fetch tenant_id via empresa -> grupo_empresas
    const { data: empresaData } = await supabase
      .from("empresas")
      .select("grupo_id")
      .eq("id", job.empresa_id)
      .single();
    
    const { data: grupoData } = await supabase
      .from("grupos_empresas")
      .select("tenant_id")
      .eq("id", empresaData?.grupo_id)
      .single();
    
    const tenantId = grupoData?.tenant_id;
    if (!tenantId) {
      throw new Error("Could not determine tenant_id for empresa");
    }

    // Pre-load filiais
    const { data: existingFiliais } = await supabase
      .from("filiais")
      .select("id, cnpj")
      .eq("empresa_id", job.empresa_id);
    
    const filialMap = new Map<string, string>(
      existingFiliais?.map((f: { cnpj: string; id: string }) => [f.cnpj, f.id]) || []
    );

    const existingContext = existingCounts.context || null;
    if (existingContext?.filialMapEntries) {
      for (const [cnpj, id] of existingContext.filialMapEntries) {
        filialMap.set(cnpj, id);
      }
    }

    let context: ProcessingContext = {
      currentPeriod: existingContext?.currentPeriod || "",
      currentCNPJ: existingContext?.currentCNPJ || "",
      currentFilialId: existingContext?.currentFilialId || job.filial_id,
      currentC100: null,
      filialMap,
      participantesMap: new Map(),
      estabelecimentosMap: new Map(),
    };

    let bytesProcessedInChunk = 0;

    const flushBatch = async (table: keyof BatchBuffers): Promise<string | null> => {
      if (batches[table].length === 0) return null;

      const onConflictMap: Record<keyof BatchBuffers, string> = {
        uso_consumo_imobilizado: 'filial_id,mes_ano,num_doc,cfop,cod_part',
        participantes: 'filial_id,cod_part',
      };
      
      const { error } = await supabase.from(table).upsert(batches[table], { 
        onConflict: onConflictMap[table],
        ignoreDuplicates: true 
      });
      
      if (error) {
        if (error.message.includes('constraint') || error.message.includes('unique')) {
          const { error: insertError } = await supabase.from(table).insert(batches[table]);
          if (insertError) {
            console.error(`Insert error for ${table}:`, insertError);
            return insertError.message;
          }
        } else {
          console.error(`Upsert error for ${table}:`, error);
          return error.message;
        }
      }

      counts[table] += batches[table].length;
      batches[table] = [];
      return null;
    };

    const flushAllBatches = async (): Promise<string | null> => {
      for (const table of ["uso_consumo_imobilizado", "participantes"] as const) {
        const err = await flushBatch(table);
        if (err) return err;
      }
      return null;
    };

    const reader = fetchResponse.body.pipeThrough(new TextDecoderStream()).getReader();
    
    let buffer = "";
    let linesProcessedInChunk = 0;
    let totalLinesProcessed = job.total_lines || 0;
    let lastProgressUpdate = 0;
    let estimatedTotalLines = Math.ceil(job.file_size / 200);

    let shouldContinueNextChunk = false;
    let reachedChunkLimit = false;

    while (true) {
      const elapsedTime = Date.now() - chunkStartTime;
      if (elapsedTime > MAX_EXECUTION_TIME_MS || linesProcessedInChunk >= MAX_LINES_PER_CHUNK) {
        shouldContinueNextChunk = true;
        reachedChunkLimit = true;
        reader.cancel();
        break;
      }

      const { done, value } = await reader.read();
      
      if (done) {
        if (buffer.trim()) {
          await processLine(buffer.trim(), context, batches, job.empresa_id, tenantId, supabase, counts);
          linesProcessedInChunk++;
          totalLinesProcessed++;
        }
        break;
      }

      bytesProcessedInChunk += new TextEncoder().encode(value).length;
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const elapsedTimeInLoop = Date.now() - chunkStartTime;
        if (elapsedTimeInLoop > MAX_EXECUTION_TIME_MS || linesProcessedInChunk >= MAX_LINES_PER_CHUNK) {
          shouldContinueNextChunk = true;
          reachedChunkLimit = true;
          break;
        }

        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        await processLine(trimmedLine, context, batches, job.empresa_id, tenantId, supabase, counts);
        linesProcessedInChunk++;
        totalLinesProcessed++;

        // Flush batches when they reach size limit
        if (batches.uso_consumo_imobilizado.length >= BATCH_SIZE) {
          const err = await flushBatch("uso_consumo_imobilizado");
          if (err) throw new Error(`Insert error: ${err}`);
        }
        if (batches.participantes.length >= BATCH_SIZE) {
          const err = await flushBatch("participantes");
          if (err) {
            console.warn(`Job ${jobId}: Failed to flush participantes: ${err}`);
            batches.participantes = [];
          }
        }

        // Update progress
        if (linesProcessedInChunk - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
          const { data: currentJob } = await supabase
            .from("import_jobs")
            .select("status")
            .eq("id", jobId)
            .single();

          if (currentJob?.status === "cancelled") {
            reader.cancel();
            return new Response(
              JSON.stringify({ success: false, message: "Job was cancelled by user" }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const progress = Math.min(95, Math.round((totalLinesProcessed / estimatedTotalLines) * 100));
          const shouldSaveIntermediate = linesProcessedInChunk % INTERMEDIATE_SAVE_INTERVAL < PROGRESS_UPDATE_INTERVAL;
          
          await supabase
            .from("import_jobs")
            .update({ 
              progress, 
              total_lines: totalLinesProcessed, 
              counts,
              ...(shouldSaveIntermediate ? { bytes_processed: startByte + bytesProcessedInChunk } : {})
            })
            .eq("id", jobId);
          
          lastProgressUpdate = linesProcessedInChunk;
          console.log(`Job ${jobId}: Progress ${progress}% (${totalLinesProcessed} lines, uso_consumo: ${counts.uso_consumo_imobilizado})`);
        }
      }

      if (reachedChunkLimit) break;
    }

    // Final flush
    const flushErr = await flushAllBatches();
    if (flushErr) {
      await supabase
        .from("import_jobs")
        .update({ 
          status: "failed", 
          error_message: `Final flush error: ${flushErr}`,
          completed_at: new Date().toISOString() 
        })
        .eq("id", jobId);
      throw new Error(`Final flush error: ${flushErr}`);
    }

    if (shouldContinueNextChunk) {
      const newBytesProcessed = startByte + bytesProcessedInChunk;
      const progress = Math.min(95, Math.round((totalLinesProcessed / estimatedTotalLines) * 100));
      
      await supabase
        .from("import_jobs")
        .update({ 
          bytes_processed: newBytesProcessed,
          chunk_number: chunkNumber,
          progress,
          total_lines: totalLinesProcessed,
          counts: { 
            ...counts,
            context: {
              currentPeriod: context.currentPeriod,
              currentCNPJ: context.currentCNPJ,
              currentFilialId: context.currentFilialId,
              filialMapEntries: Array.from(context.filialMap.entries()),
            }
          }
        })
        .eq("id", jobId);

      // Re-invoke self
      const selfUrl = `${supabaseUrl}/functions/v1/process-efd-icms-job`;
      fetch(selfUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ job_id: jobId }),
      }).catch(err => console.error(`Job ${jobId}: Failed to invoke next chunk:`, err));

      return new Response(
        JSON.stringify({ success: true, message: `Chunk ${chunkNumber} completed`, counts }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Job completed
    console.log(`Job ${jobId}: Completed! uso_consumo_imobilizado: ${counts.uso_consumo_imobilizado}`);

    await supabase
      .from("import_jobs")
      .update({ status: "refreshing_views", progress: 98 })
      .eq("id", jobId);

    // Refresh materialized views using centralized RPC
    console.log(`Job ${jobId}: Refreshing materialized views via centralized RPC...`);
    
    let refreshResult: any = null;
    try {
      const { data: result, error } = await supabase.rpc('refresh_all_materialized_views');
      
      if (error) {
        console.warn(`Job ${jobId}: Failed to refresh views via RPC:`, error.message);
      } else {
        refreshResult = result;
        console.log(`Job ${jobId}: Refreshed ${result.refreshed_count}/${result.total_views} views in ${result.duration_ms}ms`);
        
        if (result.failed_count > 0) {
          console.warn(`Job ${jobId}: Failed views:`, result.views_failed);
        }
      }
    } catch (err) {
      console.warn(`Job ${jobId}: Exception refreshing views:`, err);
    }

    await supabase
      .from("import_jobs")
      .update({ 
        status: "completed", 
        progress: 100,
        total_lines: totalLinesProcessed,
        counts: { 
          ...counts, 
          refresh_success: refreshResult?.success ?? false,
          views_refreshed: refreshResult?.refreshed_count ?? 0
        },
        completed_at: new Date().toISOString() 
      })
      .eq("id", jobId);

    // Delete file
    await supabase.storage.from("efd-files").remove([job.file_path]);

    return new Response(
      JSON.stringify({ success: true, job_id: jobId, counts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Job ${jobId}: Error:`, error);
    
    if (jobId && isRecoverableStreamError(error)) {
      const { data: currentJob } = await supabase
        .from("import_jobs")
        .select("bytes_processed")
        .eq("id", jobId)
        .single();
      
      if (currentJob?.bytes_processed > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const selfUrl = `${supabaseUrl}/functions/v1/process-efd-icms-job`;
        fetch(selfUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
          body: JSON.stringify({ job_id: jobId }),
        }).catch(() => {});
        
        return new Response(
          JSON.stringify({ message: "Stream error recovered, retrying" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    
    if (jobId) {
      await supabase
        .from("import_jobs")
        .update({ status: "failed", error_message: errorMessage, completed_at: new Date().toISOString() })
        .eq("id", jobId);
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Process a single line
async function processLine(
  line: string,
  context: ProcessingContext,
  batches: BatchBuffers,
  empresaId: string,
  tenantId: string,
  supabase: any,
  counts: InsertCounts
): Promise<void> {
  if (!VALID_PREFIXES.some(p => line.startsWith(p))) {
    return;
  }

  const fields = line.split("|");
  if (fields.length < 2) return;

  const registro = fields[1];

  switch (registro) {
    case "0000":
      // EFD ICMS/IPI header: |0000|...|DT_INI|...
      if (fields.length > 7) {
        context.currentPeriod = getPeriodFromHeader(fields);
        context.currentCNPJ = fields[7]?.replace(/\D/g, "") || "";
        console.log(`Parsed 0000: period=${context.currentPeriod}, CNPJ=${context.currentCNPJ}`);
      }
      break;

    case "0140":
      // Registro de Estabelecimentos
      // |0140|COD_EST|NOME|CNPJ|...
      if (fields.length > 4) {
        const codEst = fields[2] || "";
        const nome = fields[3] || "";
        const cnpj = fields[4]?.replace(/\D/g, "") || "";
        
        if (codEst && cnpj) {
          context.estabelecimentosMap.set(cnpj, codEst);
          
          if (context.filialMap.has(cnpj)) {
            context.currentFilialId = context.filialMap.get(cnpj)!;
            context.currentCNPJ = cnpj;
            await supabase.from("filiais").update({ cod_est: codEst }).eq("id", context.currentFilialId);
          } else {
            const { data: newFilial } = await supabase
              .from("filiais")
              .insert({ empresa_id: empresaId, cnpj, razao_social: nome || `Filial ${cnpj}`, cod_est: codEst })
              .select("id").single();
            
            if (newFilial) {
              context.filialMap.set(cnpj, newFilial.id);
              context.currentFilialId = newFilial.id;
              context.currentCNPJ = cnpj;
              counts.estabelecimentos++;
            }
          }
        }
      }
      break;

    case "0150":
      // Participantes
      // |0150|COD_PART|NOME|COD_PAIS|CNPJ|CPF|IE|COD_MUN|...
      if (fields.length > 3 && context.currentFilialId) {
        const codPart = fields[2] || "";
        const nome = (fields[3] || "").substring(0, 100);
        const cnpj = fields.length > 5 ? (fields[5]?.replace(/\D/g, "") || null) : null;
        const cpf = fields.length > 6 ? (fields[6]?.replace(/\D/g, "") || null) : null;
        const ie = fields.length > 7 ? (fields[7] || null) : null;
        const codMun = fields.length > 8 ? (fields[8] || null) : null;
        
        if (codPart && nome) {
          context.participantesMap.set(codPart, { codPart, nome, cnpj, cpf, ie, codMun });
          batches.participantes.push({
            filial_id: context.currentFilialId,
            cod_part: codPart,
            nome,
            cnpj,
            cpf,
            ie,
            cod_mun: codMun,
          });
        }
      }
      break;

    case "C010":
      // Abertura do Bloco C
      // |C010|CNPJ|...
      if (fields.length > 2) {
        const cnpj = fields[2]?.replace(/\D/g, "") || "";
        context.currentCNPJ = cnpj;
        
        if (context.filialMap.has(cnpj)) {
          context.currentFilialId = context.filialMap.get(cnpj)!;
        }
      }
      break;

    case "C100":
      // Documento Fiscal (NF-e)
      // EFD ICMS/IPI: |C100|IND_OPER|IND_EMIT|COD_PART|COD_MOD|COD_SIT|SER|NUM_DOC|CHV_NFE|DT_DOC|DT_E_S|...
      // Índices: 2=IND_OPER, 4=COD_PART, 8=NUM_DOC, 9=CHV_NFE, 10=DT_DOC, 11=DT_E_S
      if (fields.length > 11) {
        context.currentC100 = {
          indOper: fields[2] || "0",
          codPart: fields[4] || null,
          numDoc: fields[8] || fields[9] || "",
          dtES: fields[11] || fields[10] || "",
        };
      }
      break;

    case "C170":
      // Item do Documento (C170 filho de C100)
      // EFD ICMS/IPI: |C170|NUM_ITEM|COD_ITEM|DESCR_COMPL|QTD|UNID|VL_ITEM|VL_DESC|IND_MOV|CST_ICMS|CFOP|COD_NAT|VL_BC_ICMS|ALIQ_ICMS|VL_ICMS|VL_BC_ICMS_ST|...
      // Índices relevantes: 7=VL_ITEM, 11=CFOP, 15=VL_ICMS
      // Campos corretos: 15=VL_ICMS, 30=VL_PIS, 36=VL_COFINS
      if (fields.length > 11 && context.currentC100 && context.currentFilialId) {
        const cfop = fields[11] || "";
        
        // Only process if CFOP is for uso/consumo or imobilizado
        if (!VALID_CFOPS.includes(cfop)) {
          return;
        }
        
        const valor = parseNumber(fields[7]);
        if (valor <= 0) return;
        
        const icms = fields.length > 15 ? parseNumber(fields[15]) : 0;
        const pis = fields.length > 30 ? parseNumber(fields[30]) : 0;    // Campo 30 = VL_PIS
        const cofins = fields.length > 36 ? parseNumber(fields[36]) : 0; // Campo 36 = VL_COFINS
        
        // Determine tipo_operacao based on CFOP
        let tipoOperacao: string;
        if (CFOP_IMOBILIZADO.includes(cfop)) {
          tipoOperacao = "imobilizado";
        } else {
          tipoOperacao = "uso_consumo";
        }
        
        // Get participante nome for description
        let descricao = `Doc ${context.currentC100.numDoc}`;
        if (context.currentC100.codPart && context.participantesMap.has(context.currentC100.codPart)) {
          const part = context.participantesMap.get(context.currentC100.codPart)!;
          descricao = `${part.nome} - Doc ${context.currentC100.numDoc}`.substring(0, 200);
        }
        
        // Use DT_E_S for mes_ano if available, otherwise use period from 0000
        let mesAno = context.currentPeriod;
        const dtES = context.currentC100.dtES;
        if (dtES && dtES.length === 8) {
          const month = dtES.substring(2, 4);
          const year = dtES.substring(4, 8);
          mesAno = `${year}-${month}-01`;
        }
        
        if (!mesAno) {
          console.warn("Skipping C170 with empty mes_ano");
          return;
        }
        
        batches.uso_consumo_imobilizado.push({
          tenant_id: tenantId,
          filial_id: context.currentFilialId,
          mes_ano: mesAno,
          tipo_operacao: tipoOperacao,
          cfop,
          cod_part: context.currentC100.codPart,
          num_doc: context.currentC100.numDoc,
          valor,
          valor_icms: icms,
          valor_pis: pis,
          valor_cofins: cofins,
        });
      }
      break;
  }
}
