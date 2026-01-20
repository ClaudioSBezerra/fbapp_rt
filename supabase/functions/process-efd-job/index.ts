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

// Valid prefixes by scope
const ALL_PREFIXES = ["|0000|", "|0140|", "|0150|", "|A010|", "|A100|", "|C010|", "|C100|", "|C500|", "|C600|", "|D010|", "|D100|", "|D101|", "|D105|", "|D500|", "|D501|", "|D505|"];
const ONLY_A_PREFIXES = ["|0000|", "|0140|", "|0150|", "|A010|", "|A100|"];
const ONLY_C_PREFIXES = ["|0000|", "|0140|", "|0150|", "|C010|", "|C100|", "|C500|", "|C600|"];
const ONLY_D_PREFIXES = ["|0000|", "|0140|", "|0150|", "|D010|", "|D100|", "|D101|", "|D105|", "|D500|", "|D501|", "|D505|"];

type ImportScope = 'all' | 'only_a' | 'only_c' | 'only_d';
type ProcessingPhase = 'pending' | 'parsing' | 'block_0' | 'block_d' | 'block_c' | 'consolidating' | 'refreshing_views' | 'completed' | 'failed';

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
// BLOCK SEPARATION FUNCTIONS
// ============================================================================

interface SeparatedBlocks {
  block0Lines: string[];
  blockALines: string[];
  blockCLines: string[];
  blockDLines: string[];
  totalLines: number;
}

function separateBlocks(fileContent: string, validPrefixes: string[]): SeparatedBlocks {
  const allLines = fileContent.split('\n');
  const block0Lines: string[] = [];
  const blockALines: string[] = [];
  const blockCLines: string[] = [];
  const blockDLines: string[] = [];

  for (const line of allLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Check if line starts with any valid prefix
    if (!validPrefixes.some(p => trimmed.startsWith(p))) continue;

    if (trimmed.startsWith('|0')) {
      block0Lines.push(trimmed);
    } else if (trimmed.startsWith('|A')) {
      blockALines.push(trimmed);
    } else if (trimmed.startsWith('|C')) {
      blockCLines.push(trimmed);
    } else if (trimmed.startsWith('|D')) {
      blockDLines.push(trimmed);
    }
  }

  return {
    block0Lines,
    blockALines,
    blockCLines,
    blockDLines,
    totalLines: allLines.length,
  };
}

// Streaming version - processes file line by line without loading entire content into memory
async function separateBlocksStreaming(
  fetchResponse: Response, 
  validPrefixes: string[]
): Promise<SeparatedBlocks> {
  const block0Lines: string[] = [];
  const blockALines: string[] = [];
  const blockCLines: string[] = [];
  const blockDLines: string[] = [];
  let totalLines = 0;

  const lineStream = fetchResponse.body!
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream());

  for await (const line of lineStream) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    totalLines++;
    
    // Check if line starts with any valid prefix
    if (!validPrefixes.some(p => trimmed.startsWith(p))) continue;

    if (trimmed.startsWith('|0')) {
      block0Lines.push(trimmed);
    } else if (trimmed.startsWith('|A')) {
      blockALines.push(trimmed);
    } else if (trimmed.startsWith('|C')) {
      blockCLines.push(trimmed);
    } else if (trimmed.startsWith('|D')) {
      blockDLines.push(trimmed);
    }
  }

  return {
    block0Lines,
    blockALines,
    blockCLines,
    blockDLines,
    totalLines,
  };
}

// ============================================================================
// BLOCK 0 PROCESSING - Extract context (period, filiais, participantes)
// ============================================================================

