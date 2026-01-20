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

// Lista de todas as views materializadas para atualizar
const MATERIALIZED_VIEWS = [
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

    // Refresh each view individually using exec_sql with longer timeout
    for (const view of MATERIALIZED_VIEWS) {
      const viewStartTime = Date.now();
      console.log(`[refresh-views] Refreshing ${view}...`);
      
      const { error } = await supabase.rpc('exec_sql', {
        sql: `REFRESH MATERIALIZED VIEW ${view}`
      });
      
      const viewDuration = Date.now() - viewStartTime;
      
      if (error) {
        console.error(`[refresh-views] Failed to refresh ${view} (${viewDuration}ms):`, error.message);
        viewsFailed.push(view.replace('extensions.', ''));
      } else {
        console.log(`[refresh-views] Successfully refreshed ${view} (${viewDuration}ms)`);
        viewsRefreshed.push(view.replace('extensions.', ''));
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
