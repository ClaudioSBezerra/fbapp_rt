import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 1000; // Increased batch size for raw inserts (no conflicts)
const PROGRESS_UPDATE_INTERVAL = 5000;

// Chunk processing limits
const MAX_LINES_PER_CHUNK = 100000;
const MAX_EXECUTION_TIME_MS = 45000;

// Valid prefixes by scope
const ALL_PREFIXES = ["|0000|", "|0140|", "|0150|", "|A010|", "|A100|", "|C010|", "|C100|", "|C500|", "|C600|", "|D010|", "|D100|", "|D101|", "|D105|", "|D500|", "|D501|", "|D505|"];
const ONLY_A_PREFIXES = ["|0000|", "|0140|", "|0150|", "|A010|", "|A100|"];
const ONLY_C_PREFIXES = ["|0000|", "|0140|", "|0150|", "|C010|", "|C100|", "|C500|", "|C600|"];
const ONLY_D_PREFIXES = ["|0000|", "|0140|", "|0150|", "|D010|", "|D100|", "|D101|", "|D105|", "|D500|", "|D501|", "|D505|"];

type ImportScope = 'all' | 'only_a' | 'only_c' | 'only_d';

const INTERMEDIATE_SAVE_INTERVAL = 50000;

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

interface Participante {
  codPart: string;
  nome: string;
  cnpj: string | null;
  cpf: string | null;
  ie: string | null;
  codMun: string | null;
}

function getValidPrefixes(scope: ImportScope): string[] {
  switch (scope) {
    case 'only_a': return ONLY_A_PREFIXES;
    case 'only_c': return ONLY_C_PREFIXES;
    case 'only_d': return ONLY_D_PREFIXES;
    default: return ALL_PREFIXES;
  }
}

type EFDType = 'icms_ipi' | 'contribuicoes' | null;

// NEW: Raw record types for 3-layer architecture
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

interface PendingFreteRecord {
  data: RawFretesRecord;
  pis: number;
  cofins: number;
}

interface ProcessingContext {
  currentPeriod: string;
  currentCNPJ: string;
  currentFilialId: string | null;
  efdType: EFDType;
  pendingD100: PendingFreteRecord | null;
  pendingD500: PendingFreteRecord | null;
  filialMap: Map<string, string>;
  participantesMap: Map<string, Participante>;
  estabelecimentosMap: Map<string, string>;
}

// NEW: Raw batch buffers for 3-layer architecture
interface RawBatchBuffers {
  efd_raw_c100: RawC100Record[];
  efd_raw_c500: RawC500Record[];
  efd_raw_fretes: RawFretesRecord[];
  efd_raw_a100: RawA100Record[];
  participantes: any[];
}

interface InsertCounts {
  raw_c100: number;
  raw_c500: number;
  raw_fretes: number;
  raw_a100: number;
  participantes: number;
  estabelecimentos: number;
}

interface SeenCounts {
  a100: number;
  c100: number;
  c500: number;
  c600: number;
  d100: number;
  d101: number;
  d105: number;
  d500: number;
  d501: number;
  d505: number;
}

function createSeenCounts(): SeenCounts {
  return { a100: 0, c100: 0, c500: 0, c600: 0, d100: 0, d101: 0, d105: 0, d500: 0, d501: 0, d505: 0 };
}

interface BlockLimits {
  a100: { count: number; limit: number };
  c100: { count: number; limit: number };
  c500: { count: number; limit: number };
  c600: { count: number; limit: number };
  d100: { count: number; limit: number };
  d500: { count: number; limit: number };
}

function createBlockLimits(recordLimit: number, scope: ImportScope): BlockLimits {
  const inactive = -1;
  
  switch (scope) {
    case 'only_a':
      return {
        a100: { count: 0, limit: recordLimit },
        c100: { count: 0, limit: inactive },
        c500: { count: 0, limit: inactive },
        c600: { count: 0, limit: inactive },
        d100: { count: 0, limit: inactive },
        d500: { count: 0, limit: inactive },
      };
    case 'only_c':
      return {
        a100: { count: 0, limit: inactive },
        c100: { count: 0, limit: recordLimit },
        c500: { count: 0, limit: recordLimit },
        c600: { count: 0, limit: recordLimit },
        d100: { count: 0, limit: inactive },
        d500: { count: 0, limit: inactive },
      };
    case 'only_d':
      return {
        a100: { count: 0, limit: inactive },
        c100: { count: 0, limit: inactive },
        c500: { count: 0, limit: inactive },
        c600: { count: 0, limit: inactive },
        d100: { count: 0, limit: recordLimit },
        d500: { count: 0, limit: recordLimit },
      };
    default:
      return {
        a100: { count: 0, limit: recordLimit },
        c100: { count: 0, limit: recordLimit },
        c500: { count: 0, limit: recordLimit },
        c600: { count: 0, limit: recordLimit },
        d100: { count: 0, limit: recordLimit },
        d500: { count: 0, limit: recordLimit },
      };
  }
}

function allLimitsReached(limits: BlockLimits): boolean {
  const blocksWithLimits = Object.values(limits).filter(b => b.limit > 0);
  if (blocksWithLimits.length === 0) return false;
  return blocksWithLimits.every(b => b.count >= b.limit);
}

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

function finalizePendingD100(context: ProcessingContext): RawFretesRecord | null {
  if (!context.pendingD100) return null;
  
  const record = context.pendingD100.data;
  record.pis = context.pendingD100.pis;
  record.cofins = context.pendingD100.cofins;
  context.pendingD100 = null;
  
  return record;
}

