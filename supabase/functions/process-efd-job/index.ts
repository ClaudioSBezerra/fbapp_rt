import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { TextLineStream } from "https://deno.land/std@0.168.0/streams/text_line_stream.ts";

// Declare EdgeRuntime for fire-and-forget background tasks
declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 1000;
const PROGRESS_UPDATE_INTERVAL = 5000;
const BLOCK_C_CHUNK_SIZE = 50000; // Process Block C in chunks to avoid timeout
const BLOCK_D_CHUNK_SIZE = 50000; // Process Block D in chunks to avoid timeout
const PARSING_CHUNK_SIZE = 200000; // Lines per parsing invocation for chunked streaming (increased)
const RAW_LINES_INSERT_BATCH_SIZE = 3000; // Batch size for inserting into efd_raw_lines (increased from 500)
const SELF_INVOKE_MAX_RETRIES = 7; // Increased from 5 to 7 for better resilience
const SELF_INVOKE_BASE_DELAY_MS = 2000; // Increased base delay for stability
const SELF_INVOKE_MAX_DELAY_MS = 45000; // Maximum delay cap (increased)

// ============================================================================
// REQUIRED RECORDS - Granular filtering to save only records we actually use
// This dramatically reduces data volume (from ~3.3M to ~250K lines for large files)
// ============================================================================
const REQUIRED_RECORDS = new Set([
  '0000', '0140', '0150',                                    // Block 0: Header, Filiais, Participantes
  'A010', 'A100',                                            // Block A: Estabelecimento, Documentos de serviços
  'C010', 'C100', 'C500', 'C600',                            // Block C: Estabelecimento, NFs, Energia/Água, Consolidação
  'D010', 'D100', 'D101', 'D105', 'D500', 'D501', 'D505',    // Block D: Estabelecimento, CTe, PIS/COFINS sobre frete
]);

// Helper function to calculate exponential backoff with jitter
function calculateBackoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 500; // Add 0-500ms jitter
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

// Helper function to self-invoke with retry mechanism
async function selfInvokeWithRetry(
  supabaseUrl: string, 
  supabaseKey: string, 
  jobId: string,
  supabase: any,
  maxRetries: number = SELF_INVOKE_MAX_RETRIES,
  baseDelayMs: number = SELF_INVOKE_BASE_DELAY_MS
): Promise<boolean> {
  const selfUrl = `${supabaseUrl}/functions/v1/process-efd-job`;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Job ${jobId}: Self-invoke attempt ${attempt}/${maxRetries}...`);
      
      const response = await fetch(selfUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ job_id: jobId }),
      });
      
      if (response.ok) {
        console.log(`Job ${jobId}: Self-invoke successful on attempt ${attempt}`);
        return true;
      }
      
      const status = response.status;
      console.warn(`Job ${jobId}: Self-invoke attempt ${attempt} failed with status ${status}`);
      
      if (attempt < maxRetries) {
        // Special handling for server temporarily unavailable errors (521/522)
        let delay: number;
        if (status === 521 || status === 522) {
          // More aggressive delays for server errors: 8s, 16s, 24s, 32s, 40s, 45s, 45s
          delay = Math.min(8000 * attempt, SELF_INVOKE_MAX_DELAY_MS);
          console.log(`Job ${jobId}: Server temporarily unavailable (${status}), extended wait ${delay}ms...`);
        } else if (status >= 500) {
          // Server errors: exponential backoff with higher base
          delay = calculateBackoffDelay(attempt, baseDelayMs * 2, SELF_INVOKE_MAX_DELAY_MS);
          console.log(`Job ${jobId}: Server error (${status}), waiting ${Math.round(delay)}ms...`);
        } else {
          delay = calculateBackoffDelay(attempt, baseDelayMs, SELF_INVOKE_MAX_DELAY_MS);
          console.log(`Job ${jobId}: Waiting ${Math.round(delay)}ms before retry (exponential backoff)...`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (err) {
      console.error(`Job ${jobId}: Self-invoke attempt ${attempt} error:`, err);
      
      if (attempt < maxRetries) {
        const delay = calculateBackoffDelay(attempt, baseDelayMs, SELF_INVOKE_MAX_DELAY_MS);
        console.log(`Job ${jobId}: Waiting ${Math.round(delay)}ms before retry after error...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`Job ${jobId}: All ${maxRetries} self-invoke attempts failed - marking as paused`);
  
  // Mark job as paused for manual intervention (instead of keeping it as 'processing')
  await supabase.from("import_jobs").update({ 
    status: "paused",
    error_message: "Conexão perdida durante processamento. Clique em 'Retomar' para continuar.",
  }).eq("id", jobId);
  
  return false;
}

// Valid prefixes by scope
const ALL_PREFIXES = ["|0000|", "|0140|", "|0150|", "|A010|", "|A100|", "|C010|", "|C100|", "|C500|", "|C600|", "|D010|", "|D100|", "|D101|", "|D105|", "|D500|", "|D501|", "|D505|"];
const ONLY_A_PREFIXES = ["|0000|", "|0140|", "|0150|", "|A010|", "|A100|"];
const ONLY_C_PREFIXES = ["|0000|", "|0140|", "|0150|", "|C010|", "|C100|", "|C500|", "|C600|"];
const ONLY_D_PREFIXES = ["|0000|", "|0140|", "|0150|", "|D010|", "|D100|", "|D101|", "|D105|", "|D500|", "|D501|", "|D505|"];

type ImportScope = 'all' | 'only_a' | 'only_c' | 'only_d';
type ProcessingPhase = 'pending' | 'parsing' | 'block_0' | 'block_d' | 'block_a' | 'block_c' | 'consolidating' | 'refreshing_views' | 'completed' | 'failed';

function getValidPrefixes(scope: ImportScope): string[] {
  switch (scope) {
    case 'only_a': return ONLY_A_PREFIXES;
    case 'only_c': return ONLY_C_PREFIXES;
    case 'only_d': return ONLY_D_PREFIXES;
    default: return ALL_PREFIXES;
  }
}

// ============================================================================
// INTERFACES
// ============================================================================

interface Participante {
  codPart: string;
  nome: string;
  cnpj: string | null;
  cpf: string | null;
  ie: string | null;
  codMun: string | null;
}

interface FilialInfo {
  cnpj: string;
  nome: string;
  codEst: string;
}

type EFDType = 'icms_ipi' | 'contribuicoes' | null;

interface RawC100Record {
  import_job_id: string;
  filial_id: string;
  mes_ano: string;
  tipo: string;
  cod_part: string | null;
  valor: number;
  pis: number;
  cofins: number;
  icms: number;
  ipi: number;
}

interface RawC500Record {
  import_job_id: string;
  filial_id: string;
  mes_ano: string;
  tipo_operacao: string;
  tipo_servico: string;
  cnpj_fornecedor: string | null;
  valor: number;
  pis: number;
  cofins: number;
  icms: number;
}

interface RawFretesRecord {
  import_job_id: string;
  filial_id: string;
  mes_ano: string;
  tipo: string;
  cnpj_transportadora: string | null;
  valor: number;
  pis: number;
  cofins: number;
  icms: number;
}

interface RawA100Record {
  import_job_id: string;
  filial_id: string;
  mes_ano: string;
  tipo: string;
  valor: number;
  pis: number;
  cofins: number;
  iss: number;
}

interface BlockContext {
  period: string;
  efdType: EFDType;
  filialMap: Map<string, string>;
  participantesMap: Map<string, Participante>;
  estabelecimentosMap: Map<string, FilialInfo>;
}

interface InsertCounts {
  raw_c100: number;
  raw_c500: number;
  raw_fretes: number;
  raw_a100: number;
  participantes: number;
  estabelecimentos: number;
  block_c_line_offset?: number;
  block_c_total_lines?: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  return parseFloat(value.replace(",", ".")) || 0;
}

function detectEFDType(fields: string[]): EFDType {
  const field4 = fields[4] || '';
  if (/^\d{8}$/.test(field4)) {
    const day = parseInt(field4.substring(0, 2), 10);
    const month = parseInt(field4.substring(2, 4), 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return 'icms_ipi';
    }
  }
  return 'contribuicoes';
}

function getPeriodFromHeader(fields: string[], efdType: EFDType): string {
  const dtIniIndex = efdType === 'icms_ipi' ? 4 : 6;
  const dtIni = fields[dtIniIndex] || '';
  
  if (dtIni && dtIni.length === 8) {
    const month = dtIni.substring(2, 4);
    const year = dtIni.substring(4, 8);
    return `${year}-${month}-01`;
  }
  
  console.warn(`getPeriodFromHeader: Invalid date format at index ${dtIniIndex}: "${dtIni}" for EFD type ${efdType}`);
  return "";
}

// ============================================================================
// NEW: CHUNKED PARSING WITH DIRECT DB INSERTION + RANGE REQUESTS
// Inserts lines directly into efd_raw_lines table during streaming
// Uses HTTP Range Requests to avoid re-downloading entire file each chunk
// ============================================================================

interface ChunkedInsertResult {
  hasMore: boolean;
  nextLineNumber: number;
  bytesProcessed: number;
  processedInChunk: number;
  linesFiltered: number;
  partialLine: string;
  blockCounts: { block0: number; blockA: number; blockC: number; blockD: number };
}

