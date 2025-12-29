import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Note: This function now uses filial_id instead of tenant_id
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

function parseEfdContent(content: string): ParsedMercadoria[] {
  const lines = content.split("\n");
  const mercadorias: ParsedMercadoria[] = [];

  let currentPeriod = "";
  let currentMercadoria: Partial<ParsedMercadoria> | null = null;

  for (const line of lines) {
    const fields = line.split("|");
    if (fields.length < 2) continue;

    const registro = fields[1];

    // Registro 0000 - Abertura do arquivo (contém período)
    if (registro === "0000" && fields.length > 6) {
      const dtIni = fields[3]; // DDMMYYYY
      if (dtIni && dtIni.length === 8) {
        const month = dtIni.substring(2, 4);
        const year = dtIni.substring(4, 8);
        currentPeriod = `${year}-${month}-01`;
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
  return mercadorias;
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
    const tenantId = formData.get("tenant_id") as string;

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: "No tenant_id provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has access to tenant
    const { data: hasAccess } = await supabase.rpc("has_tenant_access", {
      _tenant_id: tenantId,
      _user_id: user.id,
    });

    if (!hasAccess) {
      return new Response(
        JSON.stringify({ error: "Access denied to this tenant" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const content = await file.text();
    console.log(`Processing EFD file: ${file.name}, size: ${content.length} bytes`);

    const mercadorias = parseEfdContent(content);

    if (mercadorias.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid records found in EFD file", count: 0 }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert mercadorias
    const insertData = mercadorias.map((m) => ({
      ...m,
      tenant_id: tenantId,
    }));

    const { error: insertError, count } = await supabase
      .from("mercadorias")
      .insert(insertData)
      .select();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save records: " + insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully inserted ${mercadorias.length} mercadorias`);

    return new Response(
      JSON.stringify({
        success: true,
        count: mercadorias.length,
        message: `Importados ${mercadorias.length} registros com sucesso`,
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
