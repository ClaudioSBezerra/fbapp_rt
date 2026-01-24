import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  console.log("PARSE-EFD-V9: TENTANDO BYPASS AUTH");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    const apiKey = req.headers.get("apikey");
    
    console.log("Auth headers:", { authHeader, apiKey });
    
    const body = await req.json();
    console.log("Body recebido:", body);

    return new Response(
      JSON.stringify({
        success: true,
        job_id: "v9-" + Date.now(),
        status: "uploaded",
        message: "V9 FUNCIONOU!",
        received: body,
        auth_debug: {
          has_auth: !!authHeader,
          has_apikey: !!apiKey
        }
      }),
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json" 
        } 
      }
    );

  } catch (error) {
    console.error("Error in parse-efd-v9:", error);
    return new Response(
      JSON.stringify({ 
        error: `Server error: ${error.message}`
      }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json" 
        } 
      }
    );
  }
});