async function separateBlocksChunkedWithInsert(
  fetchResponse: Response,
  validPrefixes: string[],
  maxLines: number,
  jobId: string,
  supabase: any,
  initialLineNumber: number,
  partialLineFromPrevious: string
): Promise<ChunkedInsertResult> {
  const INSERT_BATCH_SIZE = RAW_LINES_INSERT_BATCH_SIZE;
  let currentBatch: { job_id: string; block_type: string; line_number: number; content: string }[] = [];
  let lineCount = initialLineNumber;
  let processedInChunk = 0;
  let linesFiltered = 0;
  let bytesProcessed = 0;
  let partialLine = '';
  const blockCounts = { block0: 0, blockA: 0, blockC: 0, blockD: 0 };

  const flushBatch = async () => {
    if (currentBatch.length === 0) return;
    const { error } = await supabase.from('efd_raw_lines').insert(currentBatch);
    if (error) {
      console.error(`Job ${jobId}: Insert batch error (${currentBatch.length} lines):`, error.message);
    }
    currentBatch = [];
  };

  console.log(`Job ${jobId}: separateBlocksChunkedWithInsert starting at line ${initialLineNumber}, max ${maxLines} lines, using Range Requests`);

  // Create a byte-counting passthrough stream
  const reader = fetchResponse.body!.getReader();
  const countingStream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      bytesProcessed += value.length;
      controller.enqueue(value);
    }
  });

  const lineStream = countingStream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream());

  let isFirstLine = true;

  for await (const rawLine of lineStream) {
    // Handle partial line from previous chunk (prepend to first line)
    let line = rawLine;
    if (isFirstLine && partialLineFromPrevious) {
      line = partialLineFromPrevious + rawLine;
      isFirstLine = false;
    }
    isFirstLine = false;

    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if this looks like an incomplete EFD line (doesn't start with |)
    // This can happen at chunk boundaries
    if (!trimmed.startsWith('|')) {
      // Might be a partial line at the end or corrupted - skip it
      continue;
    }
    
    lineCount++;
    processedInChunk++;
    
    // Check chunk limit - if we've processed maxLines, return early
    if (processedInChunk >= maxLines) {
      await flushBatch();
      console.log(`Job ${jobId}: Chunk limit reached at line ${lineCount}, bytes: ${bytesProcessed}, saved ${blockCounts.block0 + blockCounts.blockA + blockCounts.blockC + blockCounts.blockD} records, filtered ${linesFiltered}`);
      return {
        hasMore: true,
        nextLineNumber: lineCount,
        bytesProcessed,
        processedInChunk,
        linesFiltered,
        partialLine: '', // No partial line mid-processing
        blockCounts
      };
    }
    
    // GRANULAR FILTERING: Extract the specific record code (e.g., "C170" from "|C170|...")
    const pipeIndex = trimmed.indexOf('|', 1);
    if (pipeIndex === -1) {
      linesFiltered++;
      continue;
    }
    
    const registro = trimmed.substring(1, pipeIndex);
    
    // Only save records we actually need for processing
    if (!REQUIRED_RECORDS.has(registro)) {
      linesFiltered++;
      continue;
    }
    
    // Determine block type from first character
    const blockType = registro.charAt(0);
    if (!['0', 'A', 'C', 'D'].includes(blockType)) {
      linesFiltered++;
      continue;
    }
    
    // Update counters
    if (blockType === '0') blockCounts.block0++;
    else if (blockType === 'A') blockCounts.blockA++;
    else if (blockType === 'C') blockCounts.blockC++;
    else if (blockType === 'D') blockCounts.blockD++;
    
    currentBatch.push({ 
      job_id: jobId, 
      block_type: blockType, 
      line_number: lineCount, 
      content: trimmed 
    });
    
    if (currentBatch.length >= INSERT_BATCH_SIZE) {
      await flushBatch();
    }
  }

  await flushBatch();
  const totalSaved = blockCounts.block0 + blockCounts.blockA + blockCounts.blockC + blockCounts.blockD;
  const filterRate = processedInChunk > 0 ? ((linesFiltered / processedInChunk) * 100).toFixed(1) : '0';
  console.log(`Job ${jobId}: Parsing complete - ${lineCount} total lines, bytes: ${bytesProcessed}, saved ${totalSaved} records, filtered ${linesFiltered} (${filterRate}%)`);
  console.log(`Job ${jobId}: Block breakdown - Block 0: ${blockCounts.block0}, Block A: ${blockCounts.blockA}, Block C: ${blockCounts.blockC}, Block D: ${blockCounts.blockD}`);

  return {
    hasMore: false,
    nextLineNumber: lineCount,
    bytesProcessed,
    processedInChunk,
    linesFiltered,
    partialLine: '',
    blockCounts
  };
}

// ============================================================================
// BLOCK 0 PROCESSING - Extract context (period, filiais, participantes)
// NEW: Reads from efd_raw_lines table instead of in-memory array
// ============================================================================

async function processBlock0FromTable(
  supabase: any,
  job: any,
  jobId: string,
  counts: InsertCounts
): Promise<BlockContext> {
  console.log(`Job ${jobId}: Processing Block 0 from efd_raw_lines table`);
  
  // Fetch Block 0 lines from the table
  const { data: rawLines, error: fetchError } = await supabase
    .from('efd_raw_lines')
    .select('content')
    .eq('job_id', jobId)
    .eq('block_type', '0')
    .order('line_number', { ascending: true });

  if (fetchError) {
    console.error(`Job ${jobId}: Error fetching Block 0 lines:`, fetchError);
    throw new Error(`Failed to fetch Block 0 lines: ${fetchError.message}`);
  }

  const lines = rawLines?.map((r: { content: string }) => r.content) || [];
  console.log(`Job ${jobId}: Found ${lines.length} Block 0 lines in table`);

  const context: BlockContext = {
    period: '',
    efdType: null,
    filialMap: new Map(),
    participantesMap: new Map(),
    estabelecimentosMap: new Map(),
  };

  // Pre-load existing filiais
  const { data: existingFiliais } = await supabase
    .from("filiais")
    .select("id, cnpj")
    .eq("empresa_id", job.empresa_id);
  
  for (const f of existingFiliais || []) {
    context.filialMap.set(f.cnpj, f.id);
  }
  console.log(`Job ${jobId}: Pre-loaded ${context.filialMap.size} existing filiais`);

  const participantesBatch: any[] = [];
  const genericParticipantsCreated = new Set<string>();

  for (const line of lines) {
    const fields = line.split("|");
    const registro = fields[1];

    switch (registro) {
      case "0000":
        if (fields.length > 9) {
          context.efdType = detectEFDType(fields);
          context.period = getPeriodFromHeader(fields, context.efdType);
          console.log(`Job ${jobId}: Detected EFD type: ${context.efdType}, period: ${context.period}`);
        }
        break;

      case "0140":
        if (fields.length > 4) {
          const codEst = fields[2] || "";
          const nome = fields[3] || "";
          const cnpj = fields[4]?.replace(/\D/g, "") || "";
          
          if (codEst && cnpj) {
            context.estabelecimentosMap.set(cnpj, { cnpj, nome: nome || `Filial ${cnpj}`, codEst });
            
            // Create or update filial
            if (context.filialMap.has(cnpj)) {
              const filialId = context.filialMap.get(cnpj)!;
              await supabase.from("filiais").update({ cod_est: codEst, razao_social: nome }).eq("id", filialId);
            } else {
              const { data: newFilial } = await supabase.from("filiais")
                .insert({ empresa_id: job.empresa_id, cnpj, razao_social: nome, cod_est: codEst })
                .select("id").single();
              if (newFilial) {
                context.filialMap.set(cnpj, newFilial.id);
                counts.estabelecimentos++;
                console.log(`Job ${jobId}: Created filial ${cnpj} -> ${newFilial.id}`);
                
                // Create generic participants
                if (!genericParticipantsCreated.has(newFilial.id)) {
                  genericParticipantsCreated.add(newFilial.id);
                  const genericParticipants = [
                    { filial_id: newFilial.id, cod_part: '9999999999', nome: 'CONSUMIDOR FINAL', cnpj: null, cpf: null, ie: null, cod_mun: null },
                    { filial_id: newFilial.id, cod_part: '8888888888', nome: 'FORNECEDOR NÃO IDENTIFICADO', cnpj: null, cpf: null, ie: null, cod_mun: null },
                  ];
                  await supabase.from("participantes").upsert(genericParticipants, { onConflict: 'filial_id,cod_part', ignoreDuplicates: true });
                  counts.participantes += 2;
                }
              }
            }
          }
        }
        break;

      case "0150":
        if (fields.length > 3) {
          const codPart = fields[2] || "";
          const nome = (fields[3] || "").substring(0, 100);
          const cnpj = fields.length > 5 ? (fields[5]?.replace(/\D/g, "") || null) : null;
          const cpf = fields.length > 6 ? (fields[6]?.replace(/\D/g, "") || null) : null;
          const ie = fields.length > 7 ? (fields[7] || null) : null;
          const codMun = fields.length > 8 ? (fields[8] || null) : null;
          
          if (codPart && nome) {
            context.participantesMap.set(codPart, { codPart, nome, cnpj, cpf, ie, codMun });
          }
        }
        break;
    }
  }

  // Insert all participantes for all filiais
  for (const [_, filialId] of context.filialMap) {
    for (const [_, p] of context.participantesMap) {
      participantesBatch.push({
        filial_id: filialId,
        cod_part: p.codPart,
        nome: p.nome,
        cnpj: p.cnpj,
        cpf: p.cpf,
        ie: p.ie,
        cod_mun: p.codMun,
      });
      
      if (participantesBatch.length >= BATCH_SIZE) {
        const { error } = await supabase.from('participantes').upsert(participantesBatch, { 
          onConflict: 'filial_id,cod_part', 
          ignoreDuplicates: true 
        });
        if (error) console.warn(`Job ${jobId}: Failed to upsert participantes: ${error.message}`);
        counts.participantes += participantesBatch.length;
        participantesBatch.length = 0;
      }
    }
  }

  // Flush remaining participantes
  if (participantesBatch.length > 0) {
    await supabase.from('participantes').upsert(participantesBatch, { 
      onConflict: 'filial_id,cod_part', 
      ignoreDuplicates: true 
    });
    counts.participantes += participantesBatch.length;
  }

  console.log(`Job ${jobId}: Block 0 completed - ${context.filialMap.size} filiais, ${context.participantesMap.size} participantes`);
  
  return context;
}

