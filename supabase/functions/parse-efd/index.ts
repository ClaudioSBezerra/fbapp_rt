import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

function parseEfdContent(content: string): { header: EfdHeader | null; mercadorias: ParsedMercadoria[] } {
  const lines = content.split("\n");
  const mercadorias: ParsedMercadoria[] = [];
  let header: EfdHeader | null = null;

  let currentPeriod = "";
  let currentMercadoria: Partial<ParsedMercadoria> | null = null;

  for (const line of lines) {
    const fields = line.split("|");
    if (fields.length < 2) continue;

    const registro = fields[1];

    // Registro 0000 - Abertura do arquivo (contém período e dados do estabelecimento)
    // Layout: |0000|COD_VER|TIPO_ESCRIT|IND_SIT_ESP|NUM_REC_ANT|DT_INI|DT_FIN|NOME|CNPJ|UF|COD_MUN|...
    // Índices: 1=REG, 2=COD_VER, 3=TIPO, 4=IND_SIT, 5=NUM_REC, 6=DT_INI, 7=DT_FIN, 8=NOME, 9=CNPJ
    if (registro === "0000" && fields.length > 9) {
      const dtIni = fields[6]; // DDMMYYYY
      const dtFin = fields[7]; // DDMMYYYY
      const nome = fields[8];
      const cnpj = fields[9]?.replace(/\D/g, "");

      if (dtIni && dtIni.length === 8) {
        const month = dtIni.substring(2, 4);
        const year = dtIni.substring(4, 8);
        currentPeriod = `${year}-${month}-01`;
      }

      if (cnpj && cnpj.length === 14) {
        header = {
          cnpj,
          razaoSocial: nome || "Estabelecimento",
          periodoInicio: dtIni || "",
          periodoFim: dtFin || "",
        };
        console.log(`Extracted header from 0000: CNPJ=${cnpj}, Nome=${nome}`);
      }
    }

    // Registro C100 - Documento de entrada/saída (NF-e)
    if (registro === "C100" && fields.length > 7) {
      const indOper = fields[2]; // 0=Entrada, 1=Saída
      const tipo = indOper === "0" ? "entrada" : "saida";
      const valorDoc = parseFloat(fields[7]?.replace(",", ".") || "0");

      currentMercadoria = {
        tipo,
        mes_ano: currentPeriod,
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
    if (registro === "C170" && fields.length > 12 && currentMercadoria) {
      const ncm = fields[8] || null;
      const descricao = fields[4] || null;
      const valorItem = parseFloat(fields[7]?.replace(",", ".") || "0");

      if (ncm || descricao) {
        currentMercadoria.ncm = ncm;
        currentMercadoria.descricao = descricao?.substring(0, 200);
        currentMercadoria.valor = valorItem;
      }
    }

    // Registro C175 - Registro Analítico do Documento (consolidado)
    if (registro === "C175" && fields.length > 7) {
      const vlPis = parseFloat(fields[6]?.replace(",", ".") || "0");
      const vlCofins = parseFloat(fields[7]?.replace(",", ".") || "0");

      if (currentMercadoria) {
        currentMercadoria.pis = vlPis;
        currentMercadoria.cofins = vlCofins;
      }
    }

    // Registro M100 - Crédito de PIS
    if (registro === "M100" && fields.length > 7) {
      const vlCredPis = parseFloat(fields[7]?.replace(",", ".") || "0");
      if (currentMercadoria && currentMercadoria.tipo === "entrada") {
        currentMercadoria.pis = (currentMercadoria.pis || 0) + vlCredPis;
      }
    }

    // Registro M500 - Crédito de COFINS
    if (registro === "M500" && fields.length > 7) {
      const vlCredCofins = parseFloat(fields[7]?.replace(",", ".") || "0");
      if (currentMercadoria && currentMercadoria.tipo === "entrada") {
        currentMercadoria.cofins = (currentMercadoria.cofins || 0) + vlCredCofins;
      }
    }

    // Ao encontrar registro de fechamento do documento, salvar mercadoria
    if ((registro === "C190" || registro === "C990") && currentMercadoria) {
      if (currentMercadoria.valor && currentMercadoria.valor > 0) {
        mercadorias.push(currentMercadoria as ParsedMercadoria);
      }
      currentMercadoria = null;
    }

    // Bloco F - Demais documentos (Serviços, por exemplo)
    if (registro === "F100" && fields.length > 10) {
      const indOper = fields[2]; // IND_OPER: 0=Entrada, 1=Saída
      const tipo = indOper === "0" ? "entrada" : "saida";
      const vlOper = parseFloat(fields[6]?.replace(",", ".") || "0");
      const vlPis = parseFloat(fields[8]?.replace(",", ".") || "0");
      const vlCofins = parseFloat(fields[10]?.replace(",", ".") || "0");
      const descricao = fields[3] || "Serviço";

      if (vlOper > 0) {
        mercadorias.push({
          tipo,
          mes_ano: currentPeriod,
          ncm: null,
          descricao: descricao.substring(0, 200),
          valor: vlOper,
          pis: vlPis,
          cofins: vlCofins,
          icms: 0,
          ipi: 0,
        });
      }
    }
  }

  console.log(`Parsed ${mercadorias.length} mercadorias from EFD file`);
  return { header, mercadorias };
}

serve(async (req) => {
  // Handle CORS preflight requests
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

    // Get user from auth header
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

    // Verify user has access to empresa (through grupo -> tenant)
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

    const content = await file.text();
    console.log(`Processing EFD file: ${file.name}, size: ${content.length} bytes`);

    const { header, mercadorias } = parseEfdContent(content);

    if (!header || !header.cnpj) {
      return new Response(
        JSON.stringify({ error: "Could not extract CNPJ from EFD file (Registro 0000)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Header extracted: CNPJ=${header.cnpj}, Nome=${header.razaoSocial}`);

    // Check if filial exists for this empresa + CNPJ
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
      // Create new filial
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

    if (mercadorias.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          count: 0,
          filialId,
          filialCreated,
          cnpj: header.cnpj,
          razaoSocial: header.razaoSocial,
          message: filialCreated
            ? `Filial criada (CNPJ: ${header.cnpj}), mas nenhum registro de mercadoria encontrado no arquivo.`
            : `Nenhum registro de mercadoria encontrado no arquivo.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert mercadorias with filial_id
    const insertData = mercadorias.map((m) => ({
      ...m,
      filial_id: filialId,
    }));

    const { error: insertError } = await supabase
      .from("mercadorias")
      .insert(insertData);

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save records: " + insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully inserted ${mercadorias.length} mercadorias for filial ${filialId}`);

    const formatCNPJ = (cnpj: string) => {
      return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    };

    return new Response(
      JSON.stringify({
        success: true,
        count: mercadorias.length,
        filialId,
        filialCreated,
        cnpj: header.cnpj,
        razaoSocial: header.razaoSocial,
        message: filialCreated
          ? `Filial criada automaticamente (CNPJ: ${formatCNPJ(header.cnpj)}). Importados ${mercadorias.length} registros.`
          : `Importados ${mercadorias.length} registros para ${header.razaoSocial} (CNPJ: ${formatCNPJ(header.cnpj)}).`,
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
