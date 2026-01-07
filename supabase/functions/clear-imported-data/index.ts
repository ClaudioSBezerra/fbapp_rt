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
        message: "Nenhum dado para limpar",
        deleted: { mercadorias: 0, energia_agua: 0, fretes: 0, import_jobs: 0 }
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
        deleted: { mercadorias: 0, energia_agua: 0, fretes: 0, import_jobs: 0 }
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
        message: "Nenhum dado para limpar",
        deleted: { mercadorias: 0, energia_agua: 0, fretes: 0, import_jobs: 0 }
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
        message: "Nenhuma filial encontrada",
        deleted: { mercadorias: 0, energia_agua: 0, fretes: 0, import_jobs: 0 }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Contar registros antes de deletar (para estimativa)
    const [mercadoriasCount, energiaCount, fretesCount] = await Promise.all([
      supabaseAdmin.from('mercadorias').select('*', { count: 'exact', head: true }).in('filial_id', filialIds),
      supabaseAdmin.from('energia_agua').select('*', { count: 'exact', head: true }).in('filial_id', filialIds),
      supabaseAdmin.from('fretes').select('*', { count: 'exact', head: true }).in('filial_id', filialIds),
    ]);

    const estimated = {
      mercadorias: mercadoriasCount.count || 0,
      energia_agua: energiaCount.count || 0,
      fretes: fretesCount.count || 0,
    };

    console.log(`Estimated records to delete: mercadorias=${estimated.mercadorias}, energia_agua=${estimated.energia_agua}, fretes=${estimated.fretes}`);

    let totalDeleted = { mercadorias: 0, energia_agua: 0, fretes: 0, import_jobs: 0, filiais: 0 };

    // Deletar mercadorias em lotes usando RPC
    const batchSize = 10000;
    let hasMore = true;
    let iterations = 0;
    const maxIterations = 500; // Limite de segurança

    console.log("Starting mercadorias deletion using RPC batches...");
    
    while (hasMore && iterations < maxIterations) {
      iterations++;
      
      const { data: deletedCount, error: deleteError } = await supabaseAdmin
        .rpc('delete_mercadorias_batch', {
          _filial_ids: filialIds,
          _batch_size: batchSize
        });

      if (deleteError) {
        console.error(`Batch ${iterations} delete error:`, deleteError);
        break;
      }

      if (deletedCount === 0 || deletedCount === null) {
        hasMore = false;
        console.log(`Batch ${iterations}: No more mercadorias to delete`);
      } else {
        totalDeleted.mercadorias += deletedCount;
        console.log(`Batch ${iterations}: Deleted ${deletedCount} mercadorias (total: ${totalDeleted.mercadorias})`);
      }
    }

    // Deletar energia_agua usando RPC
    console.log("Starting energia_agua deletion using RPC batches...");
    hasMore = true;
    iterations = 0;
    
    while (hasMore && iterations < maxIterations) {
      iterations++;
      
      const { data: deletedCount, error: deleteError } = await supabaseAdmin
        .rpc('delete_energia_agua_batch', {
          _filial_ids: filialIds,
          _batch_size: batchSize
        });

      if (deleteError) {
        console.error(`Energia batch ${iterations} delete error:`, deleteError);
        break;
      }

      if (deletedCount === 0 || deletedCount === null) {
        hasMore = false;
        console.log(`Energia batch ${iterations}: No more records to delete`);
      } else {
        totalDeleted.energia_agua += deletedCount;
        console.log(`Energia batch ${iterations}: Deleted ${deletedCount} (total: ${totalDeleted.energia_agua})`);
      }
    }

    // Deletar fretes usando RPC
    console.log("Starting fretes deletion using RPC batches...");
    hasMore = true;
    iterations = 0;
    
    while (hasMore && iterations < maxIterations) {
      iterations++;
      
      const { data: deletedCount, error: deleteError } = await supabaseAdmin
        .rpc('delete_fretes_batch', {
          _filial_ids: filialIds,
          _batch_size: batchSize
        });

      if (deleteError) {
        console.error(`Fretes batch ${iterations} delete error:`, deleteError);
        break;
      }

      if (deletedCount === 0 || deletedCount === null) {
        hasMore = false;
        console.log(`Fretes batch ${iterations}: No more records to delete`);
      } else {
        totalDeleted.fretes += deletedCount;
        console.log(`Fretes batch ${iterations}: Deleted ${deletedCount} (total: ${totalDeleted.fretes})`);
      }
    }

    // Deletar import_jobs do usuário
    console.log("Deleting import_jobs...");
    const { error: jobsError, count: jobsCount } = await supabaseAdmin
      .from('import_jobs')
      .delete({ count: 'exact' })
      .eq('user_id', user.id);

    if (jobsError) {
      console.error("Error deleting import_jobs:", jobsError);
    } else {
      totalDeleted.import_jobs = jobsCount || 0;
    }

    // Deletar filiais
    console.log("Deleting filiais...");
    const { error: filiaisError, count: filiaisCount } = await supabaseAdmin
      .from('filiais')
      .delete({ count: 'exact' })
      .in('empresa_id', empresaIds);

    if (filiaisError) {
      console.error("Error deleting filiais:", filiaisError);
    } else {
      totalDeleted.filiais = filiaisCount || 0;
      console.log(`Deleted ${filiaisCount || 0} filiais`);
    }

    // Atualizar Materialized Views
    console.log("Refreshing materialized views...");
    try {
      await supabaseAdmin.rpc('refresh_materialized_views');
      console.log("Materialized views refreshed successfully");
    } catch (mvError) {
      console.error("Error refreshing materialized views:", mvError);
    }

    const message = `Deletados: ${totalDeleted.mercadorias.toLocaleString('pt-BR')} mercadorias, ${totalDeleted.energia_agua.toLocaleString('pt-BR')} energia/água, ${totalDeleted.fretes.toLocaleString('pt-BR')} fretes, ${totalDeleted.filiais.toLocaleString('pt-BR')} filiais`;
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
    console.error("Error in clear-imported-data:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