// ============================================================================
// BLOCK 0 QUICK - Extract context only (no inserts) for resumption
// NEW: Reads from efd_raw_lines table
// ============================================================================

async function processBlock0QuickFromTable(
  supabase: any,
  empresaId: string,
  jobId: string
): Promise<BlockContext> {
  console.log(`Job ${jobId}: Quick processing Block 0 for context from table`);
  
  // Fetch Block 0 lines from the table
  const { data: rawLines, error: fetchError } = await supabase
    .from('efd_raw_lines')
    .select('content')
    .eq('job_id', jobId)
    .eq('block_type', '0')
    .order('line_number', { ascending: true });

  if (fetchError) {
    console.error(`Job ${jobId}: Error fetching Block 0 lines for context:`, fetchError);
    throw new Error(`Failed to fetch Block 0 lines: ${fetchError.message}`);
  }

  const lines = rawLines?.map((r: { content: string }) => r.content) || [];
  
  const context: BlockContext = {
    period: '',
    efdType: null,
    filialMap: new Map(),
    participantesMap: new Map(),
    estabelecimentosMap: new Map(),
  };

  // Pre-load existing filiais (needed for context)
  const { data: existingFiliais } = await supabase
    .from("filiais")
    .select("id, cnpj")
    .eq("empresa_id", empresaId);
  
  for (const f of existingFiliais || []) {
    context.filialMap.set(f.cnpj, f.id);
  }

  for (const line of lines) {
    const fields = line.split("|");
    const registro = fields[1];

    switch (registro) {
      case "0000":
        if (fields.length > 9) {
          context.efdType = detectEFDType(fields);
          context.period = getPeriodFromHeader(fields, context.efdType);
        }
        break;

      case "0140":
        if (fields.length > 4) {
          const codEst = fields[2] || "";
          const nome = fields[3] || "";
          const cnpj = fields[4]?.replace(/\D/g, "") || "";
          
          if (codEst && cnpj) {
            context.estabelecimentosMap.set(cnpj, { cnpj, nome: nome || `Filial ${cnpj}`, codEst });
          }
        }
        break;

      case "0150":
        if (fields.length > 3) {
          const codPart = fields[2] || "";
          const nome = (fields[3] || "").substring(0, 100);
          const cnpj = fields.length > 5 ? (fields[5]?.replace(/\D/g, "") || null) : null;
          const cpf = fields.length > 6 ? (fields[6]?.replace(/\D/g, "") || null) : null;
          const ie = fields.length > 7 ? (fields[7] || null) : null;
          const codMun = fields.length > 8 ? (fields[8] || null) : null;
          
          if (codPart && nome) {
            context.participantesMap.set(codPart, { codPart, nome, cnpj, cpf, ie, codMun });
          }
        }
        break;
    }
  }

  console.log(`Job ${jobId}: Quick Block 0 - period: ${context.period}, ${context.filialMap.size} filiais`);
  
  return context;
}

// ============================================================================
// BLOCK A PROCESSING - Serviços (A100)
// NEW: Reads from efd_raw_lines table
// ============================================================================

async function processBlockAFromTable(
  supabase: any,
  context: BlockContext,
  jobId: string,
  recordLimit: number,
  counts: InsertCounts
): Promise<void> {
  console.log(`Job ${jobId}: Processing Block A from efd_raw_lines table`);
  
  // Fetch Block A lines from the table
  const { data: rawLines, error: fetchError } = await supabase
    .from('efd_raw_lines')
    .select('content')
    .eq('job_id', jobId)
    .eq('block_type', 'A')
    .order('line_number', { ascending: true });

  if (fetchError) {
    console.error(`Job ${jobId}: Error fetching Block A lines:`, fetchError);
    throw new Error(`Failed to fetch Block A lines: ${fetchError.message}`);
  }

  const lines = rawLines?.map((r: { content: string }) => r.content) || [];
  console.log(`Job ${jobId}: Found ${lines.length} Block A lines in table`);
  
  const batch: RawA100Record[] = [];
  let currentFilialId: string | null = null;
  let recordCount = 0;

  const flushBatch = async () => {
    if (batch.length === 0) return;
    const { error } = await supabase.from('efd_raw_a100').insert(batch);
    if (error) console.error(`Job ${jobId}: Failed to insert A100: ${error.message}`);
    counts.raw_a100 += batch.length;
    batch.length = 0;
  };

  for (const line of lines) {
    if (recordLimit > 0 && recordCount >= recordLimit) break;

    const fields = line.split("|");
    const registro = fields[1];

    switch (registro) {
      case "A010":
        if (fields.length > 2 && fields[2]) {
          const cnpj = fields[2].replace(/\D/g, "");
          currentFilialId = context.filialMap.get(cnpj) || null;
        }
        break;

      case "A100":
        if (fields.length > 12 && currentFilialId && context.period) {
          const indOper = fields[2];
          const tipo = indOper === "0" ? "entrada" : "saida";
          const valorDoc = parseNumber(fields[12]);
          
          if (valorDoc > 0) {
            batch.push({
              import_job_id: jobId,
              filial_id: currentFilialId,
              mes_ano: context.period,
              tipo,
              valor: valorDoc,
              pis: fields.length > 16 ? parseNumber(fields[16]) : 0,
              cofins: fields.length > 18 ? parseNumber(fields[18]) : 0,
              iss: fields.length > 21 ? parseNumber(fields[21]) : 0,
            });
            recordCount++;

            if (batch.length >= BATCH_SIZE) {
              await flushBatch();
            }
          }
        }
        break;
    }
  }

  await flushBatch();
  console.log(`Job ${jobId}: Block A completed - ${recordCount} A100 records`);
}

// ============================================================================
// BLOCK D PROCESSING - Fretes (D100, D500)
// NEW: Reads from efd_raw_lines table
// ============================================================================

interface PendingDRecord {
  data: RawFretesRecord;
  pis: number;
  cofins: number;
}

