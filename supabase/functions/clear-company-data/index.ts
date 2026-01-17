import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Helper function to delete in batches to avoid timeout
async function deleteInBatches(
  supabase: any,
  table: string,
  column: string,
  values: string[],
  batchSize: number = 10000
): Promise<number> {
  let totalDeleted = 0;
  let hasMore = true;
  
  while (hasMore) {
    const { count, error } = await supabase
      .from(table)
      .delete({ count: "exact" })
      .in(column, values)
      .limit(batchSize);
    
    if (error) {
      console.error(`Error deleting from ${table}:`, error);
      throw error;
    }
    
    const deleted = count || 0;
    totalDeleted += deleted;
    
    if (deleted > 0) {
      console.log(`Deleted batch of ${deleted} from ${table} (total: ${totalDeleted})`);
    }
    
    // If we deleted less than batch size, we're done
    hasMore = deleted >= batchSize;
  }
  
  return totalDeleted;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create client with user's token for RLS
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Create admin client for bypassing RLS when needed
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get current user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if user is admin
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!roleData || roleData.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem executar esta ação" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const body = await req.json();
    const { scope, empresaId, grupoId } = body;

    console.log(`Clear data request - scope: ${scope}, empresaId: ${empresaId}, grupoId: ${grupoId}`);

    if (!scope || (scope !== "empresa" && scope !== "grupo")) {
      return new Response(
        JSON.stringify({ error: "Escopo inválido. Use 'empresa' ou 'grupo'" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get user's tenant
    const { data: userTenant } = await supabaseAdmin
      .from("user_tenants")
      .select("tenant_id")
      .eq("user_id", user.id)
      .single();

    if (!userTenant) {
      return new Response(
        JSON.stringify({ error: "Tenant não encontrado" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const tenantId = userTenant.tenant_id;
    let empresaIds: string[] = [];
    let targetName = "";

    if (scope === "empresa") {
      if (!empresaId) {
        return new Response(
          JSON.stringify({ error: "empresaId é obrigatório para escopo 'empresa'" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Verify empresa belongs to user's tenant
      const { data: empresa } = await supabaseAdmin
        .from("empresas")
        .select("id, nome, grupo_id, grupos_empresas!inner(tenant_id)")
        .eq("id", empresaId)
        .single();

      if (!empresa || (empresa.grupos_empresas as any).tenant_id !== tenantId) {
        return new Response(
          JSON.stringify({ error: "Empresa não encontrada ou não pertence ao seu ambiente" }),
          { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      empresaIds = [empresaId];
      targetName = empresa.nome;
    } else if (scope === "grupo") {
      if (!grupoId) {
        return new Response(
          JSON.stringify({ error: "grupoId é obrigatório para escopo 'grupo'" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Verify grupo belongs to user's tenant
      const { data: grupo } = await supabaseAdmin
        .from("grupos_empresas")
        .select("id, nome, tenant_id")
        .eq("id", grupoId)
        .single();

      if (!grupo || grupo.tenant_id !== tenantId) {
        return new Response(
          JSON.stringify({ error: "Grupo não encontrado ou não pertence ao seu ambiente" }),
          { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Get all empresas in this grupo
      const { data: empresas } = await supabaseAdmin
        .from("empresas")
        .select("id")
        .eq("grupo_id", grupoId);

      empresaIds = empresas?.map(e => e.id) || [];
      targetName = grupo.nome;
    }

    if (empresaIds.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Nenhuma empresa para limpar",
          counts: {}
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get all filiais for these empresas
    const { data: filiais } = await supabaseAdmin
      .from("filiais")
      .select("id")
      .in("empresa_id", empresaIds);

    const filialIds = filiais?.map(f => f.id) || [];

    console.log(`Clearing data for ${empresaIds.length} empresas, ${filialIds.length} filiais`);

    const counts: Record<string, number> = {};

    // Delete transactional data in order (respecting dependencies)
    if (filialIds.length > 0) {
      // 0. Collect CNPJs from participantes BEFORE deleting them (for simples_nacional cleanup)
      const { data: participantesCnpjs } = await supabaseAdmin
        .from("participantes")
        .select("cnpj")
        .in("filial_id", filialIds)
        .not("cnpj", "is", null);

      const cnpjsToDelete = [...new Set(participantesCnpjs?.map(p => p.cnpj).filter(Boolean) || [])];
      console.log(`Found ${cnpjsToDelete.length} unique CNPJs from participantes`);

      // 1. Delete mercadorias (using batch delete to avoid timeout)
      console.log("Starting mercadorias deletion...");
      counts.mercadorias = await deleteInBatches(supabaseAdmin, "mercadorias", "filial_id", filialIds);
      console.log(`Finished deleting ${counts.mercadorias} mercadorias`);

      // 2. Delete servicos
      console.log("Starting servicos deletion...");
      counts.servicos = await deleteInBatches(supabaseAdmin, "servicos", "filial_id", filialIds);
      console.log(`Finished deleting ${counts.servicos} servicos`);

      // 3. Delete fretes
      console.log("Starting fretes deletion...");
      counts.fretes = await deleteInBatches(supabaseAdmin, "fretes", "filial_id", filialIds);
      console.log(`Finished deleting ${counts.fretes} fretes`);

      // 4. Delete energia_agua
      console.log("Starting energia_agua deletion...");
      counts.energia_agua = await deleteInBatches(supabaseAdmin, "energia_agua", "filial_id", filialIds);
      console.log(`Finished deleting ${counts.energia_agua} energia_agua`);

      // 5. Delete uso_consumo_imobilizado
      console.log("Starting uso_consumo_imobilizado deletion...");
      counts.uso_consumo_imobilizado = await deleteInBatches(supabaseAdmin, "uso_consumo_imobilizado", "filial_id", filialIds);
      console.log(`Finished deleting ${counts.uso_consumo_imobilizado} uso_consumo_imobilizado`);

      // 6. Delete participantes
      console.log("Starting participantes deletion...");
      counts.participantes = await deleteInBatches(supabaseAdmin, "participantes", "filial_id", filialIds);
      console.log(`Finished deleting ${counts.participantes} participantes`);

      // 7. Delete simples_nacional for CNPJs that were in participantes
      if (cnpjsToDelete.length > 0) {
        const { count: simplesCount } = await supabaseAdmin
          .from("simples_nacional")
          .delete({ count: "exact" })
          .eq("tenant_id", tenantId)
          .in("cnpj", cnpjsToDelete);
        counts.simples_nacional = simplesCount || 0;
        console.log(`Deleted ${counts.simples_nacional} simples_nacional records`);
      }
    }

    // 8. Delete import_jobs for these empresas
    const { count: importJobsCount } = await supabaseAdmin
      .from("import_jobs")
      .delete({ count: "exact" })
      .in("empresa_id", empresaIds);
    counts.import_jobs = importJobsCount || 0;

    // 9. Delete filiais (only data, structure remains with empresas)
    const { count: filiaisCount } = await supabaseAdmin
      .from("filiais")
      .delete({ count: "exact" })
      .in("empresa_id", empresaIds);
    counts.filiais = filiaisCount || 0;

    // Log the action
    await supabaseAdmin.from("audit_logs").insert({
      user_id: user.id,
      tenant_id: tenantId,
      action: `clear_${scope}_data`,
      table_name: scope === "empresa" ? "empresas" : "grupos_empresas",
      details: {
        target_id: scope === "empresa" ? empresaId : grupoId,
        target_name: targetName,
        counts
      },
      record_count: Object.values(counts).reduce((a, b) => a + b, 0)
    });

    // Refresh materialized views one by one for better error handling
    console.log("Starting materialized views refresh...");
    const viewsToRefresh = [
      "mv_mercadorias_aggregated",
      "mv_fretes_aggregated", 
      "mv_energia_agua_aggregated",
      "mv_servicos_aggregated",
      "mv_uso_consumo_aggregated",
      "mv_uso_consumo_detailed",
      "mv_uso_consumo_by_simples",
      "mv_energia_agua_detailed",
      "mv_fretes_detailed",
      "mv_dashboard_stats"
    ];
    
    for (const view of viewsToRefresh) {
      try {
        console.log(`Refreshing ${view}...`);
        await supabaseAdmin.rpc("exec_sql", {
          sql: `REFRESH MATERIALIZED VIEW extensions.${view}`
        });
        console.log(`✓ Refreshed ${view}`);
      } catch (e) {
        console.error(`✗ Failed to refresh ${view}:`, e);
      }
    }
    console.log("Finished refreshing views");

    const totalDeleted = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`Successfully deleted ${totalDeleted} records`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Dados de "${targetName}" limpos com sucesso`,
        counts
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error) {
    console.error("Error clearing data:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno ao processar solicitação" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
