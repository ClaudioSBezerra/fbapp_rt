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
  validation?: {
    simples_vinculados_uso_consumo: number;
    simples_vinculados_mercadorias: number;
  };
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

// Função para refresh com retry individual por view
async function refreshViewWithRetry(
  supabase: any, 
  view: string, 
  maxRetries: number = 3
): Promise<{ success: boolean; duration: number; error?: string }> {
  const viewStartTime = Date.now();
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`[refresh-views] Attempt ${attempt}/${maxRetries} for ${view}`);
    
    try {
      // Usar REFRESH MATERIALIZED VIEW CONCURRENTLY se possível
      // Para isso a view precisa ter um unique index
      const { error } = await supabase.rpc('exec_sql', {
        sql: `
          SET lock_timeout = '10s';
          SET statement_timeout = '120s';
          REFRESH MATERIALIZED VIEW ${view};
        `
      });
      
      if (!error) {
        const duration = Date.now() - viewStartTime;
        console.log(`[refresh-views] ✓ ${view} refreshed in ${duration}ms`);
        return { success: true, duration };
      }
      
      console.warn(`[refresh-views] Attempt ${attempt} failed for ${view}:`, error.message);
      
      // Backoff exponencial entre tentativas
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 500;
        console.log(`[refresh-views] Waiting ${backoff}ms before retry...`);
        await new Promise(r => setTimeout(r, backoff));
      }
    } catch (err: any) {
      console.error(`[refresh-views] Exception on attempt ${attempt} for ${view}:`, err.message);
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
  }
  
  const duration = Date.now() - viewStartTime;
  return { success: false, duration, error: `Failed after ${maxRetries} attempts` };
}

// Validar que os vínculos Simples Nacional estão refletidos nas views
async function validateSimplesBind(supabase: any): Promise<{ uso_consumo: number; mercadorias: number }> {
  try {
    // Usar RPC dedicada para obter contagens das views materializadas
    const { data, error } = await supabase.rpc('get_simples_counts');
    
    if (error) {
      console.warn('[refresh-views] Validation RPC error:', error.message);
      return { uso_consumo: -1, mercadorias: -1 };
    }
    
    const result = data?.[0] || { uso_consumo_count: 0, mercadorias_count: 0 };
    
    console.log('[refresh-views] Validation - uso_consumo is_simples=true:', result.uso_consumo_count);
    console.log('[refresh-views] Validation - mercadorias is_simples=true:', result.mercadorias_count);
    
    return {
      uso_consumo: result.uso_consumo_count || 0,
      mercadorias: result.mercadorias_count || 0
    };
  } catch (err: any) {
    console.warn('[refresh-views] Validation exception:', err.message);
    return { uso_consumo: -1, mercadorias: -1 };
  }
}

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

    // Parse request body for options
    let options = { validate: true, priority_views: [] as string[] };
    try {
      const body = await req.json();
      options = { ...options, ...body };
    } catch {
      // No body or invalid JSON, use defaults
    }

    // Priorizar views críticas (se especificadas)
    const priorityViews = options.priority_views.length > 0 
      ? options.priority_views 
      : ['extensions.mv_uso_consumo_detailed', 'extensions.mv_mercadorias_participante'];
    
    // Ordenar: views prioritárias primeiro
    const sortedViews = [
      ...MATERIALIZED_VIEWS.filter(v => priorityViews.includes(v)),
      ...MATERIALIZED_VIEWS.filter(v => !priorityViews.includes(v))
    ];

    // Refresh each view with retry logic
    for (const view of sortedViews) {
      const result = await refreshViewWithRetry(supabase, view, 3);
      
      if (result.success) {
        viewsRefreshed.push(view.replace('extensions.', ''));
      } else {
        viewsFailed.push(view.replace('extensions.', ''));
        console.error(`[refresh-views] ✗ ${view} failed: ${result.error}`);
      }
    }

    // Validação pós-refresh
    let validation: RefreshResult['validation'] | undefined;
    if (options.validate) {
      console.log("[refresh-views] Running post-refresh validation...");
      const counts = await validateSimplesBind(supabase);
      validation = {
        simples_vinculados_uso_consumo: counts.uso_consumo,
        simples_vinculados_mercadorias: counts.mercadorias
      };
    }

    const duration = Date.now() - startTime;
    const success = viewsFailed.length === 0;
    
    console.log(`[refresh-views] Completed in ${duration}ms. Success: ${viewsRefreshed.length}/${MATERIALIZED_VIEWS.length}`);
    
    if (viewsFailed.length > 0) {
      console.warn(`[refresh-views] Failed views: ${viewsFailed.join(', ')}`);
    }

    const result: RefreshResult = {
      success,
      views_refreshed: viewsRefreshed,
      views_failed: viewsFailed,
      duration_ms: duration,
      error: success ? undefined : `${viewsFailed.length} views falharam ao atualizar`,
      validation
    };

    return new Response(
      JSON.stringify(result),
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