async function processBlockDFromTable(
  supabase: any,
  context: BlockContext,
  jobId: string,
  recordLimit: number,
  counts: InsertCounts,
  lineOffset: number = 0,
  maxLines: number = 0
): Promise<{ processedLines: number; hasMore: boolean }> {
  console.log(`Job ${jobId}: Processing Block D from efd_raw_lines table, offset: ${lineOffset}, maxLines: ${maxLines}`);
  
  // Build query for Block D lines with pagination
  let query = supabase
    .from('efd_raw_lines')
    .select('content, line_number')
    .eq('job_id', jobId)
    .eq('block_type', 'D')
    .order('line_number', { ascending: true });
  
  // Apply offset using line_number comparison for efficiency
  if (lineOffset > 0) {
    // Get the line_number at the offset position
    const { data: offsetData } = await supabase
      .from('efd_raw_lines')
      .select('line_number')
      .eq('job_id', jobId)
      .eq('block_type', 'D')
      .order('line_number', { ascending: true })
      .range(lineOffset, lineOffset);
    
    if (offsetData && offsetData.length > 0) {
      query = query.gte('line_number', offsetData[0].line_number);
    }
  }
  
  // Apply limit if chunking
  if (maxLines > 0) {
    query = query.limit(maxLines);
  }

  const { data: rawLines, error: fetchError } = await query;

  if (fetchError) {
    console.error(`Job ${jobId}: Error fetching Block D lines:`, fetchError);
    throw new Error(`Failed to fetch Block D lines: ${fetchError.message}`);
  }

  const lines = rawLines?.map((r: { content: string }) => r.content) || [];
  console.log(`Job ${jobId}: Found ${lines.length} Block D lines in table (offset: ${lineOffset})`);
  
  const batch: RawFretesRecord[] = [];
  let currentFilialId: string | null = null;
  let pendingD100: PendingDRecord | null = null;
  let pendingD500: PendingDRecord | null = null;
  let recordCount = 0;
  let processedLines = 0;

  const flushBatch = async () => {
    if (batch.length === 0) return;
    const { error } = await supabase.from('efd_raw_fretes').insert(batch);
    if (error) console.error(`Job ${jobId}: Failed to insert fretes: ${error.message}`);
    counts.raw_fretes += batch.length;
    batch.length = 0;
  };

  const finalizePendingD100 = () => {
    if (!pendingD100) return;
    pendingD100.data.pis = pendingD100.pis;
    pendingD100.data.cofins = pendingD100.cofins;
    batch.push(pendingD100.data);
    pendingD100 = null;
  };

  const finalizePendingD500 = () => {
    if (!pendingD500) return;
    pendingD500.data.pis = pendingD500.pis;
    pendingD500.data.cofins = pendingD500.cofins;
    batch.push(pendingD500.data);
    pendingD500 = null;
  };

  for (const line of lines) {
    if (recordLimit > 0 && recordCount >= recordLimit) break;

    processedLines++;
    const fields = line.split("|");
    const registro = fields[1];

    switch (registro) {
      case "D010":
        // Finalize any pending records before switching filial
        finalizePendingD100();
        finalizePendingD500();
        
        if (fields.length > 2 && fields[2]) {
          const cnpj = fields[2].replace(/\D/g, "");
          currentFilialId = context.filialMap.get(cnpj) || null;
        }
        break;

      case "D100":
        finalizePendingD100(); // Finalize previous D100 if any
        
        if (currentFilialId && context.period) {
          if (context.efdType === 'contribuicoes') {
            if (fields.length > 20) {
              const indOper = fields[2];
              const tipo = indOper === "0" ? "entrada" : "saida";
              const chvCte = fields[10] || "";
              const cnpjTransportadora = chvCte.length >= 20 ? chvCte.substring(6, 20) : null;
              const valorDoc = parseNumber(fields[15]);

              if (valorDoc > 0) {
                pendingD100 = {
                  data: {
                    import_job_id: jobId,
                    filial_id: currentFilialId,
                    mes_ano: context.period,
                    tipo,
                    cnpj_transportadora: cnpjTransportadora,
                    valor: valorDoc,
                    pis: 0,
                    cofins: 0,
                    icms: parseNumber(fields[20]),
                  },
                  pis: 0,
                  cofins: 0,
                };
                recordCount++;
              }
            }
          } else {
            // ICMS/IPI - D100 is complete in one line
            if (fields.length > 26) {
              const indOper = fields[2];
              const tipo = indOper === "0" ? "entrada" : "saida";
              const cnpjTransportadora = fields[5]?.replace(/\D/g, "") || null;
              const valorDoc = parseNumber(fields[14]);

              if (valorDoc > 0) {
                batch.push({
                  import_job_id: jobId,
                  filial_id: currentFilialId,
                  mes_ano: context.period,
                  tipo,
                  cnpj_transportadora: cnpjTransportadora,
                  valor: valorDoc,
                  pis: parseNumber(fields[24]),
                  cofins: parseNumber(fields[26]),
                  icms: parseNumber(fields[23]),
                });
                recordCount++;
              }
            }
          }
        }
        break;

      case "D101":
        if (context.efdType === 'contribuicoes' && pendingD100 && fields.length > 8) {
          pendingD100.pis += parseNumber(fields[8]);
        }
        break;

      case "D105":
        if (context.efdType === 'contribuicoes' && pendingD100 && fields.length > 8) {
          pendingD100.cofins += parseNumber(fields[8]);
        }
        break;

      case "D500":
        finalizePendingD100();
        finalizePendingD500();
        
        if (currentFilialId && context.period) {
          if (context.efdType === 'contribuicoes') {
            if (fields.length > 19) {
              const indOper = fields[2];
              const tipo = indOper === "0" ? "entrada" : "saida";
              const cnpjFornecedor = fields[4]?.replace(/\D/g, "") || null;
              const valorDoc = parseNumber(fields[12]);

              if (valorDoc > 0) {
                pendingD500 = {
                  data: {
                    import_job_id: jobId,
                    filial_id: currentFilialId,
                    mes_ano: context.period,
                    tipo,
                    cnpj_transportadora: cnpjFornecedor,
                    valor: valorDoc,
                    pis: 0,
                    cofins: 0,
                    icms: parseNumber(fields[19]),
                  },
                  pis: 0,
                  cofins: 0,
                };
                recordCount++;
              }
            }
          } else {
            // ICMS/IPI
            if (fields.length > 19) {
              const indOper = fields[2];
              const tipo = indOper === "0" ? "entrada" : "saida";
              const cnpjFornecedor = fields[4]?.replace(/\D/g, "") || null;
              const valorDoc = parseNumber(fields[11]);

              if (valorDoc > 0) {
                batch.push({
                  import_job_id: jobId,
                  filial_id: currentFilialId,
                  mes_ano: context.period,
                  tipo,
                  cnpj_transportadora: cnpjFornecedor,
                  valor: valorDoc,
                  pis: parseNumber(fields[17]),
                  cofins: parseNumber(fields[19]),
                  icms: parseNumber(fields[14]),
                });
                recordCount++;
              }
            }
          }
        }
        break;

      case "D501":
        if (context.efdType === 'contribuicoes' && pendingD500 && fields.length > 7) {
          pendingD500.pis += parseNumber(fields[7]);
        }
        break;

      case "D505":
        if (context.efdType === 'contribuicoes' && pendingD500 && fields.length > 7) {
          pendingD500.cofins += parseNumber(fields[7]);
        }
        break;
    }

    if (batch.length >= BATCH_SIZE) {
      await flushBatch();
    }
  }

  // Finalize any remaining pending records
  finalizePendingD100();
  finalizePendingD500();
  await flushBatch();
  
  const hasMore = maxLines > 0 && lines.length === maxLines;
  console.log(`Job ${jobId}: Block D chunk completed - ${recordCount} frete records, processedLines: ${processedLines}, hasMore: ${hasMore}`);
  
  return { processedLines, hasMore };
}

// ============================================================================
// BLOCK C PROCESSING - Mercadorias (C100, C600) and Energia/Agua (C500)
// NEW: Reads from efd_raw_lines table with chunked processing
// ============================================================================

async function processBlockCFromTable(
  supabase: any,
  context: BlockContext,
  jobId: string,
  recordLimit: number,
  counts: InsertCounts,
  lineOffset: number = 0,
  maxLines: number = 0
): Promise<{ processedLines: number; hasMore: boolean }> {
  console.log(`Job ${jobId}: Processing Block C from efd_raw_lines table, offset: ${lineOffset}, maxLines: ${maxLines}`);
  
  // Build query for Block C lines
  let query = supabase
    .from('efd_raw_lines')
    .select('content, line_number')
    .eq('job_id', jobId)
    .eq('block_type', 'C')
    .order('line_number', { ascending: true });

  // Apply pagination if maxLines > 0
  if (maxLines > 0) {
    query = query.range(lineOffset, lineOffset + maxLines - 1);
  }

  const { data: rawLines, error: fetchError } = await query;

  if (fetchError) {
    console.error(`Job ${jobId}: Error fetching Block C lines:`, fetchError);
    throw new Error(`Failed to fetch Block C lines: ${fetchError.message}`);
  }

  const lines = rawLines?.map((r: { content: string }) => r.content) || [];
  console.log(`Job ${jobId}: Fetched ${lines.length} Block C lines from table (offset: ${lineOffset})`);
  
  if (lines.length === 0) {
    return { processedLines: 0, hasMore: false };
  }

  const c100Batch: RawC100Record[] = [];
  const c500Batch: RawC500Record[] = [];
  let currentFilialId: string | null = null;
  let c100Count = 0;
  let c500Count = 0;
  let c600Count = 0;

  const flushC100 = async () => {
    if (c100Batch.length === 0) return;
    const { error } = await supabase.from('efd_raw_c100').insert(c100Batch);
    if (error) console.error(`Job ${jobId}: Failed to insert C100: ${error.message}`);
    counts.raw_c100 += c100Batch.length;
    c100Batch.length = 0;
  };

  const flushC500 = async () => {
    if (c500Batch.length === 0) return;
    const { error } = await supabase.from('efd_raw_c500').insert(c500Batch);
    if (error) console.error(`Job ${jobId}: Failed to insert C500: ${error.message}`);
    counts.raw_c500 += c500Batch.length;
    c500Batch.length = 0;
  };

  const codModMapC500: Record<string, string> = {
    "06": "energia",
    "21": "comunicacao",
    "22": "comunicacao",
    "28": "gas",
    "29": "agua",
  };

  for (const line of lines) {
    const fields = line.split("|");
    const registro = fields[1];

    switch (registro) {
      case "C010":
        if (fields.length > 2 && fields[2]) {
          const cnpj = fields[2].replace(/\D/g, "");
          currentFilialId = context.filialMap.get(cnpj) || null;
        }
        break;

      case "C100":
        if (recordLimit > 0 && c100Count >= recordLimit) continue;
        
        if (currentFilialId && context.period) {
          if (context.efdType === 'contribuicoes') {
            if (fields.length > 12) {
              const indOper = fields[2];
              const tipo = indOper === "0" ? "entrada" : "saida";
              const codPartRaw = fields[4] || null;
              let codPart = codPartRaw;
              if (!codPartRaw || codPartRaw.trim() === '' || codPartRaw === '0') {
                codPart = tipo === 'saida' ? '9999999999' : '8888888888';
              }
              const valorDoc = parseNumber(fields[12]);
              
              if (valorDoc > 0) {
                c100Batch.push({
                  import_job_id: jobId,
                  filial_id: currentFilialId,
                  mes_ano: context.period,
                  tipo,
                  cod_part: codPart,
                  valor: valorDoc,
                  pis: fields.length > 26 ? parseNumber(fields[26]) : 0,
                  cofins: fields.length > 27 ? parseNumber(fields[27]) : 0,
                  icms: fields.length > 22 ? parseNumber(fields[22]) : 0,
                  ipi: fields.length > 25 ? parseNumber(fields[25]) : 0,
                });
                c100Count++;
              }
            }
          } else {
            // ICMS/IPI
            if (fields.length > 27) {
              const indOper = fields[2];
              const tipo = indOper === "0" ? "entrada" : "saida";
              const codPartRaw = fields[4] || null;
              let codPart = codPartRaw;
              if (!codPartRaw || codPartRaw.trim() === '' || codPartRaw === '0') {
                codPart = tipo === 'saida' ? '9999999999' : '8888888888';
              }
              const valorDoc = parseNumber(fields[12]);
              
              if (valorDoc > 0) {
                c100Batch.push({
                  import_job_id: jobId,
                  filial_id: currentFilialId,
                  mes_ano: context.period,
                  tipo,
                  cod_part: codPart,
                  valor: valorDoc,
                  pis: parseNumber(fields[26]),
                  cofins: parseNumber(fields[27]),
                  icms: parseNumber(fields[22]),
                  ipi: parseNumber(fields[25]),
                });
                c100Count++;
              }
            }
          }
        }
        break;

      case "C500":
        if (recordLimit > 0 && c500Count >= recordLimit) continue;
        
        if (currentFilialId && context.period) {
          if (context.efdType === 'contribuicoes') {
            if (fields.length > 10) {
              const codMod = fields[3] || "";
              const tipoServico = codModMapC500[codMod] || "outros";
              const cnpjFornecedor = fields[2]?.replace(/\D/g, "") || null;
              const valorDoc = parseNumber(fields[10]);

              if (valorDoc > 0) {
                c500Batch.push({
                  import_job_id: jobId,
                  filial_id: currentFilialId,
                  mes_ano: context.period,
                  tipo_operacao: "credito",
                  tipo_servico: tipoServico,
                  cnpj_fornecedor: cnpjFornecedor,
                  valor: valorDoc,
                  pis: fields.length > 13 ? parseNumber(fields[13]) : 0,
                  cofins: fields.length > 14 ? parseNumber(fields[14]) : 0,
                  icms: fields.length > 11 ? parseNumber(fields[11]) : 0,
                });
                c500Count++;
              }
            }
          } else {
            // ICMS/IPI
            if (fields.length > 10) {
              const indOper = fields[2];
              const tipoOperacao = indOper === "0" ? "credito" : "debito";
              const codMod = fields[5] || "";
              const tipoServico = codModMapC500[codMod] || "outros";
              const cnpjFornecedor = fields[4]?.replace(/\D/g, "") || null;
              const valorDoc = parseNumber(fields[10]);

              if (valorDoc > 0) {
                c500Batch.push({
                  import_job_id: jobId,
                  filial_id: currentFilialId,
                  mes_ano: context.period,
                  tipo_operacao: tipoOperacao,
                  tipo_servico: tipoServico,
                  cnpj_fornecedor: cnpjFornecedor,
                  valor: valorDoc,
                  pis: fields.length > 16 ? parseNumber(fields[16]) : 0,
                  cofins: fields.length > 18 ? parseNumber(fields[18]) : 0,
                  icms: fields.length > 13 ? parseNumber(fields[13]) : 0,
                });
                c500Count++;
              }
            }
          }
        }
        break;

      case "C600":
        if (recordLimit > 0 && c600Count >= recordLimit) continue;
        
        if (currentFilialId && context.period) {
          if (context.efdType === 'contribuicoes') {
            if (fields.length > 22) {
              const valorDoc = parseNumber(fields[10]);
              
              if (valorDoc > 0) {
                c100Batch.push({
                  import_job_id: jobId,
                  filial_id: currentFilialId,
                  mes_ano: context.period,
                  tipo: "saida",
                  cod_part: null,
                  valor: valorDoc,
                  pis: parseNumber(fields[21]),
                  cofins: parseNumber(fields[22]),
                  icms: parseNumber(fields[18]),
                  ipi: 0,
                });
                c600Count++;
              }
            }
          } else {
            // ICMS/IPI
            if (fields.length > 16) {
              const valorDoc = parseNumber(fields[7]);
              
              if (valorDoc > 0) {
                c100Batch.push({
                  import_job_id: jobId,
                  filial_id: currentFilialId,
                  mes_ano: context.period,
                  tipo: "saida",
                  cod_part: null,
                  valor: valorDoc,
                  pis: parseNumber(fields[15]),
                  cofins: parseNumber(fields[16]),
                  icms: parseNumber(fields[12]),
                  ipi: 0,
                });
                c600Count++;
              }
            }
          }
        }
        break;
    }

    // Flush batches when they reach size limit
    if (c100Batch.length >= BATCH_SIZE) await flushC100();
    if (c500Batch.length >= BATCH_SIZE) await flushC500();
  }

  // Final flush
  await flushC100();
  await flushC500();
  
  console.log(`Job ${jobId}: Block C chunk completed - C100: ${c100Count}, C500: ${c500Count}, C600: ${c600Count}`);
  
  // Determine if there are more lines to process
  const hasMore = maxLines > 0 && lines.length === maxLines;
  
  return { processedLines: lines.length, hasMore };
}

