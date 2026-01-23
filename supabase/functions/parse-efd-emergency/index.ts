import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("EMERGENCY: Started");
  
  if (req.method === "OPTIONS") {
    console.log("EMERGENCY: OPTIONS request");
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("EMERGENCY: Reading body...");
    const body = await req.json();
    console.log("EMERGENCY: Body read successfully", body);

    // Immediate response - no DB operations
    console.log("EMERGENCY: Sending response...");
    return new Response(
      JSON.stringify({
        success: true,
        message: "Emergency test - no DB operations",
        received: {
          empresa_id: body.empresa_id,
          file_path: body.file_path
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("EMERGENCY ERROR:", error);
    return new Response(
      JSON.stringify({ 
        error: "Emergency error: " + (error instanceof Error ? error.message : String(error))
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});