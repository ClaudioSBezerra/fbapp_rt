import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RefreshResult {
  success: boolean;
  views_refreshed: string[];
  views_failed: string[];
  duration_ms: number;
  error?: string;
  details?: string;
}

// Lista de views com seus timeouts (views pesadas têm timeout maior)
const MATERIALIZED_VIEWS: { name: string; timeoutSeconds: number }[] = [
  { name: 'extensions.mv_mercadorias_aggregated', timeoutSeconds: 120 },
  { name: 'extensions.mv_fretes_aggregated', timeoutSeconds: 60 },
  { name: 'extensions.mv_energia_agua_aggregated', timeoutSeconds: 60 },
  { name: 'extensions.mv_servicos_aggregated', timeoutSeconds: 60 },
  { name: 'extensions.mv_mercadorias_participante', timeoutSeconds: 300 }, // View pesada - 5 minutos
  { name: 'extensions.mv_dashboard_stats', timeoutSeconds: 120 },
  { name: 'extensions.mv_uso_consumo_aggregated', timeoutSeconds: 120 },
  { name: 'extensions.mv_uso_consumo_detailed', timeoutSeconds: 180 },
  { name: 'extensions.mv_fretes_detailed', timeoutSeconds: 120 },
  { name: 'extensions.mv_energia_agua_detailed', timeoutSeconds: 120 },
];

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const viewsRefreshed: string[] = [];
  const viewsFailed: string[] = [];
  
  try {
    // Get Supabase client with service role for admin operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    console.log("[refresh-views] Starting materialized views refresh...");
    console.log(`[refresh-views] Total views to refresh: ${MATERIALIZED_VIEWS.length}`);

    // Refresh each view individually with its specific timeout
    for (const viewConfig of MATERIALIZED_VIEWS) {
      const viewStartTime = Date.now();
      const viewName = viewConfig.name;
      const timeout = viewConfig.timeoutSeconds;
      
      console.log(`[refresh-views] Refreshing ${viewName} (timeout: ${timeout}s)...`);
      
      // Set timeout and refresh in single transaction
      const { error } = await supabase.rpc('exec_sql', {
        sql: `SET LOCAL statement_timeout = '${timeout}s'; REFRESH MATERIALIZED VIEW ${viewName};`
      });
      
      const viewDuration = Date.now() - viewStartTime;
      
      if (error) {
        console.error(`[refresh-views] Failed to refresh ${viewName} (${viewDuration}ms):`, error.message);
        viewsFailed.push(viewName.replace('extensions.', ''));
      } else {
        console.log(`[refresh-views] Successfully refreshed ${viewName} (${viewDuration}ms)`);
        viewsRefreshed.push(viewName.replace('extensions.', ''));
      }
    }

    const duration = Date.now() - startTime;
    const success = viewsFailed.length === 0;
    
    console.log(`[refresh-views] Completed in ${duration}ms. Success: ${viewsRefreshed.length}/${MATERIALIZED_VIEWS.length}`);
    
    if (viewsFailed.length > 0) {
      console.warn(`[refresh-views] Failed views: ${viewsFailed.join(', ')}`);
    }

    return new Response(
      JSON.stringify({
        success,
        views_refreshed: viewsRefreshed,
        views_failed: viewsFailed,
        duration_ms: duration,
        error: success ? undefined : `${viewsFailed.length} views falharam ao atualizar`,
      } as RefreshResult),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: success ? 200 : 207 // 207 Multi-Status for partial success
      }
    );

  } catch (err: any) {
    console.error("[refresh-views] Unexpected error:", err);
    
    return new Response(
      JSON.stringify({
        success: false,
        views_refreshed: viewsRefreshed,
        views_failed: viewsFailed,
        duration_ms: Date.now() - startTime,
        error: "Erro inesperado ao atualizar views.",
        details: err.message,
      } as RefreshResult),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