// ============================================================================
// CONSOLIDATION - Merge raw records into final tables
// ============================================================================

// Maximum batches per invocation before fire-and-forget to avoid gateway timeout
const MAX_CONSOLIDATION_BATCHES_PER_INVOCATION = 15;

interface ConsolidationResult {
  mercadoriasBatches: number;
  mercadoriasProcessed: number;
  otherTypes: any;
  needsContinuation?: boolean;
}

async function consolidateData(
  supabase: any,
  jobId: string,
  supabaseUrl?: string,
  supabaseKey?: string
): Promise<ConsolidationResult> {
  console.log(`Job ${jobId}: Starting consolidation...`);

  // FIXED: Correct count query syntax - count comes directly in the response, not in data
  const { count: initialRemaining, error: countError } = await supabase
    .from('efd_raw_c100')
    .select('*', { count: 'exact', head: true })
    .eq('import_job_id', jobId);
  
  if (countError) {
    console.error(`Job ${jobId}: Error counting raw_c100 records:`, countError);
  }
  
  const recordCount = initialRemaining || 0;
  console.log(`Job ${jobId}: ${recordCount} raw_c100 records to consolidate`);

  let batchNumber = 0;
  let totalDeleted = 0;
  let hasMore = recordCount > 0;
  let currentBatchSize = 10000;
  let consecutiveFailures = 0;
  let batchesThisInvocation = 0;
  const MAX_FAILURES = 3;
  const MIN_BATCH_SIZE = 3000;
  const MAX_BATCH_SIZE = 30000;
  const FAST_THRESHOLD_MS = 1500;
  const SLOW_THRESHOLD_MS = 5000;

  while (hasMore && consecutiveFailures < MAX_FAILURES) {
    batchNumber++;
    batchesThisInvocation++;
    const batchStart = Date.now();
    
    console.log(`Job ${jobId}: Consolidation batch ${batchNumber} (size: ${currentBatchSize}, invocation batch: ${batchesThisInvocation})...`);
    
    const { data: batchResult, error: batchError } = await supabase.rpc('consolidar_mercadorias_single_batch', {
      p_job_id: jobId,
      p_batch_size: currentBatchSize
    });
    
    const batchDuration = Date.now() - batchStart;
    
    if (batchError) {
      console.error(`Job ${jobId}: Consolidation batch ${batchNumber} error:`, batchError);
      consecutiveFailures++;
      currentBatchSize = Math.max(MIN_BATCH_SIZE, Math.floor(currentBatchSize / 2));
      console.log(`Job ${jobId}: Reducing batch size to ${currentBatchSize} after error, will retry...`);
      continue;
    }
    
    consecutiveFailures = 0;
    
    const deletedRows = batchResult?.deleted_rows || 0;
    totalDeleted += deletedRows;
    hasMore = batchResult?.has_more === true;
    
    console.log(`Job ${jobId}: Batch ${batchNumber} completed in ${batchDuration}ms - deleted: ${deletedRows}, has_more: ${hasMore}`);
    
    // Adaptive batch sizing
    if (batchDuration < FAST_THRESHOLD_MS && currentBatchSize < MAX_BATCH_SIZE) {
      currentBatchSize = Math.min(MAX_BATCH_SIZE, currentBatchSize + 5000);
    } else if (batchDuration > SLOW_THRESHOLD_MS && currentBatchSize > MIN_BATCH_SIZE) {
      currentBatchSize = Math.max(MIN_BATCH_SIZE, currentBatchSize - 2000);
    }

    // Update progress (70-85% range for mercadorias consolidation)
    if (recordCount > 0) {
      const consolidationProgress = totalDeleted / recordCount;
      const progress = Math.min(70 + Math.floor(consolidationProgress * 15), 85);
      await supabase.from("import_jobs").update({ 
        progress,
        counts: { consolidation_batches: batchNumber, consolidation_processed: totalDeleted }
      }).eq("id", jobId);
    }
    
    // Check if we need to fire-and-forget for continuation
    if (batchesThisInvocation >= MAX_CONSOLIDATION_BATCHES_PER_INVOCATION && hasMore) {
      console.log(`Job ${jobId}: Reached max batches per invocation (${MAX_CONSOLIDATION_BATCHES_PER_INVOCATION}), will fire-and-forget for continuation`);
      
      // Fire-and-forget for next consolidation batch
      if (supabaseUrl && supabaseKey) {
        const selfUrl = `${supabaseUrl}/functions/v1/process-efd-job`;
        EdgeRuntime.waitUntil(
          fetch(selfUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ job_id: jobId }),
          }).catch(err => console.error(`Job ${jobId}: Failed to invoke consolidation continuation: ${err}`))
        );
      }
      
      return {
        mercadoriasBatches: batchNumber,
        mercadoriasProcessed: totalDeleted,
        otherTypes: null,
        needsContinuation: true
      };
    }
  }
  
  console.log(`Job ${jobId}: Mercadorias consolidation completed - ${batchNumber} batches, ${totalDeleted} records processed`);

  // Consolidate other record types (energia, fretes, serviços) - typically smaller
  console.log(`Job ${jobId}: Consolidating other record types...`);
  const { data: consolidationResult, error: consolidationError } = await supabase
    .rpc('consolidar_import_job', { p_job_id: jobId });
  
  if (consolidationError) {
    console.error(`Job ${jobId}: Consolidation error:`, consolidationError);
    throw new Error(`Consolidation error: ${consolidationError.message}`);
  }
  
  console.log(`Job ${jobId}: Other types consolidation result:`, consolidationResult);

  return {
    mercadoriasBatches: batchNumber,
    mercadoriasProcessed: totalDeleted,
    otherTypes: consolidationResult,
    needsContinuation: false
  };
}

// ============================================================================
// REFRESH MATERIALIZED VIEWS
// ============================================================================