function finalizePendingD500(context: ProcessingContext): RawFretesRecord | null {
  if (!context.pendingD500) return null;
  
  const record = context.pendingD500.data;
  record.pis = context.pendingD500.pis;
  record.cofins = context.pendingD500.cofins;
  context.pendingD500 = null;
  
  return record;
}

// NEW: Result type for raw record processing
interface ProcessLineResult {
  rawC100?: RawC100Record;
  rawC500?: RawC500Record;
  rawFretes?: RawFretesRecord;
  rawA100?: RawA100Record;
  context: ProcessingContext;
  blockType?: string;
  filialUpdate?: string;
  participanteData?: Participante;
  createFilial?: { cnpj: string; nome: string; codEst: string };
}

function processLine(
  line: string,
  context: ProcessingContext,
  validPrefixes: string[],
  jobId: string
): ProcessLineResult {
  if (!validPrefixes.some(p => line.startsWith(p))) {
    return { context };
  }

  const fields = line.split("|");
  if (fields.length < 2) {
    return { context };
  }

  const registro = fields[1];
  let blockType: string | undefined;

  switch (registro) {
    case "0000":
      if (fields.length > 9) {
        if (!context.efdType) {
          context.efdType = detectEFDType(fields);
          console.log(`Detected EFD type: ${context.efdType}`);
        }
        context.currentPeriod = getPeriodFromHeader(fields, context.efdType);
        context.currentCNPJ = fields[9]?.replace(/\D/g, "") || "";
        console.log(`Parsed 0000: period=${context.currentPeriod}, CNPJ=${context.currentCNPJ}`);
      }
      break;

    case "0140":
      if (fields.length > 4) {
        const codEst = fields[2] || "";
        const nome = fields[3] || "";
        const cnpj = fields[4]?.replace(/\D/g, "") || "";
        
        if (codEst && cnpj) {
          context.estabelecimentosMap.set(cnpj, codEst);
          console.log(`Parsed 0140: COD_EST=${codEst}, NOME=${nome}, CNPJ=${cnpj}`);
          
          if (context.filialMap.has(cnpj)) {
            context.currentFilialId = context.filialMap.get(cnpj)!;
            context.currentCNPJ = cnpj;
            return { 
              context, 
              createFilial: { cnpj, nome: nome || `Filial ${cnpj}`, codEst } 
            };
          } else {
            return { 
              context, 
              createFilial: { cnpj, nome: nome || `Filial ${cnpj}`, codEst } 
            };
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
          return {
            context,
            participanteData: { codPart, nome, cnpj, cpf, ie, codMun }
          };
        }
      }
      break;

    case "A010":
    case "C010":
    case "D010":
      if (fields.length > 2 && fields[2]) {
        const cnpj = fields[2].replace(/\D/g, "");
        context.currentCNPJ = cnpj;
        
        if (context.filialMap.has(cnpj)) {
          context.currentFilialId = context.filialMap.get(cnpj)!;
          console.log(`${registro}: Switched to filial ${cnpj} -> ${context.currentFilialId}`);
        } else {
          console.warn(`${registro}: Filial ${cnpj} not found in map, will create`);
          return { context, filialUpdate: cnpj };
        }
      }
      break;

    case "A100":
      blockType = "a100";
      
      if (fields.length > 12 && context.currentFilialId && context.currentPeriod) {
        const indOper = fields[2];
        const tipo = indOper === "0" ? "entrada" : "saida";
        const valorDoc = parseNumber(fields[12]);
        
        if (valorDoc > 0) {
          return {
            context,
            blockType,
            rawA100: {
              import_job_id: jobId,
              filial_id: context.currentFilialId,
              mes_ano: context.currentPeriod,
              tipo,
              valor: valorDoc,
              pis: fields.length > 16 ? parseNumber(fields[16]) : 0,
              cofins: fields.length > 18 ? parseNumber(fields[18]) : 0,
              iss: fields.length > 21 ? parseNumber(fields[21]) : 0,
            },
          };
        }
      }
      break;

    case "C100":
      blockType = "c100";
      
      if (context.currentFilialId && context.currentPeriod) {
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
              return {
                context,
                blockType,
                rawC100: {
                  import_job_id: jobId,
                  filial_id: context.currentFilialId,
                  mes_ano: context.currentPeriod,
                  tipo,
                  cod_part: codPart,
                  valor: valorDoc,
                  pis: fields.length > 26 ? parseNumber(fields[26]) : 0,
                  cofins: fields.length > 27 ? parseNumber(fields[27]) : 0,
                  icms: fields.length > 22 ? parseNumber(fields[22]) : 0,
                  ipi: fields.length > 25 ? parseNumber(fields[25]) : 0,
                },
              };
            }
          }
        } else {
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
              return {
                context,
                blockType,
                rawC100: {
                  import_job_id: jobId,
                  filial_id: context.currentFilialId,
                  mes_ano: context.currentPeriod,
                  tipo,
                  cod_part: codPart,
                  valor: valorDoc,
                  pis: parseNumber(fields[26]),
                  cofins: parseNumber(fields[27]),
                  icms: parseNumber(fields[22]),
                  ipi: parseNumber(fields[25]),
                },
              };
            }
          }
        }
      }
      break;

    case "C500":
      blockType = "c500";
      
      const codModMapC500: Record<string, string> = {
        "06": "energia",
        "21": "comunicacao",
        "22": "comunicacao",
        "28": "gas",
        "29": "agua",
      };
      
      if (context.currentFilialId && context.currentPeriod) {
        if (context.efdType === 'contribuicoes') {
          if (fields.length > 10) {
            const codMod = fields[3] || "";
            const tipoServico = codModMapC500[codMod] || "outros";
            const cnpjFornecedor = fields[2]?.replace(/\D/g, "") || null;
            const valorDoc = parseNumber(fields[10]);

            if (valorDoc > 0) {
              return {
                context,
                blockType,
                rawC500: {
                  import_job_id: jobId,
                  filial_id: context.currentFilialId,
                  mes_ano: context.currentPeriod,
                  tipo_operacao: "credito",
                  tipo_servico: tipoServico,
                  cnpj_fornecedor: cnpjFornecedor,
                  valor: valorDoc,
                  pis: fields.length > 13 ? parseNumber(fields[13]) : 0,
                  cofins: fields.length > 14 ? parseNumber(fields[14]) : 0,
                  icms: fields.length > 11 ? parseNumber(fields[11]) : 0,
                },
              };
            }
          }
        } else {
          if (fields.length > 10) {
            const indOper = fields[2];
            const tipoOperacao = indOper === "0" ? "credito" : "debito";
            const codMod = fields[5] || "";
            const tipoServico = codModMapC500[codMod] || "outros";
            const cnpjFornecedor = fields[4]?.replace(/\D/g, "") || null;
            const valorDoc = parseNumber(fields[10]);

            if (valorDoc > 0) {
              return {
                context,
                blockType,
                rawC500: {
                  import_job_id: jobId,
                  filial_id: context.currentFilialId,
                  mes_ano: context.currentPeriod,
                  tipo_operacao: tipoOperacao,
                  tipo_servico: tipoServico,
                  cnpj_fornecedor: cnpjFornecedor,
                  valor: valorDoc,
                  pis: fields.length > 16 ? parseNumber(fields[16]) : 0,
                  cofins: fields.length > 18 ? parseNumber(fields[18]) : 0,
                  icms: fields.length > 13 ? parseNumber(fields[13]) : 0,
                },
              };
            }
          }
        }
      }
      break;

    case "C600":
      // C600 goes to raw_c100 as mercadorias
      blockType = "c600";
      
      if (context.currentFilialId && context.currentPeriod) {
        if (context.efdType === 'contribuicoes') {
          if (fields.length > 22) {
            const valorDoc = parseNumber(fields[10]);
            
            if (valorDoc > 0) {
              return {
                context,
                blockType,
                rawC100: {
                  import_job_id: jobId,
                  filial_id: context.currentFilialId,
                  mes_ano: context.currentPeriod,
                  tipo: "saida",
                  cod_part: null, // C600 doesn't have cod_part
                  valor: valorDoc,
                  pis: parseNumber(fields[21]),
                  cofins: parseNumber(fields[22]),
                  icms: parseNumber(fields[18]),
                  ipi: 0,
                },
              };
            }
          }
        } else {
          if (fields.length > 16) {
            const valorDoc = parseNumber(fields[7]);
            
            if (valorDoc > 0) {
              return {
                context,
                blockType,
                rawC100: {
                  import_job_id: jobId,
                  filial_id: context.currentFilialId,
                  mes_ano: context.currentPeriod,
                  tipo: "saida",
                  cod_part: null,
                  valor: valorDoc,
                  pis: parseNumber(fields[15]),
                  cofins: parseNumber(fields[16]),
                  icms: parseNumber(fields[12]),
                  ipi: 0,
                },
              };
            }
          }
        }
      }
      break;

    case "D100":
      blockType = "d100";
      
      if (context.currentFilialId && context.currentPeriod) {
        if (context.efdType === 'contribuicoes') {
          // Return any pending D100 first
          const pendingRecord = finalizePendingD100(context);
          
          if (fields.length > 20) {
            const indOper = fields[2];
            const tipo = indOper === "0" ? "entrada" : "saida";
            const chvCte = fields[10] || "";
            const cnpjTransportadora = chvCte.length >= 20 ? chvCte.substring(6, 20) : null;
            const valorDoc = parseNumber(fields[15]);

            if (valorDoc > 0) {
              context.pendingD100 = {
                data: {
                  import_job_id: jobId,
                  filial_id: context.currentFilialId,
                  mes_ano: context.currentPeriod,
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
            }
          }
          
          if (pendingRecord) {
            return { context, blockType, rawFretes: pendingRecord };
          }
        } else {
          if (fields.length > 26) {
            const indOper = fields[2];
            const tipo = indOper === "0" ? "entrada" : "saida";
            const cnpjTransportadora = fields[5]?.replace(/\D/g, "") || null;
            const valorDoc = parseNumber(fields[14]);

            if (valorDoc > 0) {
              return {
                context,
                blockType,
                rawFretes: {
                  import_job_id: jobId,
                  filial_id: context.currentFilialId,
                  mes_ano: context.currentPeriod,
                  tipo,
                  cnpj_transportadora: cnpjTransportadora,
                  valor: valorDoc,
                  pis: parseNumber(fields[24]),
                  cofins: parseNumber(fields[26]),
                  icms: parseNumber(fields[23]),
                },
              };
            }
          }
        }
      }
      break;

    case "D101":
      if (context.efdType === 'contribuicoes' && context.pendingD100 && fields.length > 8) {
        context.pendingD100.pis += parseNumber(fields[8]);
      }
      break;

    case "D105":
      if (context.efdType === 'contribuicoes' && context.pendingD100 && fields.length > 8) {
        context.pendingD100.cofins += parseNumber(fields[8]);
      }
      break;

    case "D500":
      blockType = "d500";
      
      if (context.currentFilialId && context.currentPeriod) {
        if (context.efdType === 'contribuicoes') {
          const pendingD100Record = finalizePendingD100(context);
          const pendingD500Record = finalizePendingD500(context);
          
          if (fields.length > 19) {
            const indOper = fields[2];
            const tipo = indOper === "0" ? "entrada" : "saida";
            const cnpjFornecedor = fields[4]?.replace(/\D/g, "") || null;
            const valorDoc = parseNumber(fields[12]);

            if (valorDoc > 0) {
              context.pendingD500 = {
                data: {
                  import_job_id: jobId,
                  filial_id: context.currentFilialId,
                  mes_ano: context.currentPeriod,
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
            }
          }
          
          // Return pending D100 first if exists
          if (pendingD100Record) {
            return { context, blockType: "d100", rawFretes: pendingD100Record };
          }
          if (pendingD500Record) {
            return { context, blockType, rawFretes: pendingD500Record };
          }
        } else {
          if (fields.length > 19) {
            const indOper = fields[2];
            const tipo = indOper === "0" ? "entrada" : "saida";
            const cnpjFornecedor = fields[4]?.replace(/\D/g, "") || null;
            const valorDoc = parseNumber(fields[11]);

            if (valorDoc > 0) {
              return {
                context,
                blockType,
                rawFretes: {
                  import_job_id: jobId,
                  filial_id: context.currentFilialId,
                  mes_ano: context.currentPeriod,
                  tipo,
                  cnpj_transportadora: cnpjFornecedor,
                  valor: valorDoc,
                  pis: parseNumber(fields[17]),
                  cofins: parseNumber(fields[19]),
                  icms: parseNumber(fields[14]),
                },
              };
            }
          }
        }
      }
      break;

    case "D501":
      if (context.efdType === 'contribuicoes' && context.pendingD500 && fields.length > 7) {
        context.pendingD500.pis += parseNumber(fields[7]);
      }
      break;

    case "D505":
      if (context.efdType === 'contribuicoes' && context.pendingD500 && fields.length > 7) {
        context.pendingD500.cofins += parseNumber(fields[7]);
      }
      break;
  }

  return { context, blockType };
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

    const recordLimit = job.record_limit || 0;
    const importScope = (job.import_scope || 'all') as ImportScope;
    const validPrefixes = getValidPrefixes(importScope);
    console.log(`Job ${jobId}: Using scope '${importScope}' with ${validPrefixes.length} valid prefixes, recordLimit: ${recordLimit}`);

    // Update job status to processing
    if (!isResuming) {
      await supabase
        .from("import_jobs")
        .update({ status: "processing", started_at: new Date().toISOString() })
        .eq("id", jobId);
    } else {
      await supabase
        .from("import_jobs")
        .update({ status: "processing" })
        .eq("id", jobId);
    }

    // Get signed URL for file
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("efd-files")
      .createSignedUrl(job.file_path, 3600);

    if (signedUrlError || !signedUrlData) {
      console.error("Failed to get signed URL:", signedUrlError);
      await supabase
        .from("import_jobs")
        .update({ status: "failed", error_message: "Failed to get file URL", completed_at: new Date().toISOString() })
        .eq("id", jobId);
      return new Response(
        JSON.stringify({ error: "Failed to get file URL" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch file with Range header for resumption
    const headers: Record<string, string> = {};
    if (startByte > 0) {
      headers["Range"] = `bytes=${startByte}-`;
      console.log(`Job ${jobId}: Requesting file from byte ${startByte}`);
    }

    const fetchResponse = await fetch(signedUrlData.signedUrl, { headers });

    if (!fetchResponse.ok) {
      if (fetchResponse.status === 416 && startByte > 0) {
        console.log(`Job ${jobId}: Range not satisfiable, file likely fully processed`);
        await supabase
          .from("import_jobs")
          .update({ status: "completed", progress: 100, completed_at: new Date().toISOString() })
          .eq("id", jobId);
        return new Response(
          JSON.stringify({ success: true, message: "File fully processed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
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

    console.log(`Job ${jobId}: Stream connected, starting chunk ${chunkNumber} processing`);

    const chunkStartTime = Date.now();

    // NEW: Raw batch buffers for 3-layer architecture
    const batches: RawBatchBuffers = {
      efd_raw_c100: [],
      efd_raw_c500: [],
      efd_raw_fretes: [],
      efd_raw_a100: [],
      participantes: [],
    };
    
    const existingCounts = job.counts as any || {};
    const counts: InsertCounts = {
      raw_c100: existingCounts.raw_c100 || 0,
      raw_c500: existingCounts.raw_c500 || 0,
      raw_fretes: existingCounts.raw_fretes || 0,
      raw_a100: existingCounts.raw_a100 || 0,
      participantes: existingCounts.participantes || 0,
      estabelecimentos: existingCounts.estabelecimentos || 0,
    };
    
    const existingSeen = existingCounts.seen as SeenCounts || createSeenCounts();
    const seenCounts: SeenCounts = { ...existingSeen };
    
    const existingContext = existingCounts.context || null;
    
    // Pre-load filiais
    const { data: existingFiliais } = await supabase
      .from("filiais")
      .select("id, cnpj")
      .eq("empresa_id", job.empresa_id);
    
    const filialMap = new Map<string, string>(
      existingFiliais?.map((f: { cnpj: string; id: string }) => [f.cnpj, f.id]) || []
    );
    console.log(`Job ${jobId}: Pre-loaded ${filialMap.size} filiais for empresa ${job.empresa_id}`);
    
    if (existingContext?.filialMapEntries) {
      for (const [cnpj, id] of existingContext.filialMapEntries) {
        filialMap.set(cnpj, id);
      }
    }
    
    let context: ProcessingContext = {
      currentPeriod: existingContext?.currentPeriod || "",
      currentCNPJ: existingContext?.currentCNPJ || "",
      currentFilialId: existingContext?.currentFilialId || job.filial_id,
      efdType: existingContext?.efdType || null,
      pendingD100: null,
      pendingD500: null,
      filialMap,
      participantesMap: new Map(),
      estabelecimentosMap: new Map(),
    };
    
    if (isResuming && existingContext) {
      console.log(`Job ${jobId}: Restored context from previous chunk - period: ${context.currentPeriod}, CNPJ: ${context.currentCNPJ}, filialId: ${context.currentFilialId}, efdType: ${context.efdType}`);
    }
    
    const genericParticipantsCreated = new Set<string>();
    const blockLimits = createBlockLimits(recordLimit, importScope);
    let bytesProcessedInChunk = 0;

    // NEW: Flush function for raw tables (simple INSERT, no conflicts)
    const flushRawBatch = async (table: keyof RawBatchBuffers): Promise<string | null> => {
      if (batches[table].length === 0) return null;

      const { error } = await supabase.from(table).insert(batches[table]);
      if (error) {
        console.error(`Insert error for ${table}:`, error);
        return error.message;
      }

      const countKey = table === 'efd_raw_c100' ? 'raw_c100' :
                       table === 'efd_raw_c500' ? 'raw_c500' :
                       table === 'efd_raw_fretes' ? 'raw_fretes' :
                       table === 'efd_raw_a100' ? 'raw_a100' : 'participantes';
      counts[countKey as keyof InsertCounts] += batches[table].length;
      batches[table] = [];
      return null;
    };

    const flushParticipantes = async (): Promise<string | null> => {
      if (batches.participantes.length === 0) return null;
      
      const { error } = await supabase.from('participantes').upsert(batches.participantes, { 
        onConflict: 'filial_id,cod_part',
        ignoreDuplicates: true 
      });
      if (error) {
        console.error(`Upsert error for participantes:`, error);
        return error.message;
      }
      
      counts.participantes += batches.participantes.length;
      batches.participantes = [];
      return null;
    };

    const flushAllBatches = async (): Promise<string | null> => {
      for (const table of ["efd_raw_c100", "efd_raw_c500", "efd_raw_fretes", "efd_raw_a100"] as const) {
        const err = await flushRawBatch(table);
        if (err) return err;
      }
      const partErr = await flushParticipantes();
      if (partErr) return partErr;
      return null;
    };

    const reader = fetchResponse.body!.pipeThrough(new TextDecoderStream()).getReader();
    
    let buffer = "";
    let linesProcessedInChunk = 0;
    let totalLinesProcessed = job.total_lines || 0;
    let lastProgressUpdate = 0;
    let estimatedTotalLines = Math.ceil(job.file_size / 200);

    console.log(`Job ${jobId}: Estimated total lines: ${estimatedTotalLines}`);

    let shouldContinueNextChunk = false;
    let reachedChunkLimit = false;

    while (true) {
      const elapsedTime = Date.now() - chunkStartTime;
      if (elapsedTime > MAX_EXECUTION_TIME_MS || linesProcessedInChunk >= MAX_LINES_PER_CHUNK) {
        console.log(`Job ${jobId}: Chunk limit reached (time: ${elapsedTime}ms, lines: ${linesProcessedInChunk})`);
        shouldContinueNextChunk = true;
        reachedChunkLimit = true;
        reader.cancel();
        break;
      }

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
          const result = processLine(trimmedLine, context, validPrefixes, jobId);
          context = result.context;
          
          if (result.createFilial) {
            const { cnpj, nome, codEst } = result.createFilial;
            if (context.filialMap.has(cnpj)) {
              context.currentFilialId = context.filialMap.get(cnpj)!;
              await supabase.from("filiais").update({ cod_est: codEst, razao_social: nome }).eq("id", context.currentFilialId);
            } else {
              const { data: newFilial } = await supabase.from("filiais")
                .insert({ empresa_id: job.empresa_id, cnpj, razao_social: nome, cod_est: codEst })
                .select("id").single();
              if (newFilial) {
                context.filialMap.set(cnpj, newFilial.id);
                context.currentFilialId = newFilial.id;
                counts.estabelecimentos++;
              }
            }
          }
          
          if (result.filialUpdate) {
            const cnpj = result.filialUpdate;
            const codEst = context.estabelecimentosMap.get(cnpj) || null;
            if (context.filialMap.has(cnpj)) {
              context.currentFilialId = context.filialMap.get(cnpj)!;
              if (codEst) {
                await supabase.from("filiais").update({ cod_est: codEst }).eq("id", context.currentFilialId);
              }
            } else {
              const { data: newFilial } = await supabase.from("filiais")
                .insert({ empresa_id: job.empresa_id, cnpj, razao_social: `Filial ${cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}`, cod_est: codEst })
                .select("id").single();
              if (newFilial) {
                context.filialMap.set(cnpj, newFilial.id);
                context.currentFilialId = newFilial.id;
                counts.estabelecimentos++;
              }
            }
          }
          
          // Add raw records to batches
          if (result.rawC100) batches.efd_raw_c100.push(result.rawC100);
          if (result.rawC500) batches.efd_raw_c500.push(result.rawC500);
          if (result.rawFretes) batches.efd_raw_fretes.push(result.rawFretes);
          if (result.rawA100) batches.efd_raw_a100.push(result.rawA100);
          
          linesProcessedInChunk++;
          totalLinesProcessed++;
        }
        
        // Finalize pending D100/D500
        const finalD100 = finalizePendingD100(context);
        if (finalD100) {
          batches.efd_raw_fretes.push(finalD100);
        }
        
        const finalD500 = finalizePendingD500(context);
        if (finalD500) {
          batches.efd_raw_fretes.push(finalD500);
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
          console.log(`Job ${jobId}: Chunk limit reached in loop (time: ${elapsedTimeInLoop}ms, lines: ${linesProcessedInChunk})`);
          shouldContinueNextChunk = true;
          reachedChunkLimit = true;
          break;
        }

        if (allLimitsReached(blockLimits)) {
          console.log(`Job ${jobId}: All block limits reached during line processing`);
          break;
        }

        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const result = processLine(trimmedLine, context, validPrefixes, jobId);
        context = result.context;
        
        // Handle filial creation from 0140
        if (result.createFilial) {
          const { cnpj, nome, codEst } = result.createFilial;
          if (context.filialMap.has(cnpj)) {
            context.currentFilialId = context.filialMap.get(cnpj)!;
            await supabase.from("filiais").update({ cod_est: codEst, razao_social: nome }).eq("id", context.currentFilialId);
          } else {
            const { data: newFilial } = await supabase.from("filiais")
              .insert({ empresa_id: job.empresa_id, cnpj, razao_social: nome, cod_est: codEst })
              .select("id").single();
            if (newFilial) {
              context.filialMap.set(cnpj, newFilial.id);
              context.currentFilialId = newFilial.id;
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
        
        // Handle filial update from C010/D010
        if (result.filialUpdate) {
          const cnpj = result.filialUpdate;
          const codEst = context.estabelecimentosMap.get(cnpj) || null;
          if (context.filialMap.has(cnpj)) {
            context.currentFilialId = context.filialMap.get(cnpj)!;
            if (codEst) {
              await supabase.from("filiais").update({ cod_est: codEst }).eq("id", context.currentFilialId);
            }
          } else {
            const { data: newFilial } = await supabase.from("filiais")
              .insert({ empresa_id: job.empresa_id, cnpj, razao_social: `Filial ${cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}`, cod_est: codEst })
              .select("id").single();
            if (newFilial) {
              context.filialMap.set(cnpj, newFilial.id);
              context.currentFilialId = newFilial.id;
              counts.estabelecimentos++;
              
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
        
        // Track seen record counts
        if (result.blockType) {
          const seenKey = result.blockType as keyof SeenCounts;
          if (seenKey in seenCounts) {
            seenCounts[seenKey]++;
          }
        }
        
        // Track D101/D105/D501/D505
        const fields = trimmedLine.split("|");
        const registro = fields[1];
        if (registro === "D101" && "d101" in seenCounts) seenCounts.d101++;
        if (registro === "D105" && "d105" in seenCounts) seenCounts.d105++;
        if (registro === "D501" && "d501" in seenCounts) seenCounts.d501++;
        if (registro === "D505" && "d505" in seenCounts) seenCounts.d505++;

        // Handle participante data
        if (result.participanteData && context.currentFilialId) {
          const p = result.participanteData;
          batches.participantes.push({
            filial_id: context.currentFilialId,
            cod_part: p.codPart,
            nome: p.nome,
            cnpj: p.cnpj,
            cpf: p.cpf,
            ie: p.ie,
            cod_mun: p.codMun,
          });
          
          if (batches.participantes.length >= BATCH_SIZE) {
            const err = await flushParticipantes();
            if (err) {
              console.warn(`Job ${jobId}: Failed to flush participantes: ${err}`);
              batches.participantes = [];
            }
          }
        }

        // Add raw records to batches
        if (result.rawC100) {
          batches.efd_raw_c100.push(result.rawC100);
          if (batches.efd_raw_c100.length >= BATCH_SIZE) {
            const err = await flushRawBatch('efd_raw_c100');
            if (err) throw new Error(`Insert error: ${err}`);
          }
        }
        
        if (result.rawC500) {
          batches.efd_raw_c500.push(result.rawC500);
          if (batches.efd_raw_c500.length >= BATCH_SIZE) {
            const err = await flushRawBatch('efd_raw_c500');
            if (err) throw new Error(`Insert error: ${err}`);
          }
        }
        
        if (result.rawFretes) {
          batches.efd_raw_fretes.push(result.rawFretes);
          if (batches.efd_raw_fretes.length >= BATCH_SIZE) {
            const err = await flushRawBatch('efd_raw_fretes');
            if (err) throw new Error(`Insert error: ${err}`);
          }
        }
        
        if (result.rawA100) {
          batches.efd_raw_a100.push(result.rawA100);
          if (batches.efd_raw_a100.length >= BATCH_SIZE) {
            const err = await flushRawBatch('efd_raw_a100');
            if (err) throw new Error(`Insert error: ${err}`);
          }
        }

        linesProcessedInChunk++;
        totalLinesProcessed++;

        // Update progress periodically
        if (linesProcessedInChunk - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
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

          const progress = Math.min(90, Math.round((totalLinesProcessed / estimatedTotalLines) * 100));
          
          const shouldSaveIntermediate = linesProcessedInChunk % INTERMEDIATE_SAVE_INTERVAL < PROGRESS_UPDATE_INTERVAL;
          const intermediateBytesProcessed = startByte + bytesProcessedInChunk;
          
          await supabase
            .from("import_jobs")
            .update({ 
              progress, 
              total_lines: totalLinesProcessed, 
              counts,
              ...(shouldSaveIntermediate ? { bytes_processed: intermediateBytesProcessed } : {})
            })
            .eq("id", jobId);
          
          if (shouldSaveIntermediate) {
            console.log(`Job ${jobId}: Intermediate save at ${totalLinesProcessed} lines, ${intermediateBytesProcessed} bytes`);
          }
          
          lastProgressUpdate = linesProcessedInChunk;
          console.log(`Job ${jobId}: Progress ${progress}% (${totalLinesProcessed} lines, raw_c100: ${counts.raw_c100}, raw_c500: ${counts.raw_c500}, raw_fretes: ${counts.raw_fretes}, raw_a100: ${counts.raw_a100})`);
        }
      }

      if (reachedChunkLimit) {
        break;
      }
    }

    console.log(`Job ${jobId}: Block counts - A100: ${blockLimits.a100.count}, C100: ${blockLimits.c100.count}, C500: ${blockLimits.c500.count}, C600: ${blockLimits.c600.count}, D100: ${blockLimits.d100.count}, D500: ${blockLimits.d500.count}`);
    console.log(`Job ${jobId}: Seen counts - A100: ${seenCounts.a100}, C100: ${seenCounts.c100}, C500: ${seenCounts.c500}, C600: ${seenCounts.c600}, D100: ${seenCounts.d100}, D101: ${seenCounts.d101}, D105: ${seenCounts.d105}, D500: ${seenCounts.d500}, D501: ${seenCounts.d501}, D505: ${seenCounts.d505}`);

    // Finalize pending D100/D500 at chunk end
    const chunkFinalD100 = finalizePendingD100(context);
    if (chunkFinalD100) {
      batches.efd_raw_fretes.push(chunkFinalD100);
    }
    
    const chunkFinalD500 = finalizePendingD500(context);
    if (chunkFinalD500) {
      batches.efd_raw_fretes.push(chunkFinalD500);
    }

    // Final flush
    const flushErr = await flushAllBatches();
    if (flushErr) {
      await supabase
        .from("import_jobs")
        .update({ 
          status: "failed", 
          error_message: `Final flush error: ${flushErr}`,
          progress: 100,
          total_lines: totalLinesProcessed,
          counts: { ...counts, seen: seenCounts },
          completed_at: new Date().toISOString() 
        })
        .eq("id", jobId);
      throw new Error(`Final flush error: ${flushErr}`);
    }

    console.log(`Job ${jobId}: Chunk completed. Raw records: C100=${counts.raw_c100}, C500=${counts.raw_c500}, Fretes=${counts.raw_fretes}, A100=${counts.raw_a100}`);

    // If we need to continue with another chunk
    if (shouldContinueNextChunk) {
      const newBytesProcessed = startByte + bytesProcessedInChunk;
      const progress = Math.min(90, Math.round((totalLinesProcessed / estimatedTotalLines) * 100));
      
      console.log(`Job ${jobId}: Chunk ${chunkNumber} completed, saving progress. Bytes: ${newBytesProcessed}, Lines: ${totalLinesProcessed}`);
      
      await supabase
        .from("import_jobs")
        .update({ 
          bytes_processed: newBytesProcessed,
          chunk_number: chunkNumber,
          progress,
          total_lines: totalLinesProcessed,
          counts: { 
            ...counts, 
            seen: seenCounts,
            context: {
              currentPeriod: context.currentPeriod,
              currentCNPJ: context.currentCNPJ,
              currentFilialId: context.currentFilialId,
              efdType: context.efdType,
              filialMapEntries: Array.from(context.filialMap.entries()),
            }
          }
        })
        .eq("id", jobId);

      // Re-invoke self to continue processing
      console.log(`Job ${jobId}: Invoking next chunk...`);
      const selfUrl = `${supabaseUrl}/functions/v1/process-efd-job`;
      
      try {
        const nextChunkResponse = await fetch(selfUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ job_id: jobId }),
        });
        console.log(`Job ${jobId}: Next chunk invoked, status: ${nextChunkResponse.status}`);
      } catch (err) {
        console.error(`Job ${jobId}: Failed to invoke next chunk:`, err);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Chunk ${chunkNumber} completed, continuing...`,
          chunk_number: chunkNumber,
          bytes_processed: newBytesProcessed,
          lines_processed: totalLinesProcessed,
          counts
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ======================================================================
    // JOB FULLY COMPLETED - Now consolidate raw data into final tables
    // ======================================================================
    console.log(`Job ${jobId}: File parsing completed! Starting consolidation phase...`);
    
    await supabase
      .from("import_jobs")
      .update({ status: "consolidating", progress: 92 })
      .eq("id", jobId);

    // ======================================================================
    // INCREMENTAL CONSOLIDATION - Process C100 records in batches
    // Each batch call stays within PostgreSQL timeout limits (~3-4 seconds)
    // ======================================================================
    console.log(`Job ${jobId}: Starting incremental mercadorias consolidation...`);
    let mercadoriasTotal = 0;
    let batchNumber = 0;
    let hasMore = true;
    let initialRemaining = 0;

    // First batch to get initial count
    while (hasMore) {
      batchNumber++;
      const batchStartTime = Date.now();
      
      const { data: batchResult, error: batchError } = await supabase
        .rpc('consolidar_mercadorias_single_batch', { p_job_id: jobId, p_batch_size: 50000 });
      
      if (batchError) {
        console.error(`Job ${jobId}: Batch ${batchNumber} error:`, batchError);
        await supabase
          .from("import_jobs")
          .update({ 
            status: "failed", 
            error_message: `Consolidation batch ${batchNumber} error: ${batchError.message}`,
            completed_at: new Date().toISOString() 
          })
          .eq("id", jobId);
        throw new Error(`Consolidation batch error: ${batchError.message}`);
      }
      
      // Track initial count for progress calculation
      if (batchNumber === 1 && batchResult.remaining > 0) {
        initialRemaining = batchResult.remaining + (batchResult.batch_size || 50000);
      }
      
      mercadoriasTotal += batchResult.processed || 0;
      hasMore = batchResult.has_more === true;
      
      const batchDuration = Date.now() - batchStartTime;
      console.log(`Job ${jobId}: Batch ${batchNumber} completed in ${batchDuration}ms - processed: ${batchResult.processed}, remaining: ${batchResult.remaining}`);
      
      // Update progress (92-94% range for mercadorias consolidation)
      if (initialRemaining > 0) {
        const consolidationProgress = 1 - (batchResult.remaining / initialRemaining);
        const progress = Math.min(92 + Math.floor(consolidationProgress * 2), 94);
        await supabase.from("import_jobs").update({ progress }).eq("id", jobId);
      }
    }
    
    console.log(`Job ${jobId}: Mercadorias consolidation completed - ${batchNumber} batches, ${mercadoriasTotal} records upserted`);

    // ======================================================================
    // CONSOLIDATE OTHER RECORD TYPES (energia, fretes, serviços)
    // These are typically much smaller and can be done in single calls
    // ======================================================================
    console.log(`Job ${jobId}: Consolidating other record types...`);
    const { data: consolidationResult, error: consolidationError } = await supabase
      .rpc('consolidar_import_job', { p_job_id: jobId });
    
    if (consolidationError) {
      console.error(`Job ${jobId}: Consolidation error:`, consolidationError);
      await supabase
        .from("import_jobs")
        .update({ 
          status: "failed", 
          error_message: `Consolidation error: ${consolidationError.message}`,
          completed_at: new Date().toISOString() 
        })
        .eq("id", jobId);
      throw new Error(`Consolidation error: ${consolidationError.message}`);
    }
    
    console.log(`Job ${jobId}: Consolidation result:`, { 
      mercadorias_batches: batchNumber, 
      mercadorias_upserted: mercadoriasTotal,
      other_types: consolidationResult 
    });

    // Update status for view refresh
    await supabase
      .from("import_jobs")
      .update({ status: "refreshing_views", progress: 95 })
      .eq("id", jobId);

    // Refresh materialized views
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

    let refreshError = null;
    let viewsRefreshed = 0;
    for (const view of viewsToRefresh) {
      try {
        const { error } = await supabase.rpc('exec_sql', {
          sql: `REFRESH MATERIALIZED VIEW ${view}`
        });
        if (error) {
          console.warn(`Job ${jobId}: Failed to refresh ${view}:`, error.message);
          refreshError = error;
        } else {
          viewsRefreshed++;
          console.log(`Job ${jobId}: Refreshed ${view}`);
        }
      } catch (err) {
        console.warn(`Job ${jobId}: Exception refreshing ${view}:`, err);
        refreshError = err;
      }
    }
    console.log(`Job ${jobId}: Refreshed ${viewsRefreshed}/${viewsToRefresh.length} views`);

    // Update job as completed
    await supabase
      .from("import_jobs")
      .update({ 
        status: "completed", 
        progress: 100,
        total_lines: totalLinesProcessed,
        counts: { 
          ...counts, 
          seen: seenCounts, 
          consolidation: consolidationResult,
          refresh_success: viewsRefreshed === viewsToRefresh.length 
        },
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

    console.log(`Job ${jobId}: Import completed successfully!`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Import completed",
        total_lines: totalLinesProcessed,
        counts,
        consolidation: consolidationResult
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error(`Job ${jobId}: Error:`, error);
    
    // Check if it's a recoverable stream error
    if (isRecoverableStreamError(error) && jobId) {
      console.log(`Job ${jobId}: Recoverable stream error, will retry on next invocation`);
      
      // Don't mark as failed, just update status for retry
      await supabase
        .from("import_jobs")
        .update({ 
          status: "pending",
          error_message: `Stream error (will retry): ${error.message}`
        })
        .eq("id", jobId);
      
      // Schedule retry
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      
      setTimeout(async () => {
        try {
          await fetch(`${supabaseUrl}/functions/v1/process-efd-job`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ job_id: jobId }),
          });
        } catch (e) {
          console.error(`Job ${jobId}: Failed to schedule retry:`, e);
        }
      }, 5000);
      
      return new Response(
        JSON.stringify({ success: false, message: "Stream error, retrying...", error: error.message }),
        { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (jobId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase
        .from("import_jobs")
        .update({ 
          status: "failed", 
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
