import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Validar JWT usando getClaims
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims?.sub) {
      console.error("Auth error:", claimsError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const userId = claimsData.claims.sub as string;
    console.log(`Starting ICMS data cleanup for user ${userId}`);

    // Cliente com service role para bypass RLS
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verificar se usuário é admin
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    const isAdmin = userRole?.role === 'admin';
    console.log(`User role: ${userRole?.role}, isAdmin: ${isAdmin}`);

    // Buscar tenant do usuário
    const { data: userTenants } = await supabaseAdmin
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', userId);

    if (!userTenants || userTenants.length === 0) {
      console.log("No tenants found for user");
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Nenhum dado para limpar",
        deleted: { uso_consumo: 0, import_jobs: 0 }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tenantIds = userTenants.map(t => t.tenant_id);
    console.log(`Found ${tenantIds.length} tenants`);

    // Buscar grupos
    const { data: grupos } = await supabaseAdmin
      .from('grupos_empresas')
      .select('id')
      .in('tenant_id', tenantIds);

    if (!grupos || grupos.length === 0) {
      console.log("No groups found");
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Nenhum dado para limpar",
        deleted: { uso_consumo: 0, import_jobs: 0 }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const grupoIds = grupos.map(g => g.id);
    console.log(`Found ${grupoIds.length} groups`);

    let empresaIds: string[];

    if (isAdmin) {
      // Admin pode limpar todas as empresas do tenant
      const { data: empresas } = await supabaseAdmin
        .from('empresas')
        .select('id')
        .in('grupo_id', grupoIds);

      if (!empresas || empresas.length === 0) {
        console.log("No companies found");
        return new Response(JSON.stringify({ 
          success: true, 
          message: "Nenhum dado para limpar",
          deleted: { uso_consumo: 0, import_jobs: 0 }
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      empresaIds = empresas.map(e => e.id);
      console.log(`Admin: Found ${empresaIds.length} companies to clear`);
    } else {
      // Usuário comum só pode limpar empresas vinculadas
      const { data: userEmpresas } = await supabaseAdmin
        .from('user_empresas')
        .select('empresa_id')
        .eq('user_id', userId);

      if (!userEmpresas || userEmpresas.length === 0) {
        console.log("No linked companies found for user");
        return new Response(JSON.stringify({ 
          error: "Você não tem empresas vinculadas para limpar dados"
        }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      empresaIds = userEmpresas.map(ue => ue.empresa_id);
      console.log(`User: Found ${empresaIds.length} linked companies to clear`);
    }

    // Buscar filiais
    const { data: filiais } = await supabaseAdmin
      .from('filiais')
      .select('id')
      .in('empresa_id', empresaIds);

    const filialIds = filiais?.map(f => f.id) || [];
    console.log(`Found ${filialIds.length} branches`);

    if (filialIds.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Nenhuma filial encontrada",
        deleted: { uso_consumo: 0, import_jobs: 0 }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Contar registros antes de deletar
    const { count: usoConsumoCount } = await supabaseAdmin
      .from('uso_consumo_imobilizado')
      .select('*', { count: 'exact', head: true })
      .in('filial_id', filialIds);

    const estimated = {
      uso_consumo: usoConsumoCount || 0,
    };

    console.log(`Estimated records to delete: uso_consumo=${estimated.uso_consumo}`);

    let totalDeleted = { uso_consumo: 0, import_jobs: 0 };

    // Deletar uso_consumo_imobilizado em lotes usando RPC
    const batchSize = 10000;
    let hasMore = true;
    let iterations = 0;
    const maxIterations = 500;

    console.log("Starting uso_consumo_imobilizado deletion using RPC batches...");
    
    while (hasMore && iterations < maxIterations) {
      iterations++;
      
      const { data: deletedCount, error: deleteError } = await supabaseAdmin
        .rpc('delete_uso_consumo_batch', {
          _user_id: userId,
          _filial_ids: filialIds,
          _batch_size: batchSize
        });

      if (deleteError) {
        console.error(`Batch ${iterations} delete error:`, deleteError);
        break;
      }

      if (deletedCount === 0 || deletedCount === null) {
        hasMore = false;
        console.log(`Batch ${iterations}: No more uso_consumo to delete`);
      } else {
        totalDeleted.uso_consumo += deletedCount;
        console.log(`Batch ${iterations}: Deleted ${deletedCount} uso_consumo (total: ${totalDeleted.uso_consumo})`);
      }
    }

    // Deletar import_jobs do usuário com import_scope = 'icms_uso_consumo'
    console.log("Deleting import_jobs (icms_uso_consumo)...");
    const { error: jobsError, count: jobsCount } = await supabaseAdmin
      .from('import_jobs')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('import_scope', 'icms_uso_consumo');

    if (jobsError) {
      console.error("Error deleting import_jobs:", jobsError);
    } else {
      totalDeleted.import_jobs = jobsCount || 0;
    }

    // Registrar auditoria
    console.log("Recording audit log...");
    const tenantId = tenantIds[0];
    try {
      await supabaseAdmin.from('audit_logs').insert({
        user_id: userId,
        tenant_id: tenantId,
        action: 'clear_icms_data',
        table_name: 'uso_consumo_imobilizado,import_jobs',
        record_count: totalDeleted.uso_consumo + totalDeleted.import_jobs,
        details: {
          deleted: totalDeleted,
          estimated,
          filial_ids: filialIds,
          empresa_ids: empresaIds
        }
      });
      console.log("Audit log recorded");
    } catch (auditError) {
      console.error("Error recording audit log:", auditError);
    }

    // Atualizar Materialized Views individualmente para evitar timeout
    console.log("Refreshing materialized views...");
    const views = [
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
    ];

    for (const view of views) {
      try {
        await supabaseAdmin.rpc('exec_sql', {
          sql: `REFRESH MATERIALIZED VIEW ${view}`
        });
        console.log(`Refreshed ${view}`);
      } catch (err) {
        console.error(`Failed to refresh ${view}:`, err);
      }
    }
    console.log("Materialized views refresh completed");

    const message = `Deletados: ${totalDeleted.uso_consumo.toLocaleString('pt-BR')} registros de Uso/Consumo, ${totalDeleted.import_jobs.toLocaleString('pt-BR')} jobs de importação`;
    console.log(`Cleanup completed: ${message}`);

    return new Response(JSON.stringify({ 
      success: true, 
      deleted: totalDeleted,
      estimated,
      message
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in clear-icms-data:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
