import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RefreshResult {
  success: boolean;
  views_refreshed: string[];
  views_failed: Array<{ view: string; error: string; duration_ms: number }>;
  total_views: number;
  refreshed_count: number;
  failed_count: number;
  duration_ms: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    // Get Supabase client with service role for admin operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    console.log("[refresh-views] Calling centralized refresh_all_materialized_views RPC...");

    // Usar o RPC centralizado que conhece todas as 11 views na ordem correta
    const { data: result, error } = await supabase.rpc('refresh_all_materialized_views');

    if (error) {
      console.error("[refresh-views] RPC error:", error);
      
      return new Response(
        JSON.stringify({
          success: false,
          views_refreshed: [],
          views_failed: [{ view: 'RPC', error: error.message, duration_ms: Date.now() - startTime }],
          total_views: 11,
          refreshed_count: 0,
          failed_count: 1,
          duration_ms: Date.now() - startTime,
          error: "Erro ao chamar refresh_all_materialized_views",
          details: error.message,
        } as RefreshResult),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const refreshResult = result as RefreshResult;
    
    console.log(`[refresh-views] Completed: ${refreshResult.refreshed_count}/${refreshResult.total_views} views refreshed in ${refreshResult.duration_ms}ms`);
    
    if (refreshResult.failed_count > 0) {
      console.warn(`[refresh-views] Failed views:`, refreshResult.views_failed);
    }

    // Remover prefixo 'extensions.' dos nomes para UI mais limpa
    const cleanedRefreshed = refreshResult.views_refreshed?.map(v => 
      v.replace('extensions.', '')
    ) || [];
    
    const cleanedFailed = refreshResult.views_failed?.map(f => ({
      ...f,
      view: f.view?.replace('extensions.', '') || f.view
    })) || [];

    return new Response(
      JSON.stringify({
        success: refreshResult.success,
        views_refreshed: cleanedRefreshed,
        views_failed: cleanedFailed,
        total_views: refreshResult.total_views,
        refreshed_count: refreshResult.refreshed_count,
        failed_count: refreshResult.failed_count,
        duration_ms: refreshResult.duration_ms,
      } as RefreshResult),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: refreshResult.success ? 200 : 207 // 207 Multi-Status for partial success
      }
    );

  } catch (err: any) {
    console.error("[refresh-views] Unexpected error:", err);
    
    return new Response(
      JSON.stringify({
        success: false,
        views_refreshed: [],
        views_failed: [],
        total_views: 11,
        refreshed_count: 0,
        failed_count: 0,
        duration_ms: Date.now() - startTime,
        error: "Erro inesperado ao atualizar views.",
        details: err.message,
      } as RefreshResult),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
