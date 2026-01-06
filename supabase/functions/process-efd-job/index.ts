import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 500;
const PROGRESS_UPDATE_INTERVAL = 5000; // Update progress every 5k lines

// Chunk processing limits
const MAX_LINES_PER_CHUNK = 100000; // Process max 100k lines per execution
const MAX_EXECUTION_TIME_MS = 45000; // Stop after 45 seconds to have safety margin

// Valid prefixes by scope
const ALL_PREFIXES = ["|0000|", "|C010|", "|C100|", "|C500|", "|C600|", "|D010|", "|D100|", "|D101|", "|D105|", "|D500|", "|D501|", "|D505|"];
const ONLY_C_PREFIXES = ["|0000|", "|C010|", "|C100|", "|C500|", "|C600|"];
const ONLY_D_PREFIXES = ["|0000|", "|D010|", "|D100|", "|D101|", "|D105|", "|D500|", "|D501|", "|D505|"];

type ImportScope = 'all' | 'only_c' | 'only_d';

function getValidPrefixes(scope: ImportScope): string[] {
  switch (scope) {
    case 'only_c': return ONLY_C_PREFIXES;
    case 'only_d': return ONLY_D_PREFIXES;
    default: return ALL_PREFIXES;
  }
}

type EFDType = 'icms_ipi' | 'contribuicoes' | null;

interface ParsedRecord {
  table: "mercadorias" | "energia_agua" | "fretes";
  data: Record<string, any>;
}

interface PendingRecord {
  record: ParsedRecord;
  pis: number;
  cofins: number;
}

interface ProcessingContext {
  currentPeriod: string;
  currentCNPJ: string;
  efdType: EFDType;
  pendingD100: PendingRecord | null;
  pendingD500: PendingRecord | null;
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

interface SeenCounts {
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
  return { c100: 0, c500: 0, c600: 0, d100: 0, d101: 0, d105: 0, d500: 0, d501: 0, d505: 0 };
}

// Block limits control
interface BlockLimits {
  c100: { count: number; limit: number };
  c500: { count: number; limit: number };
  c600: { count: number; limit: number };
  d100: { count: number; limit: number };
  d500: { count: number; limit: number };
}

function createBlockLimits(recordLimit: number, scope: ImportScope): BlockLimits {
  // Se recordLimit = 0, significa sem limite para todos (importação completa)
  // Se recordLimit > 0, aplica limite apenas aos blocos ativos pelo scope
  const noLimit = 0;
  
  // Blocos inativos recebem limit = -1 para serem ignorados
  const inactive = -1;
  
  switch (scope) {
    case 'only_c':
      return {
        c100: { count: 0, limit: recordLimit },
        c500: { count: 0, limit: recordLimit },
        c600: { count: 0, limit: recordLimit },
        d100: { count: 0, limit: inactive },
        d500: { count: 0, limit: inactive },
      };
    case 'only_d':
      return {
        c100: { count: 0, limit: inactive },
        c500: { count: 0, limit: inactive },
        c600: { count: 0, limit: inactive },
        d100: { count: 0, limit: recordLimit },
        d500: { count: 0, limit: recordLimit },
      };
    default: // 'all'
      return {
        c100: { count: 0, limit: recordLimit },
        c500: { count: 0, limit: recordLimit },
        c600: { count: 0, limit: recordLimit },
        d100: { count: 0, limit: recordLimit },
        d500: { count: 0, limit: recordLimit },
      };
  }
}

function allLimitsReached(limits: BlockLimits): boolean {
  // Pegar apenas blocos que têm limite definido (limit > 0)
  // Ignorar blocos inativos (limit = -1) e sem limite (limit = 0)
  const blocksWithLimits = Object.values(limits).filter(b => b.limit > 0);
  
  // Se nenhum bloco tem limite (todos = 0 ou -1), nunca para antecipadamente
  if (blocksWithLimits.length === 0) return false;
  
  // Retorna true apenas se TODOS os blocos COM limite atingiram seus limites
  return blocksWithLimits.every(b => b.count >= b.limit);
}

function parseNumber(value: string | undefined): number {
  if (!value) return 0;
  // Valores no EFD usam vírgula como separador decimal (ex: "1092,82" = R$ 1.092,82)
  return parseFloat(value.replace(",", ".")) || 0;
}

// Detecta o tipo de EFD baseado na estrutura do registro 0000
// EFD ICMS/IPI: |0000|COD_VER|COD_FIN|DT_INI|DT_FIN|NOME|...
// EFD Contribuições: |0000|COD_VER|TIPO_ESCRIT|IND_SIT_ESP|NUM_REC_ANT|DT_INI|DT_FIN|NOME|...
function detectEFDType(fields: string[]): EFDType {
  // fields[4] em ICMS/IPI é DT_INI (8 dígitos numéricos)
  // fields[4] em Contribuições é NUM_REC_ANTERIOR (pode estar vazio ou ter outro formato)
  const field4 = fields[4] || '';
  
  // Se field4 tem exatamente 8 caracteres numéricos e parece uma data (DDMMAAAA)
  if (/^\d{8}$/.test(field4)) {
    const day = parseInt(field4.substring(0, 2), 10);
    const month = parseInt(field4.substring(2, 4), 10);
    // Validar se parece uma data válida
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return 'icms_ipi';
    }
  }
  