async function processBlock0(
  lines: string[],
  supabase: any,
  job: any,
  jobId: string,
  counts: InsertCounts
): Promise<BlockContext> {
  console.log(`Job ${jobId}: Processing Block 0 - ${lines.length} lines`);
  
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
// ============================================================================

async function processBlock0Quick(
  lines: string[],
  supabase: any,
  empresaId: string,
  jobId: string
): Promise<BlockContext> {
  console.log(`Job ${jobId}: Quick processing Block 0 for context - ${lines.length} lines`);
  
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
// ============================================================================

async function processBlockA(
  lines: string[],
  supabase: any,
  context: BlockContext,
  jobId: string,
  recordLimit: number,
  counts: InsertCounts
): Promise<void> {
  console.log(`Job ${jobId}: Processing Block A - ${lines.length} lines`);
  
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
// ============================================================================

interface PendingDRecord {
  data: RawFretesRecord;
  pis: number;
  cofins: number;
}

async function processBlockD(
  lines: string[],
  supabase: any,
  context: BlockContext,
  jobId: string,
  recordLimit: number,
  counts: InsertCounts
): Promise<void> {
  console.log(`Job ${jobId}: Processing Block D - ${lines.length} lines`);
  
  const batch: RawFretesRecord[] = [];
  let currentFilialId: string | null = null;
  let pendingD100: PendingDRecord | null = null;
  let pendingD500: PendingDRecord | null = null;
  let recordCount = 0;

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
  
  console.log(`Job ${jobId}: Block D completed - ${recordCount} frete records`);
}

// ============================================================================
// BLOCK C PROCESSING - Mercadorias (C100, C600) and Energia/Agua (C500)
// ============================================================================

async function processBlockC(
  lines: string[],
  supabase: any,
  context: BlockContext,
  jobId: string,
  recordLimit: number,
  counts: InsertCounts
): Promise<void> {
  console.log(`Job ${jobId}: Processing Block C - ${lines.length} lines`);
  
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
  
  console.log(`Job ${jobId}: Block C completed - C100: ${c100Count}, C500: ${c500Count}, C600: ${c600Count}`);
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
      console.log(`Job ${jobId}: Already cancelled`);
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

    const currentPhase = (job.current_phase || 'pending') as ProcessingPhase;
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
    // PHASE 1: PARSING - Download and separate file into blocks
    // ===========================================================================
    if (currentPhase === 'pending' || currentPhase === 'parsing') {
      await supabase.from("import_jobs").update({ 
        status: "processing", 
        current_phase: "parsing",
        started_at: new Date().toISOString() 
      }).eq("id", jobId);

      // Get signed URL for file
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("efd-files")
        .createSignedUrl(job.file_path, 3600);

      if (signedUrlError || !signedUrlData) {
        throw new Error("Failed to get file URL");
      }

      console.log(`Job ${jobId}: Starting streaming download for large file support...`);
      const fetchResponse = await fetch(signedUrlData.signedUrl);
      
      if (!fetchResponse.ok) {
        throw new Error(`Failed to fetch file: ${fetchResponse.status} ${fetchResponse.statusText}`);
      }

      // Use streaming to process large files without loading entire content into memory
      console.log(`Job ${jobId}: Streaming file and separating blocks...`);
      const blocks = await separateBlocksStreaming(fetchResponse, validPrefixes);
      console.log(`Job ${jobId}: Blocks separated via streaming - Block0: ${blocks.block0Lines.length}, BlockA: ${blocks.blockALines.length}, BlockC: ${blocks.blockCLines.length}, BlockD: ${blocks.blockDLines.length}, Total lines: ${blocks.totalLines}`);

      await supabase.from("import_jobs").update({ 
        progress: 10,
        total_lines: blocks.totalLines,
        current_phase: "block_0"
      }).eq("id", jobId);

      // ===========================================================================
      // PHASE 2: BLOCK 0 - Process cadastros (period, filiais, participantes)
      // ===========================================================================
      console.log(`Job ${jobId}: Starting Block 0 processing...`);
      const context = await processBlock0(blocks.block0Lines, supabase, job, jobId, counts);
      
      await supabase.from("import_jobs").update({ 
        progress: 20,
        counts,
        current_phase: "block_d",
        mes_ano: context.period || null
      }).eq("id", jobId);

      // ===========================================================================
      // PHASE 3: BLOCK D - Process fretes (D100, D500)
      // ===========================================================================
      if (importScope === 'all' || importScope === 'only_d') {
        console.log(`Job ${jobId}: Starting Block D processing...`);
        await processBlockD(blocks.blockDLines, supabase, context, jobId, recordLimit, counts);
      }
      
      await supabase.from("import_jobs").update({ 
        progress: 35,
        counts,
        current_phase: "block_c"
      }).eq("id", jobId);

      // ===========================================================================
      // PHASE 4: BLOCK A - Process serviços (A100)
      // ===========================================================================
      if (importScope === 'all' || importScope === 'only_a') {
        console.log(`Job ${jobId}: Starting Block A processing...`);
        await processBlockA(blocks.blockALines, supabase, context, jobId, recordLimit, counts);
      }

      await supabase.from("import_jobs").update({ 
        progress: 50,
        counts
      }).eq("id", jobId);

      // ===========================================================================
      // PHASE 5: BLOCK C - Process mercadorias and energia/agua (C100, C500, C600)
      // With chunking for large files to avoid timeout
      // ===========================================================================
      if (importScope === 'all' || importScope === 'only_c') {
        const totalBlockCLines = blocks.blockCLines.length;
        counts.block_c_total_lines = totalBlockCLines;
        
        if (totalBlockCLines > BLOCK_C_CHUNK_SIZE) {
          // Large Block C - process first chunk and fire-and-forget for remaining
          console.log(`Job ${jobId}: Block C has ${totalBlockCLines} lines, processing in chunks...`);
          
          const firstChunk = blocks.blockCLines.slice(0, BLOCK_C_CHUNK_SIZE);
          await processBlockC(firstChunk, supabase, context, jobId, recordLimit, counts);
          
          counts.block_c_line_offset = BLOCK_C_CHUNK_SIZE;
          
          await supabase.from("import_jobs").update({ 
            progress: 50 + Math.floor((BLOCK_C_CHUNK_SIZE / totalBlockCLines) * 15),
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
          
          console.log(`Job ${jobId}: First Block C chunk processed (${BLOCK_C_CHUNK_SIZE} lines), fire-and-forget for next chunk`);
          
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: `Block C chunk 0-${BLOCK_C_CHUNK_SIZE} processed, continuing...`,
              counts
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          // Small Block C - process all at once
          console.log(`Job ${jobId}: Starting Block C processing (${totalBlockCLines} lines)...`);
          await processBlockC(blocks.blockCLines, supabase, context, jobId, recordLimit, counts);
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
    // RESUMPTION: BLOCK C - Continue processing remaining chunks
    // ===========================================================================
    if (currentPhase === 'block_c') {
      const lineOffset = counts.block_c_line_offset || 0;
      const totalLines = counts.block_c_total_lines || 0;
      
      console.log(`Job ${jobId}: Resuming Block C from line ${lineOffset} of ${totalLines}`);

      // Re-download file and re-extract context
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("efd-files")
        .createSignedUrl(job.file_path, 3600);

      if (signedUrlError || !signedUrlData) {
        throw new Error("Failed to get file URL for resumption");
      }

      const fetchResponse = await fetch(signedUrlData.signedUrl);
      if (!fetchResponse.ok) {
        throw new Error(`Failed to fetch file: ${fetchResponse.status}`);
      }

      // Use streaming for resumption as well
      console.log(`Job ${jobId}: Streaming file for resumption...`);
      const blocks = await separateBlocksStreaming(fetchResponse, validPrefixes);
      
      // Quick processing of Block 0 to restore context (no inserts)
      const context = await processBlock0Quick(blocks.block0Lines, supabase, job.empresa_id, jobId);
      
      const actualTotalLines = blocks.blockCLines.length;
      const chunkEnd = Math.min(lineOffset + BLOCK_C_CHUNK_SIZE, actualTotalLines);
      
      console.log(`Job ${jobId}: Processing Block C chunk ${lineOffset}-${chunkEnd} of ${actualTotalLines}`);
      
      const chunk = blocks.blockCLines.slice(lineOffset, chunkEnd);
      await processBlockC(chunk, supabase, context, jobId, recordLimit, counts);
      
      if (chunkEnd < actualTotalLines) {
        // More chunks to process
        counts.block_c_line_offset = chunkEnd;
        const progress = 50 + Math.floor((chunkEnd / actualTotalLines) * 15);
        
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
        
        console.log(`Job ${jobId}: Block C chunk ${lineOffset}-${chunkEnd} processed, fire-and-forget for next`);
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Block C chunk ${lineOffset}-${chunkEnd} processed, continuing...`,
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
