import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

      // 1. Delete mercadorias
      const { count: mercadoriasCount } = await supabaseAdmin
        .from("mercadorias")
        .delete({ count: "exact" })
        .in("filial_id", filialIds);
      counts.mercadorias = mercadoriasCount || 0;

      // 2. Delete servicos
      const { count: servicosCount } = await supabaseAdmin
        .from("servicos")
        .delete({ count: "exact" })
        .in("filial_id", filialIds);
      counts.servicos = servicosCount || 0;

      // 3. Delete fretes
      const { count: fretesCount } = await supabaseAdmin
        .from("fretes")
        .delete({ count: "exact" })
        .in("filial_id", filialIds);
      counts.fretes = fretesCount || 0;

      // 4. Delete energia_agua
      const { count: energiaAguaCount } = await supabaseAdmin
        .from("energia_agua")
        .delete({ count: "exact" })
        .in("filial_id", filialIds);
      counts.energia_agua = energiaAguaCount || 0;

      // 5. Delete uso_consumo_imobilizado
      const { count: usoConsumoCount } = await supabaseAdmin
        .from("uso_consumo_imobilizado")
        .delete({ count: "exact" })
        .in("filial_id", filialIds);
      counts.uso_consumo_imobilizado = usoConsumoCount || 0;

      // 6. Delete participantes
      const { count: participantesCount } = await supabaseAdmin
        .from("participantes")
        .delete({ count: "exact" })
        .in("filial_id", filialIds);
      counts.participantes = participantesCount || 0;

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

    // Refresh materialized views
    try {
      await supabaseAdmin.rpc("refresh_materialized_views_async");
    } catch (e) {
      console.error("Error refreshing views:", e);
    }

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