async function refreshMaterializedViews(supabase: any, jobId: string): Promise<number> {
  console.log(`Job ${jobId}: Refreshing materialized views...`);
  
  const viewsToRefresh = [
    'extensions.mv_mercadorias_aggregated',
    'extensions.mv_fretes_aggregated',
    'extensions.mv_energia_agua_aggregated',
    'extensions.mv_servicos_aggregated',
    'extensions.mv_mercadorias_participante',
    'extensions.mv_dashboard_stats',
    'extensions.mv_uso_consumo_aggregated',
    'extensions.mv_uso_consumo_detailed',
    'extensions.mv_fretes_detailed',
    'extensions.mv_energia_agua_detailed',
    'extensions.mv_participantes_cache',
  ];

  const totalViews = viewsToRefresh.length;
  const failedViews: string[] = [];
  const startedAt = new Date().toISOString();

  // Inicializa status de refresh
  await supabase.from("import_jobs").update({ 
    view_refresh_status: {
      views_total: totalViews,
      views_completed: 0,
      current_view: viewsToRefresh[0].replace('extensions.', ''),
      started_at: startedAt,
      failed_views: []
    }
  }).eq("id", jobId);

  let viewsRefreshed = 0;
  for (let i = 0; i < viewsToRefresh.length; i++) {
    const view = viewsToRefresh[i];
    const viewName = view.replace('extensions.', '');
    
    // Atualiza status com view atual e progresso (90-99%)
    const progressPercent = Math.round(90 + ((i / totalViews) * 9));
    await supabase.from("import_jobs").update({ 
      progress: progressPercent,
      view_refresh_status: {
        views_total: totalViews,
        views_completed: i,
        current_view: viewName,
        started_at: startedAt,
        failed_views: failedViews
      }
    }).eq("id", jobId);

    try {
      const { error } = await supabase.rpc('exec_sql', {
        sql: `REFRESH MATERIALIZED VIEW ${view}`
      });
      if (error) {
        console.warn(`Job ${jobId}: Failed to refresh ${view}:`, error.message);
        failedViews.push(viewName);
      } else {
        viewsRefreshed++;
        console.log(`Job ${jobId}: Refreshed ${view} (${i + 1}/${totalViews})`);
      }
    } catch (err) {
      console.warn(`Job ${jobId}: Exception refreshing ${view}:`, err);
      failedViews.push(viewName);
    }
  }

  // Atualiza status final
  await supabase.from("import_jobs").update({ 
    progress: 99,
    view_refresh_status: {
      views_total: totalViews,
      views_completed: totalViews,
      current_view: null,
      started_at: startedAt,
      failed_views: failedViews
    }
  }).eq("id", jobId);
  
  // Limpa view_refresh_status ao finalizar
  await supabase.from("import_jobs").update({ 
    view_refresh_status: null 
  }).eq("id", jobId);
  
  console.log(`Job ${jobId}: Refreshed ${viewsRefreshed}/${totalViews} views`);
  return viewsRefreshed;
}

// ============================================================================
// CLEANUP RAW LINES - Delete temporary lines after processing
// ============================================================================