  // Caso contrário, é Contribuições (DT_INI está no field6)
  return 'contribuicoes';
}

function getPeriodFromHeader(fields: string[], efdType: EFDType): string {
  // Posição do DT_INI depende do tipo de EFD
  // ICMS/IPI: fields[4], Contribuições: fields[6]
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

function finalizePendingD100(context: ProcessingContext): ParsedRecord | null {
  if (!context.pendingD100) return null;
  
  const record = context.pendingD100.record;
  record.data.pis = context.pendingD100.pis;
  record.data.cofins = context.pendingD100.cofins;
  context.pendingD100 = null;
  
  return record;
}

function finalizePendingD500(context: ProcessingContext): ParsedRecord | null {
  if (!context.pendingD500) return null;
  
  const record = context.pendingD500.record;
  record.data.pis = context.pendingD500.pis;
  record.data.cofins = context.pendingD500.cofins;
  context.pendingD500 = null;
  
  return record;
}

function processLine(
  line: string,
  context: ProcessingContext,
  validPrefixes: string[]
): { record: ParsedRecord | null; context: ProcessingContext; blockType?: string } {
  if (!validPrefixes.some(p => line.startsWith(p))) {
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
        // Detectar tipo de EFD na primeira vez que encontrar o registro 0000
        if (!context.efdType) {
          context.efdType = detectEFDType(fields);
          console.log(`Detected EFD type: ${context.efdType}`);
        }
        context.currentPeriod = getPeriodFromHeader(fields, context.efdType);
        // CNPJ está em posições diferentes dependendo do tipo
        // ICMS/IPI: fields[9], Contribuições: fields[9] também
        context.currentCNPJ = fields[9]?.replace(/\D/g, "") || "";
        console.log(`Parsed 0000: period=${context.currentPeriod}, CNPJ=${context.currentCNPJ}`);
      }
      break;

    case "C010":
    case "D010":
      if (fields.length > 2 && fields[2]) {
        context.currentCNPJ = fields[2].replace(/\D/g, "");
      }
      break;

    case "C100":
      // Layout diferente para ICMS/IPI e Contribuições
      blockType = "c100";
      
      if (context.efdType === 'contribuicoes') {
        // Layout EFD Contribuições - C100:
        // |C100|IND_OPER|IND_EMIT|COD_PART|COD_MOD|COD_SIT|SER|NUM_DOC|CHV_NFE|DT_DOC|DT_E_S|VL_DOC|IND_PGTO|VL_DESC|VL_ABAT_NT|VL_MERC|IND_FRT|VL_FRT|VL_SEG|VL_OUT_DA|VL_BC_ICMS|VL_ICMS|VL_BC_ICMS_ST|VL_ICMS_ST|VL_IPI|VL_PIS|VL_COFINS|VL_PIS_ST|VL_COFINS_ST|
        // Índices (após split, pos 0 vazio): 2=IND_OPER, 8=NUM_DOC, 12=VL_DOC, 22=VL_ICMS, 25=VL_IPI, 26=VL_PIS, 27=VL_COFINS
        if (fields.length > 12) {
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
                pis: fields.length > 26 ? parseNumber(fields[26]) : 0,    // Campo 26: VL_PIS (se existir)
                cofins: fields.length > 27 ? parseNumber(fields[27]) : 0, // Campo 27: VL_COFINS (se existir)
                icms: fields.length > 22 ? parseNumber(fields[22]) : 0,   // Campo 22: VL_ICMS (se existir)
                ipi: fields.length > 25 ? parseNumber(fields[25]) : 0,    // Campo 25: VL_IPI (se existir)
              },
            };
          }
        }
      } else {
        // Layout EFD ICMS/IPI - C100 (após split com índice 0 vazio):
        // 2=IND_OPER, 8=NUM_DOC, 12=VL_DOC, 22=VL_ICMS, 25=VL_IPI, 26=VL_PIS, 27=VL_COFINS
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
      }
      break;

    case "C500":
      // Energia/Água - layout diferente para ICMS/IPI e Contribuições
      blockType = "c500";
      
      if (context.efdType === 'contribuicoes') {
        // Layout EFD Contribuições - C500 (Energia/Água/Gás com crédito)
        // |C500|COD_PART|COD_MOD|COD_SIT|SER|SUB|NUM_DOC|DT_DOC|DT_E_S|VL_DOC|VL_ICMS|COD_INF|VL_PIS|VL_COFINS|
        // Indices: 2=COD_PART, 3=COD_MOD, 10=VL_DOC, 11=VL_ICMS, 13=VL_PIS, 14=VL_COFINS
        if (fields.length > 14) {
          const codMod = fields[3] || "";
          const tipoServico = codMod === "06" ? "energia" : 
                              codMod === "29" ? "agua" : 
                              codMod === "28" ? "gas" : null;
          const cnpjFornecedor = fields[2]?.replace(/\D/g, "") || null;
          const valorDoc = parseNumber(fields[10]);

          if (valorDoc > 0 && tipoServico !== null) {
            record = {
              table: "energia_agua",
              data: {
                tipo_operacao: "credito", // EFD Contribuições C500 é sempre crédito
                tipo_servico: tipoServico,
                cnpj_fornecedor: cnpjFornecedor,
                descricao: `${tipoServico === "energia" ? "Energia Elétrica" : tipoServico === "agua" ? "Água" : "Gás"} - Doc ${fields[7] || ""}`.trim().substring(0, 200),
                mes_ano: context.currentPeriod,
                valor: valorDoc,
                pis: parseNumber(fields[13]),
                cofins: parseNumber(fields[14]),
                icms: parseNumber(fields[11]),
              },
            };
          }
        }
      } else {
        // Layout EFD ICMS/IPI - C500 (Energia/Água):
        // 2=IND_OPER, 4=COD_PART, 5=COD_MOD, 7=SER, 10=VL_DOC, 13=VL_ICMS, 16=VL_PIS, 18=VL_COFINS
        if (fields.length > 18) {
          const indOper = fields[2];
          const tipoOperacao = indOper === "0" ? "credito" : "debito";
          const codMod = fields[5] || "";
          const tipoServico = codMod === "06" ? "energia" : codMod === "29" ? "agua" : null;
          const cnpjFornecedor = fields[4]?.replace(/\D/g, "") || null;
          const valorDoc = parseNumber(fields[10]);

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
      // CT-e - layout diferente para ICMS/IPI e Contribuições
      blockType = "d100";
      
      if (context.efdType === 'contribuicoes') {
        // Finalize any pending D100 before starting a new one
        record = finalizePendingD100(context);
        
        // Layout EFD Contribuições - D100 (CT-e com crédito)
        // |D100|IND_OPER|IND_EMIT|COD_PART|COD_MOD|COD_SIT|SER|SUB|NUM_DOC|CHV_CTE|DT_DOC|DT_A_P|TP_CTE|CHV_CTE_REF|VL_DOC|VL_DESC|IND_FRT|VL_SERV|VL_BC_ICMS|VL_ICMS|VL_NT|COD_INF|COD_CTA|
        // Indices: 2=IND_OPER, 4=COD_PART, 9=NUM_DOC ou 10=CHV_CTE, 15=VL_DOC, 20=VL_ICMS
        // IMPORTANTE: PIS/COFINS vêm dos registros D101 e D105
        if (fields.length > 20) {
          const indOper = fields[2];
          const tipo = indOper === "0" ? "entrada" : "saida";
          const cnpjTransportadora = fields[4]?.replace(/\D/g, "") || null;
          const valorDoc = parseNumber(fields[15]);

          if (valorDoc > 0) {
            // Store pending D100 - PIS/COFINS will be accumulated from D101/D105
            context.pendingD100 = {
              record: {
                table: "fretes",
                data: {
                  tipo,
                  mes_ano: context.currentPeriod,
                  ncm: null,
                  descricao: `CT-e ${fields[10] || fields[9] || ""}`.trim().substring(0, 200) || "Conhecimento de Transporte",
                  cnpj_transportadora: cnpjTransportadora,
                  valor: valorDoc,
                  pis: 0,      // Will be filled by D101
                  cofins: 0,   // Will be filled by D105
                  icms: parseNumber(fields[20]),
                },
              },
              pis: 0,
              cofins: 0,
            };
          }
        }
      } else {
        // Layout EFD ICMS/IPI - D100 (CT-e):
        // 2=IND_OPER, 5=COD_PART, 8=NUM_DOC, 14=VL_DOC, 23=VL_ICMS, 24=VL_PIS, 26=VL_COFINS
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
      }
      break;

    case "D101":
      // Complemento do D100 - PIS (EFD Contribuições)
      // |D101|IND_NAT_FRT|VL_ITEM|CST_PIS|NAT_BC_CR|VL_BC_PIS|ALIQ_PIS|VL_PIS|COD_CTA|
      // Indice 8 = VL_PIS
      if (context.efdType === 'contribuicoes' && context.pendingD100 && fields.length > 8) {
        context.pendingD100.pis += parseNumber(fields[8]);
      }
      break;

    case "D105":
      // Complemento do D100 - COFINS (EFD Contribuições)
      // |D105|IND_NAT_FRT|VL_ITEM|CST_COFINS|NAT_BC_CR|VL_BC_COFINS|ALIQ_COFINS|VL_COFINS|COD_CTA|
      // Indice 8 = VL_COFINS
      if (context.efdType === 'contribuicoes' && context.pendingD100 && fields.length > 8) {
        context.pendingD100.cofins += parseNumber(fields[8]);
      }
      break;

    case "D500":
      // Telecom/Comunicação - layout diferente para ICMS/IPI e Contribuições
      blockType = "d500";
      
      if (context.efdType === 'contribuicoes') {
        // Finalize any pending D100 and D500 before starting a new D500
        const pendingD100Record = finalizePendingD100(context);
        if (pendingD100Record) {
          // Return pending D100 first - D500 will be processed next
          record = pendingD100Record;
          blockType = "d100";
        }
        
        const pendingD500Record = finalizePendingD500(context);
        if (pendingD500Record && !record) {
          record = pendingD500Record;
        }
        
        // Layout EFD Contribuições - D500 (Telecom/Comunicação com crédito)
        // |D500|IND_OPER|IND_EMIT|COD_PART|COD_MOD|COD_SIT|SER|SUB|NUM_DOC|DT_DOC|DT_A_P|VL_DOC|VL_DESC|VL_SERV|VL_SERV_NT|VL_TERC|VL_DA|VL_BC_ICMS|VL_ICMS|COD_INF|COD_CTA|
        // Indices: 2=IND_OPER, 4=COD_PART, 9=NUM_DOC, 12=VL_DOC, 19=VL_ICMS
        // IMPORTANTE: PIS/COFINS vêm dos registros D501 e D505
        if (fields.length > 19) {
          const indOper = fields[2];
          const tipo = indOper === "0" ? "entrada" : "saida";
          const cnpjFornecedor = fields[4]?.replace(/\D/g, "") || null;
          const valorDoc = parseNumber(fields[12]);

          if (valorDoc > 0) {
            // Store pending D500 - PIS/COFINS will be accumulated from D501/D505
            context.pendingD500 = {
              record: {
                table: "fretes",
                data: {
                  tipo,
                  mes_ano: context.currentPeriod,
                  ncm: null,
                  descricao: `Telecom/Comunicação ${fields[9] || ""}`.trim().substring(0, 200) || "Serviço de Comunicação",
                  cnpj_transportadora: cnpjFornecedor,
                  valor: valorDoc,
                  pis: 0,      // Will be filled by D501
                  cofins: 0,   // Will be filled by D505
                  icms: parseNumber(fields[19]),
                },
              },
              pis: 0,
              cofins: 0,
            };
          }
        }
      } else {
        // Layout EFD ICMS/IPI - D500 (Telecom/Comunicação):
        // 2=IND_OPER, 4=COD_PART, 7=SER, 11=VL_DOC, 14=VL_ICMS, 17=VL_PIS, 19=VL_COFINS
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
      }
      break;

    case "D501":
      // Complemento do D500 - PIS (EFD Contribuições)
      // |D501|CST_PIS|VL_ITEM|NAT_BC_CR|VL_BC_PIS|ALIQ_PIS|VL_PIS|COD_CTA|
      // Indice 7 = VL_PIS
      if (context.efdType === 'contribuicoes' && context.pendingD500 && fields.length > 7) {
        context.pendingD500.pis += parseNumber(fields[7]);
      }
      break;

    case "D505":
      // Complemento do D500 - COFINS (EFD Contribuições)
      // |D505|CST_COFINS|VL_ITEM|NAT_BC_CR|VL_BC_COFINS|ALIQ_COFINS|VL_COFINS|COD_CTA|
      // Indice 7 = VL_COFINS
      if (context.efdType === 'contribuicoes' && context.pendingD500 && fields.length > 7) {
        context.pendingD500.cofins += parseNumber(fields[7]);
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

    // Check if job is already completed
    if (job.status === "completed") {
      console.log(`Job ${jobId}: Already completed`);
      return new Response(
        JSON.stringify({ success: true, message: "Job already completed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get resumption info
    const startByte = job.bytes_processed || 0;
    const chunkNumber = (job.chunk_number || 0) + 1;
    const isResuming = startByte > 0;

    console.log(`Job ${jobId}: Chunk ${chunkNumber}, ${isResuming ? `resuming from byte ${startByte}` : 'starting fresh'}`);

    // Get record limit and import scope from job
    const recordLimit = job.record_limit || 0;
    const importScope: ImportScope = (job.import_scope as ImportScope) || 'all';
    const validPrefixes = getValidPrefixes(importScope);
    console.log(`Job ${jobId}: Import scope: ${importScope}, Record limit: ${recordLimit === 0 ? 'unlimited' : recordLimit}`);

    // Update job status to processing (only on first chunk)
    if (!isResuming) {
      await supabase
        .from("import_jobs")
        .update({ status: "processing", started_at: new Date().toISOString() })
        .eq("id", jobId);
    }

    console.log(`Job ${jobId}: Creating signed URL for ${job.file_path}`);

    // Helper function to create signed URL with retry logic
    const createSignedUrlWithRetry = async (maxRetries: number = 3): Promise<string | null> => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`Job ${jobId}: Signed URL attempt ${attempt}/${maxRetries}`);
          
          const { data, error } = await supabase.storage
            .from("efd-files")
            .createSignedUrl(job.file_path, 3600);
          
          if (error) {
            console.error(`Signed URL attempt ${attempt} failed:`, error);
            
            // Check if error message contains HTML (API returned error page)
            if (typeof error.message === 'string' && error.message.includes('<')) {
              console.warn('Received HTML response instead of JSON, retrying...');
            }
            
            if (attempt < maxRetries) {
              const delay = 1000 * Math.pow(2, attempt - 1); // Exponential backoff: 1s, 2s, 4s
              console.log(`Job ${jobId}: Waiting ${delay}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
            return null;
          }
          
          if (data?.signedUrl) {
            console.log(`Job ${jobId}: Signed URL created successfully on attempt ${attempt}`);
            return data.signedUrl;
          }
        } catch (e) {
          console.error(`Signed URL attempt ${attempt} threw exception:`, e);
          if (attempt < maxRetries) {
            const delay = 1000 * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      return null;
    };

    // Create signed URL with retry logic
    const signedUrl = await createSignedUrlWithRetry(3);

    if (!signedUrl) {
      console.error("Failed to create signed URL after all retries");
      await supabase
        .from("import_jobs")
        .update({ 
          status: "failed", 
          error_message: "Failed to create signed URL after 3 attempts. Please try importing the file again.",
          completed_at: new Date().toISOString() 
        })
        .eq("id", jobId);
      return new Response(
        JSON.stringify({ error: "Failed to create signed URL" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch file as stream with Range header for resumption
    const fetchHeaders: HeadersInit = {};
    if (startByte > 0) {
      fetchHeaders['Range'] = `bytes=${startByte}-`;
      console.log(`Job ${jobId}: Using Range header: bytes=${startByte}-`);
    }

    const fetchResponse = await fetch(signedUrl, { headers: fetchHeaders });
    if (!fetchResponse.ok || !fetchResponse.body) {
      // 416 Range Not Satisfiable means we've reached end of file
      if (fetchResponse.status === 416) {
        console.log(`Job ${jobId}: Range not satisfiable - file fully processed`);
        // Mark as completed
        await supabase
          .from("import_jobs")
          .update({ 
            status: "completed", 
            progress: 100,
            completed_at: new Date().toISOString() 
          })
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

    // Start time for chunk limit
    const chunkStartTime = Date.now();

    // STREAMING PROCESSING - read file chunk by chunk
    const batches: BatchBuffers = {
      mercadorias: [],
      energia_agua: [],
      fretes: [],
    };
    
    // Initialize counts with existing values (for resumption)
    const existingCounts = job.counts as any || { mercadorias: 0, energia_agua: 0, fretes: 0 };
    const counts: InsertCounts = {
      mercadorias: existingCounts.mercadorias || 0,
      energia_agua: existingCounts.energia_agua || 0,
      fretes: existingCounts.fretes || 0,
    };
    
    // Track seen record counts (for diagnostics)
    const existingSeen = existingCounts.seen as SeenCounts || createSeenCounts();
    const seenCounts: SeenCounts = { ...existingSeen };
    
    // CRITICAL: Restore context from previous chunk for proper resumption
    // Without this, currentPeriod/currentCNPJ would be empty in chunks 2+ 
    // because the 0000 record was already processed in chunk 1
    const existingContext = existingCounts.context || null;
    let context: ProcessingContext = {
      currentPeriod: existingContext?.currentPeriod || "",
      currentCNPJ: existingContext?.currentCNPJ || "",
      efdType: existingContext?.efdType || null,
      pendingD100: null, // Pending records are finalized at chunk end
      pendingD500: null,
    };
    
    if (isResuming && existingContext) {
      console.log(`Job ${jobId}: Restored context from previous chunk - period: ${context.currentPeriod}, CNPJ: ${context.currentCNPJ}, efdType: ${context.efdType}`);
    }

    // Initialize block limits
    const blockLimits = createBlockLimits(recordLimit, importScope);

    // Track bytes processed in this chunk
    let bytesProcessedInChunk = 0;

    const flushBatch = async (table: keyof BatchBuffers): Promise<string | null> => {
      if (batches[table].length === 0) return null;

      // Use upsert with ignoreDuplicates to avoid inserting duplicate records
      // This requires unique constraints on the tables (will be added via migration after data cleanup)
      const { error } = await supabase.from(table).upsert(batches[table], { 
        onConflict: table === 'mercadorias' 
          ? 'filial_id,mes_ano,tipo,descricao,valor,pis,cofins,icms,ipi'
          : table === 'fretes'
          ? 'filial_id,mes_ano,tipo,valor,pis,cofins,icms'
          : 'filial_id,mes_ano,tipo_operacao,tipo_servico,valor,pis,cofins,icms',
        ignoreDuplicates: true 
      });
      if (error) {
        // If unique constraint doesn't exist yet, fall back to insert
        if (error.message.includes('constraint') || error.message.includes('unique')) {
          console.log(`Job ${jobId}: Constraint not found for ${table}, using insert (duplicates may occur)`);
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
      for (const table of ["mercadorias", "energia_agua", "fretes"] as const) {
        const err = await flushBatch(table);
        if (err) return err;
      }
      return null;
    };

    // Stream processing using TextDecoderStream - reads chunks without loading entire file
    const reader = fetchResponse.body.pipeThrough(new TextDecoderStream()).getReader();
    
    let buffer = "";
    let linesProcessedInChunk = 0;
    let totalLinesProcessed = job.total_lines || 0;
    let lastProgressUpdate = 0;
    let estimatedTotalLines = Math.ceil(job.file_size / 200); // Rough estimate: ~200 bytes per line

    console.log(`Job ${jobId}: Estimated total lines: ${estimatedTotalLines}`);

    let shouldContinueNextChunk = false;
    let reachedChunkLimit = false;

    while (true) {
      // Check if we've hit chunk limits
      const elapsedTime = Date.now() - chunkStartTime;
      if (elapsedTime > MAX_EXECUTION_TIME_MS || linesProcessedInChunk >= MAX_LINES_PER_CHUNK) {
        console.log(`Job ${jobId}: Chunk limit reached (time: ${elapsedTime}ms, lines: ${linesProcessedInChunk})`);
        shouldContinueNextChunk = true;
        reachedChunkLimit = true;
        reader.cancel();
        break;
      }

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
          const result = processLine(trimmedLine, context, validPrefixes);
          context = result.context;
          
          if (result.record && result.blockType) {
            // Validar que mes_ano não está vazio
            if (!result.record.data.mes_ano) {
              console.warn(`Job ${jobId}: Skipping final buffer record with empty mes_ano`);
            } else {
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
          }
          linesProcessedInChunk++;
          totalLinesProcessed++;
        }
        
        // Finalize any pending D100/D500 records at end of file
        const finalD100 = finalizePendingD100(context);
        if (finalD100 && finalD100.data.mes_ano) {
          if (blockLimits.d100.limit === 0 || blockLimits.d100.count < blockLimits.d100.limit) {
            blockLimits.d100.count++;
            batches.fretes.push({
              ...finalD100.data,
              filial_id: job.filial_id,
            });
            console.log(`Job ${jobId}: Finalized pending D100 at end of file`);
          }
        }
        
        const finalD500 = finalizePendingD500(context);
        if (finalD500 && finalD500.data.mes_ano) {
          if (blockLimits.d500.limit === 0 || blockLimits.d500.count < blockLimits.d500.limit) {
            blockLimits.d500.count++;
            batches.fretes.push({
              ...finalD500.data,
              filial_id: job.filial_id,
            });
            console.log(`Job ${jobId}: Finalized pending D500 at end of file`);
          }
        }
        
        break;
      }

      // Track bytes for resumption
      bytesProcessedInChunk += new TextEncoder().encode(value).length;

      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        // Check chunk limits inside loop
        const elapsedTimeInLoop = Date.now() - chunkStartTime;
        if (elapsedTimeInLoop > MAX_EXECUTION_TIME_MS || linesProcessedInChunk >= MAX_LINES_PER_CHUNK) {
          console.log(`Job ${jobId}: Chunk limit reached in loop (time: ${elapsedTimeInLoop}ms, lines: ${linesProcessedInChunk})`);
          shouldContinueNextChunk = true;
          reachedChunkLimit = true;
          break;
        }

        // Check if all limits reached
        if (allLimitsReached(blockLimits)) {
          console.log(`Job ${jobId}: All block limits reached during line processing`);
          break;
        }

        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const result = processLine(trimmedLine, context, validPrefixes);
        context = result.context;
        
        // Track seen record counts for diagnostics
        if (result.blockType) {
          const seenKey = result.blockType as keyof SeenCounts;
          if (seenKey in seenCounts) {
            seenCounts[seenKey]++;
          }
        }
        // Also track D101/D105/D501/D505 lines even when they don't produce records
        const fields = trimmedLine.split("|");
        const registro = fields[1];
        if (registro === "D101" && "d101" in seenCounts) seenCounts.d101++;
        if (registro === "D105" && "d105" in seenCounts) seenCounts.d105++;
        if (registro === "D501" && "d501" in seenCounts) seenCounts.d501++;
        if (registro === "D505" && "d505" in seenCounts) seenCounts.d505++;

        if (result.record && result.blockType) {
          const blockKey = result.blockType as keyof BlockLimits;
          
          // Validar que mes_ano não está vazio antes de processar
          if (!result.record.data.mes_ano) {
            console.warn(`Job ${jobId}: Skipping record with empty mes_ano (block: ${result.blockType}, line: ${totalLinesProcessed})`);
            linesProcessedInChunk++;
            totalLinesProcessed++;
            continue;
          }
          
          // Check block limit before processing
          if (blockLimits[blockKey].limit > 0 && blockLimits[blockKey].count >= blockLimits[blockKey].limit) {
            // Skip this record - limit reached for this block
            linesProcessedInChunk++;
            totalLinesProcessed++;
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
                  progress: Math.min(95, Math.round((totalLinesProcessed / estimatedTotalLines) * 100)),
                  total_lines: totalLinesProcessed,
                  counts,
                  completed_at: new Date().toISOString() 
                })
                .eq("id", jobId);
              throw new Error(`Insert error: ${err}`);
            }
          }
        }

        linesProcessedInChunk++;
        totalLinesProcessed++;

        // Update progress periodically and check for cancellation
        if (linesProcessedInChunk - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL) {
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

          const progress = Math.min(95, Math.round((totalLinesProcessed / estimatedTotalLines) * 100));
          await supabase
            .from("import_jobs")
            .update({ progress, total_lines: totalLinesProcessed, counts })
            .eq("id", jobId);
          lastProgressUpdate = linesProcessedInChunk;
          console.log(`Job ${jobId}: Progress ${progress}% (${totalLinesProcessed} lines, mercadorias: ${counts.mercadorias}, energia_agua: ${counts.energia_agua}, fretes: ${counts.fretes})`);
        }
      }

      // Break outer loop if we hit chunk limit
      if (reachedChunkLimit) {
        break;
      }
    }

    // Log block limits and seen counts info
    console.log(`Job ${jobId}: Block counts - C100: ${blockLimits.c100.count}, C500: ${blockLimits.c500.count}, C600: ${blockLimits.c600.count}, D100: ${blockLimits.d100.count}, D500: ${blockLimits.d500.count}`);
    console.log(`Job ${jobId}: Seen counts - C100: ${seenCounts.c100}, C500: ${seenCounts.c500}, C600: ${seenCounts.c600}, D100: ${seenCounts.d100}, D101: ${seenCounts.d101}, D105: ${seenCounts.d105}, D500: ${seenCounts.d500}, D501: ${seenCounts.d501}, D505: ${seenCounts.d505}`);

    // Finalize any pending D100/D500 records before flushing (important for chunk boundaries)
    const chunkFinalD100 = finalizePendingD100(context);
    if (chunkFinalD100 && chunkFinalD100.data.mes_ano) {
      if (blockLimits.d100.limit === 0 || blockLimits.d100.count < blockLimits.d100.limit) {
        blockLimits.d100.count++;
        batches.fretes.push({
          ...chunkFinalD100.data,
          filial_id: job.filial_id,
        });
        console.log(`Job ${jobId}: Finalized pending D100 at chunk end`);
      }
    }
    
    const chunkFinalD500 = finalizePendingD500(context);
    if (chunkFinalD500 && chunkFinalD500.data.mes_ano) {
      if (blockLimits.d500.limit === 0 || blockLimits.d500.count < blockLimits.d500.limit) {
        blockLimits.d500.count++;
        batches.fretes.push({
          ...chunkFinalD500.data,
          filial_id: job.filial_id,
        });
        console.log(`Job ${jobId}: Finalized pending D500 at chunk end`);
      }
    }

    // Final flush for this chunk
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

    // If we need to continue with another chunk
    if (shouldContinueNextChunk) {
      const newBytesProcessed = startByte + bytesProcessedInChunk;
      const progress = Math.min(95, Math.round((totalLinesProcessed / estimatedTotalLines) * 100));
      
      console.log(`Job ${jobId}: Chunk ${chunkNumber} completed, saving progress. Bytes: ${newBytesProcessed}, Lines: ${totalLinesProcessed}`);
      
      // Save progress for resumption (include seenCounts and context for proper resumption)
      // CRITICAL: Save context so next chunk knows the period and CNPJ
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
              efdType: context.efdType,
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

    // Job fully completed
    const totalRecords = counts.mercadorias + counts.energia_agua + counts.fretes;
    console.log(`Job ${jobId}: Completed! Total lines: ${totalLinesProcessed}, Total records: ${totalRecords}`);
    console.log(`Job ${jobId}: Final seen counts - D100: ${seenCounts.d100}, D101: ${seenCounts.d101}, D105: ${seenCounts.d105}, D500: ${seenCounts.d500}, D501: ${seenCounts.d501}, D505: ${seenCounts.d505}`);

    // Refresh materialized views so /mercadorias shows updated data immediately
    console.log(`Job ${jobId}: Refreshing materialized views...`);
    const { error: refreshError } = await supabase.rpc('refresh_materialized_views');
    if (refreshError) {
      console.warn(`Job ${jobId}: Failed to refresh materialized views:`, refreshError);
    } else {
      console.log(`Job ${jobId}: Materialized views refreshed successfully`);
    }

    // Update job as completed (include seenCounts for diagnostics)
    await supabase
      .from("import_jobs")
      .update({ 
        status: "completed", 
        progress: 100,
        total_lines: totalLinesProcessed,
        counts: { ...counts, seen: seenCounts },
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
