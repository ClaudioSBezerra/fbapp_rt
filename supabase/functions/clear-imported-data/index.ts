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
    
    // Validar JWT usando getClaims (mais confiável que getUser)
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

    console.log(`Starting database cleanup for user ${userId}`);

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
          deleted: { mercadorias: 0, energia_agua: 0, fretes: 0, import_jobs: 0 }
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

    // =========== BUSCAR IMPORT_JOB_IDS ANTES DE TUDO ===========
    console.log("Fetching import_job_ids for RAW cleanup...");
    const { data: importJobs } = await supabaseAdmin
      .from('import_jobs')
      .select('id')
      .eq('user_id', userId);
    
    const importJobIds = importJobs?.map(j => j.id) || [];
    console.log(`Found ${importJobIds.length} import_jobs to clean`);

    // Contar registros antes de deletar (para estimativa)
    const [mercadoriasCount, energiaCount, fretesCount, servicosCount, participantesCount, rawLinesCount] = await Promise.all([
      supabaseAdmin.from('mercadorias').select('*', { count: 'exact', head: true }).in('filial_id', filialIds),
      supabaseAdmin.from('energia_agua').select('*', { count: 'exact', head: true }).in('filial_id', filialIds),
      supabaseAdmin.from('fretes').select('*', { count: 'exact', head: true }).in('filial_id', filialIds),
      supabaseAdmin.from('servicos').select('*', { count: 'exact', head: true }).in('filial_id', filialIds),
      supabaseAdmin.from('participantes').select('*', { count: 'exact', head: true }).in('filial_id', filialIds),
      importJobIds.length > 0 
        ? supabaseAdmin.from('efd_raw_lines').select('*', { count: 'exact', head: true }).in('job_id', importJobIds)
        : Promise.resolve({ count: 0 }),
    ]);

    const estimated = {
      mercadorias: mercadoriasCount.count || 0,
      energia_agua: energiaCount.count || 0,
      fretes: fretesCount.count || 0,
      servicos: servicosCount.count || 0,
      participantes: participantesCount.count || 0,
      efd_raw_lines: rawLinesCount.count || 0,
    };

    console.log(`Estimated records: mercadorias=${estimated.mercadorias}, servicos=${estimated.servicos}, participantes=${estimated.participantes}, efd_raw_lines=${estimated.efd_raw_lines}`);

    let totalDeleted = { 
      mercadorias: 0, 
      energia_agua: 0, 
      fretes: 0, 
      servicos: 0, 
      participantes: 0,
      efd_raw_lines: 0,
      import_jobs: 0, 
      filiais: 0 
    };

    const batchSize = 10000;
    let hasMore = true;
    let iterations = 0;
    const maxIterations = 500; // Limite de segurança

    // =========== 1. DELETAR MERCADORIAS ===========
    console.log("Starting mercadorias deletion using RPC batches...");
    hasMore = true;
    iterations = 0;
    
    while (hasMore && iterations < maxIterations) {
      iterations++;
      
      const { data: deletedCount, error: deleteError } = await supabaseAdmin
        .rpc('delete_mercadorias_batch', {
          _user_id: userId,
          _filial_ids: filialIds,
          _batch_size: batchSize
        });

      if (deleteError) {
        console.error(`Mercadorias batch ${iterations} delete error:`, deleteError);
        break;
      }

      if (deletedCount === 0 || deletedCount === null) {
        hasMore = false;
        console.log(`Mercadorias batch ${iterations}: No more records to delete`);
      } else {
        totalDeleted.mercadorias += deletedCount;
        console.log(`Mercadorias batch ${iterations}: Deleted ${deletedCount} (total: ${totalDeleted.mercadorias})`);
      }
    }

    // =========== 2. DELETAR ENERGIA_AGUA ===========
    console.log("Starting energia_agua deletion using RPC batches...");
    hasMore = true;
    iterations = 0;
    
    while (hasMore && iterations < maxIterations) {
      iterations++;
      
      const { data: deletedCount, error: deleteError } = await supabaseAdmin
        .rpc('delete_energia_agua_batch', {
          _user_id: userId,
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

    // =========== 3. DELETAR FRETES ===========
    console.log("Starting fretes deletion using RPC batches...");
    hasMore = true;
    iterations = 0;
    
    while (hasMore && iterations < maxIterations) {
      iterations++;
      
      const { data: deletedCount, error: deleteError } = await supabaseAdmin
        .rpc('delete_fretes_batch', {
          _user_id: userId,
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

    // =========== 4. DELETAR SERVICOS ===========
    console.log("Starting servicos deletion using RPC batches...");
    hasMore = true;
    iterations = 0;

    while (hasMore && iterations < maxIterations) {
      iterations++;
      
      const { data: deletedCount, error: deleteError } = await supabaseAdmin
        .rpc('delete_servicos_batch', {
          _user_id: userId,
          _filial_ids: filialIds,
          _batch_size: batchSize
        });

      if (deleteError) {
        console.error(`Servicos batch ${iterations} delete error:`, deleteError);
        break;
      }

      if (deletedCount === 0 || deletedCount === null) {
        hasMore = false;
        console.log(`Servicos batch ${iterations}: No more records to delete`);
      } else {
        totalDeleted.servicos += deletedCount;
        console.log(`Servicos batch ${iterations}: Deleted ${deletedCount} (total: ${totalDeleted.servicos})`);
      }
    }

    // =========== 5. DELETAR PARTICIPANTES ===========
    console.log("Starting participantes deletion using RPC batches...");
    hasMore = true;
    iterations = 0;

    while (hasMore && iterations < maxIterations) {
      iterations++;
      
      const { data: deletedCount, error: deleteError } = await supabaseAdmin
        .rpc('delete_participantes_batch', {
          _user_id: userId,
          _filial_ids: filialIds,
          _batch_size: batchSize
        });

      if (deleteError) {
        console.error(`Participantes batch ${iterations} delete error:`, deleteError);
        break;
      }

      if (deletedCount === 0 || deletedCount === null) {
        hasMore = false;
        console.log(`Participantes batch ${iterations}: No more records to delete`);
      } else {
        totalDeleted.participantes += deletedCount;
        console.log(`Participantes batch ${iterations}: Deleted ${deletedCount} (total: ${totalDeleted.participantes})`);
      }
    }

    // =========== 6. DELETAR EFD_RAW_LINES (CRÍTICO) ===========
    if (importJobIds.length > 0) {
      console.log(`Starting efd_raw_lines deletion for ${importJobIds.length} jobs...`);
      hasMore = true;
      iterations = 0;
      const rawBatchSize = 50000; // Maior batch para raw lines

      while (hasMore && iterations < maxIterations) {
        iterations++;
        
        const { data: deletedCount, error: deleteError } = await supabaseAdmin
          .rpc('delete_efd_raw_lines_batch', {
            _job_ids: importJobIds,
            _batch_size: rawBatchSize
          });

        if (deleteError) {
          console.error(`RAW lines batch ${iterations} delete error:`, deleteError);
          break;
        }

        if (deletedCount === 0 || deletedCount === null) {
          hasMore = false;
          console.log(`RAW lines batch ${iterations}: No more records to delete`);
        } else {
          totalDeleted.efd_raw_lines += deletedCount;
          console.log(`RAW lines batch ${iterations}: Deleted ${deletedCount} (total: ${totalDeleted.efd_raw_lines})`);
        }
      }
    }

    // =========== 7. DELETAR IMPORT_JOBS ===========
    console.log("Deleting import_jobs...");
    const { error: jobsError, count: jobsCount } = await supabaseAdmin
      .from('import_jobs')
      .delete({ count: 'exact' })
      .eq('user_id', userId);

    if (jobsError) {
      console.error("Error deleting import_jobs:", jobsError);
    } else {
      totalDeleted.import_jobs = jobsCount || 0;
    }

    // =========== 8. DELETAR FILIAIS ===========
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

    // =========== 9. REGISTRAR AUDITORIA ===========
    console.log("Recording audit log...");
    const tenantId = tenantIds[0]; // Primeiro tenant do usuário
    try {
      await supabaseAdmin.from('audit_logs').insert({
        user_id: userId,
        tenant_id: tenantId,
        action: 'clear_imported_data',
        table_name: 'mercadorias,energia_agua,fretes,servicos,participantes,efd_raw_lines,filiais,import_jobs',
        record_count: Object.values(totalDeleted).reduce((a, b) => a + b, 0),
        details: {
          deleted: totalDeleted,
          estimated,
          filial_ids: filialIds,
          empresa_ids: empresaIds,
          import_job_ids: importJobIds
        }
      });
      console.log("Audit log recorded");
    } catch (auditError) {
      console.error("Error recording audit log:", auditError);
    }

    // =========== 10. REFRESH VIEWS (RPC CENTRALIZADO) ===========
    console.log("Refreshing materialized views using centralized RPC...");
    const { data: refreshResult, error: refreshError } = await supabaseAdmin
      .rpc('refresh_all_materialized_views');

    if (refreshError) {
      console.error("Error refreshing views via RPC:", refreshError);
    } else {
      console.log(`Views refresh result: ${refreshResult?.refreshed_count || 0}/${refreshResult?.total_views || 11} refreshed in ${refreshResult?.duration_ms || 0}ms`);
      if (refreshResult?.views_failed?.length > 0) {
        console.warn("Failed views:", refreshResult.views_failed);
      }
    }

    // =========== 11. VERIFICAÇÃO PÓS-LIMPEZA ===========
    console.log("Running post-cleanup verification...");
    const [postMercadorias, postServicos, postParticipantes, postRawLines] = await Promise.all([
      supabaseAdmin.from('mercadorias').select('*', { count: 'exact', head: true }).in('filial_id', filialIds),
      supabaseAdmin.from('servicos').select('*', { count: 'exact', head: true }).in('filial_id', filialIds),
      supabaseAdmin.from('participantes').select('*', { count: 'exact', head: true }).in('filial_id', filialIds),
      importJobIds.length > 0 
        ? supabaseAdmin.from('efd_raw_lines').select('*', { count: 'exact', head: true }).in('job_id', importJobIds)
        : Promise.resolve({ count: 0 }),
    ]);

    const verification = {
      mercadorias_remaining: postMercadorias.count || 0,
      servicos_remaining: postServicos.count || 0,
      participantes_remaining: postParticipantes.count || 0,
      efd_raw_lines_remaining: postRawLines.count || 0,
      all_clean: (postMercadorias.count || 0) === 0 && 
                 (postServicos.count || 0) === 0 && 
                 (postParticipantes.count || 0) === 0 &&
                 (postRawLines.count || 0) === 0
    };

    console.log(`Verification: all_clean=${verification.all_clean}, remaining: merc=${verification.mercadorias_remaining}, serv=${verification.servicos_remaining}, part=${verification.participantes_remaining}, raw=${verification.efd_raw_lines_remaining}`);

    const message = `Deletados: ${totalDeleted.mercadorias.toLocaleString('pt-BR')} mercadorias, ${totalDeleted.servicos.toLocaleString('pt-BR')} servicos, ${totalDeleted.participantes.toLocaleString('pt-BR')} participantes, ${totalDeleted.energia_agua.toLocaleString('pt-BR')} energia/água, ${totalDeleted.fretes.toLocaleString('pt-BR')} fretes, ${totalDeleted.efd_raw_lines.toLocaleString('pt-BR')} linhas RAW, ${totalDeleted.filiais.toLocaleString('pt-BR')} filiais`;
    console.log(`Cleanup completed: ${message}`);

    return new Response(JSON.stringify({ 
      success: true, 
      deleted: totalDeleted,
      estimated,
      verification,
      refresh_result: refreshResult || null,
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