async function cleanupRawLines(supabase: any, jobId: string): Promise<void> {
  console.log(`Job ${jobId}: Cleaning up efd_raw_lines in batches...`);
  
  const CLEANUP_BATCH_SIZE = 50000;
  let totalDeleted = 0;
  let hasMore = true;
  let batchNumber = 0;
  
  while (hasMore) {
    batchNumber++;
    
    // Get IDs of records to delete (using limit)
    const { data: idsToDelete, error: selectError } = await supabase
      .from('efd_raw_lines')
      .select('id')
      .eq('job_id', jobId)
      .limit(CLEANUP_BATCH_SIZE);
    
    if (selectError) {
      console.warn(`Job ${jobId}: Failed to select raw lines for cleanup (batch ${batchNumber}):`, selectError.message);
      break;
    }
    
    if (!idsToDelete || idsToDelete.length === 0) {
      hasMore = false;
      break;
    }
    
    const ids = idsToDelete.map((row: any) => row.id);
    
    const { error: deleteError } = await supabase
      .from('efd_raw_lines')
      .delete()
      .in('id', ids);
    
    if (deleteError) {
      console.warn(`Job ${jobId}: Failed to delete cleanup batch ${batchNumber}:`, deleteError.message);
      break;
    }
    
    totalDeleted += ids.length;
    console.log(`Job ${jobId}: Cleanup batch ${batchNumber} - deleted ${ids.length} rows (total: ${totalDeleted})`);
    
    // Small delay to avoid overwhelming the database
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // If we got less than the batch size, we're done
    if (ids.length < CLEANUP_BATCH_SIZE) {
      hasMore = false;
    }
  }
  
  console.log(`Job ${jobId}: Raw lines cleanup complete - ${totalDeleted} rows deleted in ${batchNumber} batches`);
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

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

    console.log(`Job ${jobId}: Starting processing...`);

    // Fetch job details
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
      console.log(`Job ${jobId}: Already cancelled, cleaning up...`);
      await cleanupRawLines(supabase, jobId);
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

    let currentPhase = (job.current_phase || 'pending') as ProcessingPhase;
    const recordLimit = job.record_limit || 0;
    const importScope = (job.import_scope || 'all') as ImportScope;
    const validPrefixes = getValidPrefixes(importScope);

    console.log(`Job ${jobId}: Current phase: ${currentPhase}, scope: ${importScope}, recordLimit: ${recordLimit}`);

    // Initialize counts
    const existingCounts = job.counts as any || {};
    const counts: InsertCounts = {
      raw_c100: existingCounts.raw_c100 || 0,
      raw_c500: existingCounts.raw_c500 || 0,
      raw_fretes: existingCounts.raw_fretes || 0,
      raw_a100: existingCounts.raw_a100 || 0,
      participantes: existingCounts.participantes || 0,
      estabelecimentos: existingCounts.estabelecimentos || 0,
      block_c_line_offset: existingCounts.block_c_line_offset || 0,
      block_c_total_lines: existingCounts.block_c_total_lines || 0,
    };

    // ===========================================================================
    // PHASE 1: PARSING - Download and insert lines directly into efd_raw_lines
    // Uses chunked streaming with direct DB insertion
    // ===========================================================================
    if (currentPhase === 'pending' || currentPhase === 'parsing') {
      await supabase.from("import_jobs").update({ 
        status: "processing", 
        current_phase: "parsing",
        started_at: job.started_at || new Date().toISOString() 
      }).eq("id", jobId);

      // Get current byte offset and line number from job for Range Request resumption
      const bytesProcessedSoFar = job.bytes_processed || 0;
      const currentLineNumber = (job as any).parsing_offset || 0;

      // Get signed URL for file
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("efd-files")
        .createSignedUrl(job.file_path, 3600);

      if (signedUrlError || !signedUrlData) {
        throw new Error("Failed to get file URL");
      }

      // Use HTTP Range Request to resume from last byte position (avoid re-reading entire file)
      const fetchHeaders: HeadersInit = {};
      if (bytesProcessedSoFar > 0) {
        fetchHeaders['Range'] = `bytes=${bytesProcessedSoFar}-`;
        console.log(`Job ${jobId}: Using Range Request to resume from byte ${bytesProcessedSoFar} (line ~${currentLineNumber})`);
      } else {
        console.log(`Job ${jobId}: Starting fresh parsing from byte 0`);
      }

      const fetchResponse = await fetch(signedUrlData.signedUrl, { headers: fetchHeaders });
      
      // Accept both 200 (full content) and 206 (partial content from Range)
      if (!fetchResponse.ok && fetchResponse.status !== 206) {
        throw new Error(`Failed to fetch file: ${fetchResponse.status} ${fetchResponse.statusText}`);
      }

      const isRangeResponse = fetchResponse.status === 206;
      console.log(`Job ${jobId}: Fetch response status ${fetchResponse.status} (Range: ${isRangeResponse})`);

      // Use new chunked streaming with direct DB insertion + Range support
      const result = await separateBlocksChunkedWithInsert(
        fetchResponse, 
        validPrefixes, 
        PARSING_CHUNK_SIZE, 
        jobId, 
        supabase,
        currentLineNumber,
        '' // No partial line buffer on initial chunk
      );
      
      console.log(`Job ${jobId}: Chunk processed - hasMore: ${result.hasMore}, bytes: ${result.bytesProcessed}, blockCounts:`, result.blockCounts);

      if (result.hasMore) {
        // More lines to parse - save progress with bytes_processed for Range Request resumption
        const newBytesProcessed = bytesProcessedSoFar + result.bytesProcessed;
        const estimatedTotalLines = job.file_size / 100;
        const progress = Math.min(9, Math.floor((result.nextLineNumber / estimatedTotalLines) * 9));
        
        await supabase.from("import_jobs").update({ 
          progress,
          parsing_offset: result.nextLineNumber,
          bytes_processed: newBytesProcessed,
          parsing_total_lines: result.nextLineNumber
        }).eq("id", jobId);
        
        // Fire-and-forget for next chunk
        await new Promise(resolve => setTimeout(resolve, 1000));
        EdgeRuntime.waitUntil(selfInvokeWithRetry(supabaseUrl, supabaseKey, jobId, supabase));
        
        console.log(`Job ${jobId}: Parsing chunk complete, saved ${newBytesProcessed} bytes processed, self-invoking for next chunk`);
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Parsing chunk processed, line: ${result.nextLineNumber}, bytes: ${newBytesProcessed}`,
            hasMore: true,
            blockCounts: result.blockCounts
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Parsing complete - advance to block_0
      const finalBytesProcessed = bytesProcessedSoFar + result.bytesProcessed;
      console.log(`Job ${jobId}: Parsing complete (${finalBytesProcessed} bytes), advancing to block_0 phase`);
      
      await supabase.from("import_jobs").update({ 
        progress: 10,
        total_lines: result.nextLineNumber,
        bytes_processed: finalBytesProcessed,
        current_phase: "block_0",
        parsing_offset: 0,
        parsing_total_lines: result.nextLineNumber
      }).eq("id", jobId);

      // IMPORTANT: Self-invoke for block_0 phase to ensure fresh execution context
      // This prevents the "Unknown phase" bug caused by stale currentPhase variable
      await new Promise(resolve => setTimeout(resolve, 1000));
      EdgeRuntime.waitUntil(selfInvokeWithRetry(supabaseUrl, supabaseKey, jobId, supabase));
      
      console.log(`Job ${jobId}: Parsing complete, self-invoking for block_0 phase`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Parsing complete (${finalBytesProcessed} bytes, ${result.nextLineNumber} lines), advancing to block_0`,
          phase: "block_0",
          blockCounts: result.blockCounts
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===========================================================================
    // PHASE 2: BLOCK 0 - Process cadastros (period, filiais, participantes)
    // Reads from efd_raw_lines table
    // ===========================================================================
    if (currentPhase === 'block_0') {
      console.log(`Job ${jobId}: Starting Block 0 processing from table...`);
      
      const context = await processBlock0FromTable(supabase, job, jobId, counts);
      
      await supabase.from("import_jobs").update({ 
        progress: 20,
        counts,
        current_phase: "block_d",
        mes_ano: context.period || null
      }).eq("id", jobId);

      // ===========================================================================
      // PHASE 3: BLOCK D - Process fretes (D100, D500)
      // With chunking for large datasets
      // ===========================================================================
      if (importScope === 'all' || importScope === 'only_d') {
        // Get total Block D lines count
        const { count: totalBlockDLines } = await supabase
          .from('efd_raw_lines')
          .select('*', { count: 'exact', head: true })
          .eq('job_id', jobId)
          .eq('block_type', 'D');
        
        if ((totalBlockDLines || 0) > BLOCK_D_CHUNK_SIZE) {
          // Large Block D - process first chunk and fire-and-forget for remaining
          console.log(`Job ${jobId}: Block D has ${totalBlockDLines} lines, processing in chunks...`);
          
          const { processedLines, hasMore } = await processBlockDFromTable(
            supabase, context, jobId, recordLimit, counts, 0, BLOCK_D_CHUNK_SIZE
          );
          
          if (hasMore) {
            // Save progress and self-invoke for next chunk
            await supabase.from("import_jobs").update({ 
              progress: 20 + Math.floor((processedLines / (totalBlockDLines || 1)) * 15),
              counts: { ...counts, block_d_line_offset: processedLines, block_d_total_lines: totalBlockDLines },
              current_phase: "block_d"
            }).eq("id", jobId);
            
            // Fire-and-forget for next chunk
            await new Promise(resolve => setTimeout(resolve, 1000));
            EdgeRuntime.waitUntil(selfInvokeWithRetry(supabaseUrl, supabaseKey, jobId, supabase));
            
            console.log(`Job ${jobId}: First Block D chunk processed (${processedLines} lines), self-invoking for next chunk`);
            
            return new Response(
              JSON.stringify({ 
                success: true, 
                message: `Block D chunk 0-${processedLines} processed, continuing...`,
                counts
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else {
          // Small Block D - process all at once
          console.log(`Job ${jobId}: Starting Block D processing (${totalBlockDLines} lines)...`);
          await processBlockDFromTable(supabase, context, jobId, recordLimit, counts, 0, 0);
        }
      }
      
      await supabase.from("import_jobs").update({ 
        progress: 35,
        counts,
        current_phase: "block_a"
      }).eq("id", jobId);

      // ===========================================================================
      // PHASE 4: BLOCK A - Process serviços (A100)
      // ===========================================================================
      if (importScope === 'all' || importScope === 'only_a') {
        console.log(`Job ${jobId}: Starting Block A processing from table...`);
        await processBlockAFromTable(supabase, context, jobId, recordLimit, counts);
      }

      await supabase.from("import_jobs").update({ 
        progress: 50,
        counts,
        current_phase: "block_c"
      }).eq("id", jobId);

      // ===========================================================================
      // PHASE 5: BLOCK C - Process mercadorias and energia/agua (C100, C500, C600)
      // With chunking for large datasets
      // ===========================================================================
      if (importScope === 'all' || importScope === 'only_c') {
        // Get total Block C lines count
        const { count: totalBlockCLines } = await supabase
          .from('efd_raw_lines')
          .select('*', { count: 'exact', head: true })
          .eq('job_id', jobId)
          .eq('block_type', 'C');
        
        counts.block_c_total_lines = totalBlockCLines || 0;
        
        if ((totalBlockCLines || 0) > BLOCK_C_CHUNK_SIZE) {
          // Large Block C - process first chunk and fire-and-forget for remaining
          console.log(`Job ${jobId}: Block C has ${totalBlockCLines} lines, processing in chunks...`);
          
          const { processedLines } = await processBlockCFromTable(
            supabase, context, jobId, recordLimit, counts, 0, BLOCK_C_CHUNK_SIZE
          );
          
          counts.block_c_line_offset = processedLines;
          
          await supabase.from("import_jobs").update({ 
            progress: 50 + Math.floor((processedLines / (totalBlockCLines || 1)) * 15),
            counts
          }).eq("id", jobId);
          
          // Fire-and-forget for next chunk
          const selfUrl = `${supabaseUrl}/functions/v1/process-efd-job`;
          EdgeRuntime.waitUntil(
            fetch(selfUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({ job_id: jobId }),
            }).catch(err => console.error(`Job ${jobId}: Failed to invoke next chunk: ${err}`))
          );
          
          console.log(`Job ${jobId}: First Block C chunk processed (${processedLines} lines), fire-and-forget for next chunk`);
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: `Block C chunk 0-${processedLines} processed, continuing...`,
              counts
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          // Small Block C - process all at once
          console.log(`Job ${jobId}: Starting Block C processing (${totalBlockCLines} lines)...`);
          await processBlockCFromTable(supabase, context, jobId, recordLimit, counts, 0, 0);
        }
      }

      await supabase.from("import_jobs").update({ 
        progress: 65,
        counts,
        current_phase: "consolidating"
      }).eq("id", jobId);

      // ===========================================================================
      // PHASE 6: CONSOLIDATION - Merge raw records into final tables
      // ===========================================================================
      console.log(`Job ${jobId}: Starting consolidation...`);
      const consolidationResult = await consolidateData(supabase, jobId, supabaseUrl, supabaseKey);

      // If consolidation needs continuation, return early
      if (consolidationResult.needsContinuation) {
        console.log(`Job ${jobId}: Consolidation needs continuation, fire-and-forget already triggered`);
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Consolidation in progress, continuing...",
            consolidation: consolidationResult
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase.from("import_jobs").update({ 
        progress: 90,
        current_phase: "refreshing_views"
      }).eq("id", jobId);

      // ===========================================================================
      // PHASE 7: REFRESH VIEWS
      // ===========================================================================
      const viewsRefreshed = await refreshMaterializedViews(supabase, jobId);

      // ===========================================================================
      // PHASE 8: FINALIZATION
      // ===========================================================================
      
      // Cleanup raw lines
      await cleanupRawLines(supabase, jobId);
      
      await supabase.from("import_jobs").update({ 
        status: "completed",
        progress: 100,
        current_phase: "completed",
        counts: {
          ...counts,
          consolidation: consolidationResult,
          refresh_success: viewsRefreshed > 0
        },
        completed_at: new Date().toISOString() 
      }).eq("id", jobId);

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
        await fetch(emailUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ job_id: jobId }),
        });
        console.log(`Job ${jobId}: Email notification sent`);
      } catch (emailErr) {
        console.warn(`Job ${jobId}: Failed to send email:`, emailErr);
      }

      console.log(`Job ${jobId}: Import completed successfully!`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Import completed",
          counts,
          consolidation: consolidationResult
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===========================================================================
    // RESUMPTION: BLOCK D - Continue processing remaining chunks
    // ===========================================================================
    if (currentPhase === 'block_d') {
      const lineOffset = (counts as any).block_d_line_offset || 0;
      
      console.log(`Job ${jobId}: Resuming Block D from offset ${lineOffset}`);

      // Get context from Block 0 lines in table
      const context = await processBlock0QuickFromTable(supabase, job.empresa_id, jobId);
      
      // Get total Block D lines count
      const { count: totalBlockDLines } = await supabase
        .from('efd_raw_lines')
        .select('*', { count: 'exact', head: true })
        .eq('job_id', jobId)
        .eq('block_type', 'D');
      
      const actualTotalLines = totalBlockDLines || 0;
      
      console.log(`Job ${jobId}: Processing Block D chunk from offset ${lineOffset}, total lines: ${actualTotalLines}`);
      
      const { processedLines, hasMore } = await processBlockDFromTable(
        supabase, context, jobId, recordLimit, counts, lineOffset, BLOCK_D_CHUNK_SIZE
      );
      
      if (hasMore) {
        // More chunks to process
        const newOffset = lineOffset + processedLines;
        const progress = 20 + Math.floor((newOffset / actualTotalLines) * 15);
        
        await supabase.from("import_jobs").update({ 
          progress,
          counts: { ...counts, block_d_line_offset: newOffset }
        }).eq("id", jobId);
        
        // Fire-and-forget for next chunk
        await new Promise(resolve => setTimeout(resolve, 1000));
        EdgeRuntime.waitUntil(selfInvokeWithRetry(supabaseUrl, supabaseKey, jobId, supabase));
        
        console.log(`Job ${jobId}: Block D chunk ${lineOffset}-${newOffset} processed, self-invoking for next`);
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Block D chunk ${lineOffset}-${newOffset} processed, continuing...`,
            counts
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // All Block D chunks done - proceed to Block A
      console.log(`Job ${jobId}: Block D completed all chunks, proceeding to Block A`);
      
      await supabase.from("import_jobs").update({ 
        progress: 35,
        counts,
        current_phase: "block_a"
      }).eq("id", jobId);

      // Process Block A
      if (importScope === 'all' || importScope === 'only_a') {
        console.log(`Job ${jobId}: Starting Block A processing from table...`);
        await processBlockAFromTable(supabase, context, jobId, recordLimit, counts);
      }

      await supabase.from("import_jobs").update({ 
        progress: 50,
        counts,
        current_phase: "block_c"
      }).eq("id", jobId);

      // Check if Block C needs chunking
      const { count: totalBlockCLines } = await supabase
        .from('efd_raw_lines')
        .select('*', { count: 'exact', head: true })
        .eq('job_id', jobId)
        .eq('block_type', 'C');

      if ((totalBlockCLines || 0) > BLOCK_C_CHUNK_SIZE) {
        // Large Block C - process first chunk
        const { processedLines: cProcessed, hasMore: cHasMore } = await processBlockCFromTable(
          supabase, context, jobId, recordLimit, counts, 0, BLOCK_C_CHUNK_SIZE
        );
        
        if (cHasMore) {
          await supabase.from("import_jobs").update({ 
            progress: 50 + Math.floor((cProcessed / (totalBlockCLines || 1)) * 15),
            counts: { ...counts, block_c_line_offset: cProcessed, block_c_total_lines: totalBlockCLines }
          }).eq("id", jobId);
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          EdgeRuntime.waitUntil(selfInvokeWithRetry(supabaseUrl, supabaseKey, jobId, supabase));
          
          return new Response(
            JSON.stringify({ success: true, message: `Block C started, continuing...` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        await processBlockCFromTable(supabase, context, jobId, recordLimit, counts, 0, 0);
      }

      // Continue to consolidation
      await supabase.from("import_jobs").update({ 
        progress: 65,
        counts,
        current_phase: "consolidating"
      }).eq("id", jobId);
      
      const consolidationResult = await consolidateData(supabase, jobId, supabaseUrl, supabaseKey);
      
      if (consolidationResult.needsContinuation) {
        return new Response(
          JSON.stringify({ success: true, message: "Consolidation in progress..." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      await supabase.from("import_jobs").update({ 
        progress: 90,
        current_phase: "refreshing_views"
      }).eq("id", jobId);

      const viewsRefreshed = await refreshMaterializedViews(supabase, jobId);
      await cleanupRawLines(supabase, jobId);

      await supabase.from("import_jobs").update({ 
        status: "completed",
        progress: 100,
        current_phase: "completed",
        counts: { ...counts, consolidation: consolidationResult, refresh_success: viewsRefreshed > 0 },
        completed_at: new Date().toISOString() 
      }).eq("id", jobId);

      await supabase.storage.from("efd-files").remove([job.file_path]);

      return new Response(
        JSON.stringify({ success: true, message: "Import completed (resumed from block_d)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===========================================================================
    // RESUMPTION: BLOCK C - Continue processing remaining chunks
    // ===========================================================================
    if (currentPhase === 'block_c') {
      const lineOffset = counts.block_c_line_offset || 0;
      
      console.log(`Job ${jobId}: Resuming Block C from offset ${lineOffset}`);

      // Get context from Block 0 lines in table
      const context = await processBlock0QuickFromTable(supabase, job.empresa_id, jobId);
      
      // Get total Block C lines count
      const { count: totalBlockCLines } = await supabase
        .from('efd_raw_lines')
        .select('*', { count: 'exact', head: true })
        .eq('job_id', jobId)
        .eq('block_type', 'C');
      
      const actualTotalLines = totalBlockCLines || 0;
      
      console.log(`Job ${jobId}: Processing Block C chunk from offset ${lineOffset}, total lines: ${actualTotalLines}`);
      
      const { processedLines, hasMore } = await processBlockCFromTable(
        supabase, context, jobId, recordLimit, counts, lineOffset, BLOCK_C_CHUNK_SIZE
      );
      
      if (hasMore) {
        // More chunks to process
        counts.block_c_line_offset = lineOffset + processedLines;
        const progress = 50 + Math.floor(((lineOffset + processedLines) / actualTotalLines) * 15);
        
        await supabase.from("import_jobs").update({ 
          progress,
          counts
        }).eq("id", jobId);
        
        // Fire-and-forget for next chunk
        const selfUrl = `${supabaseUrl}/functions/v1/process-efd-job`;
        EdgeRuntime.waitUntil(
          fetch(selfUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ job_id: jobId }),
          }).catch(err => console.error(`Job ${jobId}: Failed to invoke next chunk: ${err}`))
        );
        
        console.log(`Job ${jobId}: Block C chunk ${lineOffset}-${lineOffset + processedLines} processed, fire-and-forget for next`);
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Block C chunk ${lineOffset}-${lineOffset + processedLines} processed, continuing...`,
            counts
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // All Block C chunks done - proceed to consolidation
      console.log(`Job ${jobId}: Block C completed all chunks, proceeding to consolidation`);
      
      await supabase.from("import_jobs").update({ 
        progress: 65,
        counts,
        current_phase: "consolidating"
      }).eq("id", jobId);
      
      const consolidationResult = await consolidateData(supabase, jobId, supabaseUrl, supabaseKey);
      
      // If consolidation needs continuation, return early
      if (consolidationResult.needsContinuation) {
        console.log(`Job ${jobId}: Consolidation needs continuation, fire-and-forget already triggered`);
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Consolidation in progress (resumed from block_c), continuing...",
            consolidation: consolidationResult
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      await supabase.from("import_jobs").update({ 
        progress: 90,
        current_phase: "refreshing_views"
      }).eq("id", jobId);

      const viewsRefreshed = await refreshMaterializedViews(supabase, jobId);

      // Cleanup raw lines
      await cleanupRawLines(supabase, jobId);

      await supabase.from("import_jobs").update({ 
        status: "completed",
        progress: 100,
        current_phase: "completed",
        counts: { ...counts, consolidation: consolidationResult, refresh_success: viewsRefreshed > 0 },
        completed_at: new Date().toISOString() 
      }).eq("id", jobId);

      // Delete file from storage
      await supabase.storage.from("efd-files").remove([job.file_path]);

      // Send email notification
      try {
        const emailUrl = `${supabaseUrl}/functions/v1/send-import-email`;
        await fetch(emailUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
          body: JSON.stringify({ job_id: jobId }),
        });
      } catch (emailErr) {
        console.warn(`Job ${jobId}: Failed to send email:`, emailErr);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Import completed (resumed from block_c)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===========================================================================
    // RESUMPTION: CONSOLIDATING
    // ===========================================================================
    if (currentPhase === 'consolidating') {
      console.log(`Job ${jobId}: Resuming from consolidation phase...`);
      
      const consolidationResult = await consolidateData(supabase, jobId, supabaseUrl, supabaseKey);
      
      // If consolidation needs continuation, return early
      if (consolidationResult.needsContinuation) {
        console.log(`Job ${jobId}: Consolidation needs continuation, fire-and-forget already triggered`);
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Consolidation in progress (resumed), continuing...",
            consolidation: consolidationResult
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      await supabase.from("import_jobs").update({ 
        progress: 90,
        current_phase: "refreshing_views"
      }).eq("id", jobId);

      const viewsRefreshed = await refreshMaterializedViews(supabase, jobId);

      // Cleanup raw lines
      await cleanupRawLines(supabase, jobId);

      await supabase.from("import_jobs").update({ 
        status: "completed",
        progress: 100,
        current_phase: "completed",
        counts: { ...counts, consolidation: consolidationResult, refresh_success: viewsRefreshed > 0 },
        completed_at: new Date().toISOString() 
      }).eq("id", jobId);

      return new Response(
        JSON.stringify({ success: true, message: "Import completed (resumed from consolidation)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (currentPhase === 'refreshing_views') {
      console.log(`Job ${jobId}: Resuming from refreshing_views phase...`);
      
      const viewsRefreshed = await refreshMaterializedViews(supabase, jobId);

      // Cleanup raw lines
      await cleanupRawLines(supabase, jobId);

      await supabase.from("import_jobs").update({ 
        status: "completed",
        progress: 100,
        current_phase: "completed",
        counts: { ...counts, refresh_success: viewsRefreshed > 0 },
        completed_at: new Date().toISOString() 
      }).eq("id", jobId);

      return new Response(
        JSON.stringify({ success: true, message: "Import completed (resumed from view refresh)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Unknown phase
    console.warn(`Job ${jobId}: Unknown phase ${currentPhase}, marking as failed`);
    await cleanupRawLines(supabase, jobId);
    await supabase.from("import_jobs").update({ 
      status: "failed",
      current_phase: "failed",
      error_message: `Unknown phase: ${currentPhase}`,
      completed_at: new Date().toISOString() 
    }).eq("id", jobId);

    return new Response(
      JSON.stringify({ error: `Unknown phase: ${currentPhase}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error(`Job ${jobId}: Error:`, error);
    
    if (jobId) {
      // Cleanup raw lines on error
      await cleanupRawLines(supabase, jobId);
      
      await supabase
        .from("import_jobs")
        .update({ 
          status: "failed",
          current_phase: "failed",
          error_message: error.message || "Unknown error",
          completed_at: new Date().toISOString() 
        })
        .eq("id", jobId);
    }
    
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
