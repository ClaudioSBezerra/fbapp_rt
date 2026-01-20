import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Demo tenant and group IDs (must exist in database)
const TENANT_DEMO_ID = "11111111-1111-1111-1111-111111111111";
const GRUPO_DEMO_ID = "22222222-2222-2222-2222-222222222222";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get request body
    const body = await req.json();
    const { user_id, full_name, email } = body;

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Setting up demo environment for user: ${user_id}, name: ${full_name}`);

    // 1. Update profile with demo account type and trial end date
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 14);

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        account_type: "demo",
        demo_trial_ends_at: trialEndDate.toISOString(),
        full_name: full_name || null,
      })
      .eq("id", user_id);

    if (profileError) {
      console.error("Error updating profile:", profileError);
      throw new Error(`Failed to update profile: ${profileError.message}`);
    }

    console.log("Profile updated with demo account type");

    // 2. Check if TENANT_DEMO exists
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("id")
      .eq("id", TENANT_DEMO_ID)
      .maybeSingle();

    if (tenantError) {
      console.error("Error checking tenant:", tenantError);
    }

    // Create TENANT_DEMO if it doesn't exist
    if (!tenant) {
      console.log("Creating TENANT_DEMO...");
      const { error: createTenantError } = await supabase
        .from("tenants")
        .insert({
          id: TENANT_DEMO_ID,
          nome: "TENANT_DEMO",
          plano: "trial",
        });

      if (createTenantError && !createTenantError.message.includes("duplicate")) {
        console.error("Error creating tenant:", createTenantError);
        throw new Error(`Failed to create tenant: ${createTenantError.message}`);
      }
    }

    // 3. Check if GRUPO_DEMO exists
    const { data: grupo, error: grupoError } = await supabase
      .from("grupos_empresas")
      .select("id")
      .eq("id", GRUPO_DEMO_ID)
      .maybeSingle();

    if (grupoError) {
      console.error("Error checking grupo:", grupoError);
    }

    // Create GRUPO_DEMO if it doesn't exist
    if (!grupo) {
      console.log("Creating GRUPO_DEMO...");
      const { error: createGrupoError } = await supabase
        .from("grupos_empresas")
        .insert({
          id: GRUPO_DEMO_ID,
          tenant_id: TENANT_DEMO_ID,
          nome: "GRUPO_DEMO",
        });

      if (createGrupoError && !createGrupoError.message.includes("duplicate")) {
        console.error("Error creating grupo:", createGrupoError);
        throw new Error(`Failed to create grupo: ${createGrupoError.message}`);
      }
    }

    // 4. Create user_tenant link
    const { error: userTenantError } = await supabase
      .from("user_tenants")
      .upsert({
        user_id: user_id,
        tenant_id: TENANT_DEMO_ID,
      }, {
        onConflict: "user_id,tenant_id",
      });

    if (userTenantError) {
      console.error("Error creating user_tenant:", userTenantError);
      throw new Error(`Failed to create user_tenant: ${userTenantError.message}`);
    }

    console.log("User linked to TENANT_DEMO");

    // 5. Create demo empresa for user
    const userName = full_name?.split(" ")[0] || email?.split("@")[0] || "Usuario";
    const empresaNome = `${userName}_DEMO`;

    const { data: empresa, error: empresaError } = await supabase
      .from("empresas")
      .insert({
        grupo_id: GRUPO_DEMO_ID,
        nome: empresaNome,
        is_demo: true,
        demo_owner_id: user_id,
      })
      .select()
      .single();

    if (empresaError) {
      console.error("Error creating empresa:", empresaError);
      throw new Error(`Failed to create empresa: ${empresaError.message}`);
    }

    console.log(`Created demo empresa: ${empresa.id} - ${empresaNome}`);

    // 6. Link user to empresa
    const { error: userEmpresaError } = await supabase
      .from("user_empresas")
      .insert({
        user_id: user_id,
        empresa_id: empresa.id,
      });

    if (userEmpresaError) {
      console.error("Error creating user_empresa:", userEmpresaError);
      throw new Error(`Failed to create user_empresa: ${userEmpresaError.message}`);
    }

    console.log("User linked to demo empresa");

    // 7. Ensure user has 'user' role (not admin)
    const { error: roleError } = await supabase
      .from("user_roles")
      .upsert({
        user_id: user_id,
        role: "user",
      }, {
        onConflict: "user_id",
      });

    if (roleError) {
      console.error("Error setting user role:", roleError);
      // Don't throw - role might already be set by trigger
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Demo environment created successfully",
        empresa_id: empresa.id,
        empresa_nome: empresaNome,
        trial_ends_at: trialEndDate.toISOString(),
        days_remaining: 14,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in demo-signup:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
