import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RefreshResult {
  success: boolean;
  views_refreshed: string[];
  duration_ms: number;
  error?: string;
  details?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const viewsRefreshed: string[] = [];
  
  try {
    // Get Supabase client with service role for admin operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    // Parse body (handle empty body gracefully)
    let viewName: string | null = null;
    try {
      const body = await req.json();
      viewName = body.view;
    } catch (_) {
      // ignore, body might be empty
    }

    console.log(`[refresh-views] Starting materialized views refresh. Specific view: ${viewName || 'ALL'}`);

    // Try to acquire advisory lock to prevent concurrent refreshes
    // Lock ID 999888777 is arbitrary but should be unique for this operation
    const { data: lockAcquired, error: lockError } = await supabase.rpc('pg_try_advisory_lock', {
      key: 999888777
    });

    // Note: pg_try_advisory_lock might not be exposed via RPC, so we handle that case
    if (lockError) {
      console.log("[refresh-views] Advisory lock not available via RPC, proceeding without lock check:", lockError.message);
    } else if (!lockAcquired) {
      console.log("[refresh-views] Another refresh is already in progress");
      return new Response(
        JSON.stringify({
          success: false,
          views_refreshed: [],
          duration_ms: Date.now() - startTime,
          error: "Outra atualização já está em andamento. Aguarde alguns segundos.",
        } as RefreshResult),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
      );
    }

    // Call the refresh function
    let refreshError;
    if (viewName) {
      console.log(`[refresh-views] Calling refresh_specific_materialized_view RPC for ${viewName}...`);
      const { error } = await supabase.rpc('refresh_specific_materialized_view', { p_view_name: viewName });
      refreshError = error;
    } else {
      console.log("[refresh-views] Calling refresh_materialized_views RPC (ALL)...");
      const { error } = await supabase.rpc('refresh_materialized_views');
      refreshError = error;
    }

    if (refreshError) {
      console.error("[refresh-views] Refresh failed:", refreshError);
      
      // Release lock if we acquired it
      if (lockAcquired) {
        try {
          await supabase.rpc('pg_advisory_unlock', { key: 999888777 });
        } catch (_) {
          // Ignore unlock errors
        }
      }

      return new Response(
        JSON.stringify({
          success: false,
          views_refreshed: [],
          duration_ms: Date.now() - startTime,
          error: "Falha ao atualizar as views.",
          details: refreshError.message,
        } as RefreshResult),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // All views refreshed successfully
    if (viewName) {
      viewsRefreshed.push(viewName);
    } else {
      viewsRefreshed.push(
        "mv_mercadorias_aggregated",
        "mv_fretes_aggregated", 
        "mv_energia_agua_aggregated",
        "mv_servicos_aggregated",
        "mv_mercadorias_participante",
        "mv_dashboard_stats"
      );
    }

    // Release lock if we acquired it
    if (lockAcquired) {
      try {
        await supabase.rpc('pg_advisory_unlock', { key: 999888777 });
      } catch (_) {
        // Ignore unlock errors
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[refresh-views] Completed successfully in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        views_refreshed: viewsRefreshed,
        duration_ms: duration,
      } as RefreshResult),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("[refresh-views] Unexpected error:", err);
    
    return new Response(
      JSON.stringify({
        success: false,
        views_refreshed: viewsRefreshed,
        duration_ms: Date.now() - startTime,
        error: "Erro inesperado ao atualizar views.",
        details: err.message,
      } as RefreshResult),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
