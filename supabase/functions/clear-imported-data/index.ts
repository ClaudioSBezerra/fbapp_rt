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
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Cliente autenticado para verificar usuário
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Starting database cleanup for user ${user.id}`);

    // Cliente com service role para bypass RLS
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar filiais do usuário através da hierarquia
    const { data: userTenants } = await supabaseAdmin
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id);

    if (!userTenants || userTenants.length === 0) {
      console.log("No tenants found for user");
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Nenhum dado para limpar" 
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
        message: "Nenhum dado para limpar" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const grupoIds = grupos.map(g => g.id);
    console.log(`Found ${grupoIds.length} groups`);

    // Buscar empresas
    const { data: empresas } = await supabaseAdmin
      .from('empresas')
      .select('id')
      .in('grupo_id', grupoIds);

    if (!empresas || empresas.length === 0) {
      console.log("No companies found");
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Nenhum dado para limpar" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const empresaIds = empresas.map(e => e.id);
    console.log(`Found ${empresaIds.length} companies`);

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
        message: "Nenhuma filial encontrada" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalDeleted = { mercadorias: 0, energia_agua: 0, fretes: 0, import_jobs: 0 };

    // Deletar mercadorias em lotes para evitar timeout
    const batchSize = 10000;
    let hasMore = true;
    let iterations = 0;
    const maxIterations = 500; // Limite de segurança

    console.log("Starting mercadorias deletion in batches...");
    
    while (hasMore && iterations < maxIterations) {
      iterations++;
      
      const { data: toDelete, error: selectError } = await supabaseAdmin
        .from('mercadorias')
        .select('id')
        .in('filial_id', filialIds)
        .limit(batchSize);

      if (selectError) {
        console.error(`Batch ${iterations} select error:`, selectError);
        break;
      }

      if (!toDelete || toDelete.length === 0) {
        hasMore = false;
        console.log(`Batch ${iterations}: No more records to delete`);
      } else {
        const ids = toDelete.map(r => r.id);
        const { error: deleteError } = await supabaseAdmin
          .from('mercadorias')
          .delete()
          .in('id', ids);

        if (deleteError) {
          console.error(`Batch ${iterations} delete error:`, deleteError);
          break;
        }

        totalDeleted.mercadorias += ids.length;
        console.log(`Batch ${iterations}: Deleted ${ids.length} mercadorias (total: ${totalDeleted.mercadorias})`);
      }
    }

    // Deletar energia_agua
    console.log("Deleting energia_agua...");
    const { error: energiaError } = await supabaseAdmin
      .from('energia_agua')
      .delete()
      .in('filial_id', filialIds);

    if (energiaError) {
      console.error("Error deleting energia_agua:", energiaError);
    }

    // Contar após deletar
    const { count: energiaRemaining } = await supabaseAdmin
      .from('energia_agua')
      .select('*', { count: 'exact', head: true })
      .in('filial_id', filialIds);
    
    console.log(`Energia/agua remaining after delete: ${energiaRemaining || 0}`);

    // Deletar fretes
    console.log("Deleting fretes...");
    const { error: fretesError } = await supabaseAdmin
      .from('fretes')
      .delete()
      .in('filial_id', filialIds);

    if (fretesError) {
      console.error("Error deleting fretes:", fretesError);
    }

    // Deletar import_jobs do usuário
    console.log("Deleting import_jobs...");
    const { error: jobsError } = await supabaseAdmin
      .from('import_jobs')
      .delete()
      .eq('user_id', user.id);

    if (jobsError) {
      console.error("Error deleting import_jobs:", jobsError);
    }

    // Atualizar Materialized Views
    console.log("Refreshing materialized views...");
    try {
      await supabaseAdmin.rpc('refresh_materialized_views');
      console.log("Materialized views refreshed successfully");
    } catch (mvError) {
      console.error("Error refreshing materialized views:", mvError);
    }

    const message = `Deletados: ${totalDeleted.mercadorias.toLocaleString('pt-BR')} mercadorias`;
    console.log(`Cleanup completed: ${message}`);

    return new Response(JSON.stringify({ 
      success: true, 
      deleted: totalDeleted,
      message
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in clear-imported-data:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
