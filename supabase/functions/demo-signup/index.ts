import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AMB_DEMO tenant and group IDs (fixed UUIDs)
const AMB_DEMO_ID = "11111111-1111-1111-1111-111111111111";
const AMB_DEMO_GRUPO_ID = "22222222-22222222-2222-222222222222";

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
    let { user_id } = body;
    const { full_name, email, password, company_name, recovery_city, recovery_dob } = body;

    // 1. If no user_id, create the user (Auto Confirm)
    if (!user_id) {
      if (!email || !password) {
        return new Response(
          JSON.stringify({ error: "Email and password are required for new user creation" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Creating user ${email} via Admin API...`);
      const { data: userData, error: userError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto confirm as requested
        user_metadata: { full_name }
      });

      if (userError) {
        console.error("Error creating user:", userError);
        return new Response(
          JSON.stringify({ error: userError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      user_id = userData.user.id;
      console.log(`User created: ${user_id}`);
    } else {
      console.log(`Setting up AMB_DEMO for existing user: ${user_id}`);
    }

    // 2. Wait for profile to exist (if created via trigger) OR create/update it
    // If we created user via Admin API, the trigger might have run or is running.
    // We should try to update it. Upsert is safest.
    
    // We need to wait a bit if it was just created to avoid race conditions with triggers
    // But since we are using Service Role, we can just UPSERT.
    
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 14);

    // Upsert profile with new fields
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id: user_id,
        account_type: "demo",
        demo_trial_ends_at: trialEndDate.toISOString(),
        full_name: full_name || undefined,
        recovery_city: recovery_city || null,
        recovery_dob: recovery_dob || null,
      }, { onConflict: 'id' }); // Merge if exists

    if (profileError) {
      console.error("Error updating profile:", profileError);
      // If error is about missing columns (recovery_city), it means migration didn't run.
      // We'll log it but try to proceed if possible (though requirement says we need them).
      // If we fail here, the user gets an error.
      throw new Error(`Failed to update profile: ${profileError.message}`);
    }

    // 3. Ensure AMB_DEMO Tenant exists
    // (We assume it exists or create it idempotently)
    const { error: tenantError } = await supabase
      .from("tenants")
      .upsert({
        id: AMB_DEMO_ID,
        nome: "AMB_DEMO", // Renamed from TENANT_DEMO
        subscription_status: "trial",
      });
      
    if (tenantError) console.error("Error upserting tenant:", tenantError);

    // 4. Ensure AMB_DEMO_GRUPO exists
    const { error: grupoError } = await supabase
      .from("grupos_empresas")
      .upsert({
        id: AMB_DEMO_GRUPO_ID,
        tenant_id: AMB_DEMO_ID,
        nome: "AMB_DEMO_GRUPO",
      });

    if (grupoError) console.error("Error upserting grupo:", grupoError);

    // 5. Link user to AMB_DEMO
    const { error: userTenantError } = await supabase
      .from("user_tenants")
      .upsert({
        user_id: user_id,
        tenant_id: AMB_DEMO_ID,
      }, { onConflict: "user_id,tenant_id" });

    if (userTenantError) {
      throw new Error(`Failed to create user_tenant: ${userTenantError.message}`);
    }

    // 6. Create demo empresa for user
    const empresaNome = company_name || `${full_name?.split(" ")[0] || "Nova"}_Empresa`;

    const { data: empresa, error: empresaError } = await supabase
      .from("empresas")
      .insert({
        grupo_id: AMB_DEMO_GRUPO_ID,
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

    // 7. Link user to empresa
    const { error: userEmpresaError } = await supabase
      .from("user_empresas")
      .insert({
        user_id: user_id,
        empresa_id: empresa.id,
      });

    if (userEmpresaError) {
      console.error("Error creating user_empresa:", userEmpresaError);
    }

    // 8. Ensure user has 'user' role
    const { error: roleError } = await supabase
      .from("user_roles")
      .upsert({
        user_id: user_id,
        role: "user",
      }, { onConflict: "user_id" });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Demo environment created successfully",
        empresa_id: empresa.id,
        empresa_nome: empresaNome,
        user_id: user_id
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
