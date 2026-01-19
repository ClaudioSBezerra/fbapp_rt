import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Demo environment constants
const TENANT_DEMO_ID = '1d8a9e47-e868-4011-8a70-da5dca9d7f71';
const GRUPO_DEMO_ID = '6ba2d30e-0970-4b16-b466-b3b27e6b5dc9';
const DEMO_TRIAL_DAYS = 14;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const { email, password, fullName } = await req.json();

    // Validate required fields
    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Email e senha são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Formato de email inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate password length
    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "A senha deve ter pelo menos 6 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[demo-signup] Creating demo account for: ${email}`);

    // Step 1: Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for demo accounts
      user_metadata: { full_name: fullName || email.split('@')[0] },
    });

    if (authError) {
      console.error('[demo-signup] Auth error:', authError);
      
      // Check for duplicate email
      if (authError.message.includes('already registered') || authError.message.includes('duplicate')) {
        return new Response(
          JSON.stringify({ error: "Este email já está cadastrado. Faça login ou use outro email." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: authError.message || "Erro ao criar conta" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user?.id;
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Erro ao criar usuário - ID não retornado" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[demo-signup] User created: ${userId}`);

    // Step 2: Wait for trigger to create profile, then update it
    // The profile is created by a database trigger, so we need to wait a bit
    await new Promise(resolve => setTimeout(resolve, 500));

    // Calculate trial end date
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + DEMO_TRIAL_DAYS);

    // Update profile with demo account type
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        account_type: 'demo',
        demo_trial_ends_at: trialEndsAt.toISOString(),
        full_name: fullName || email.split('@')[0],
      })
      .eq('id', userId);

    if (profileError) {
      console.error('[demo-signup] Profile update error:', profileError);
      // Try to insert if profile doesn't exist yet
      const { error: insertError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          email,
          account_type: 'demo',
          demo_trial_ends_at: trialEndsAt.toISOString(),
          full_name: fullName || email.split('@')[0],
        });
      
      if (insertError) {
        console.error('[demo-signup] Profile insert error:', insertError);
      }
    }

    console.log(`[demo-signup] Profile updated with demo type`);

    // Step 3: Link user to TENANT_DEMO
    const { error: tenantError } = await supabase
      .from('user_tenants')
      .insert({
        user_id: userId,
        tenant_id: TENANT_DEMO_ID,
      });

    if (tenantError) {
      console.error('[demo-signup] Tenant link error:', tenantError);
      // Continue anyway - user might need to be linked manually
    }

    console.log(`[demo-signup] User linked to TENANT_DEMO`);

    // Step 4: Create demo empresa for this user
    const empresaName = `${(fullName || email.split('@')[0]).split(' ')[0]}_DEMO`;
    
    const { data: empresaData, error: empresaError } = await supabase
      .from('empresas')
      .insert({
        nome: empresaName,
        grupo_id: GRUPO_DEMO_ID,
        is_demo: true,
        demo_owner_id: userId,
      })
      .select('id')
      .single();

    if (empresaError) {
      console.error('[demo-signup] Empresa creation error:', empresaError);
      return new Response(
        JSON.stringify({ error: "Erro ao configurar ambiente demo" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[demo-signup] Demo empresa created: ${empresaData.id}`);

    // Step 5: Link user to the demo empresa
    const { error: userEmpresaError } = await supabase
      .from('user_empresas')
      .insert({
        user_id: userId,
        empresa_id: empresaData.id,
      });

    if (userEmpresaError) {
      console.error('[demo-signup] User-empresa link error:', userEmpresaError);
      // Continue anyway
    }

    // Step 6: Add user role
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({
        user_id: userId,
        role: 'user',
      });

    if (roleError) {
      console.error('[demo-signup] Role error:', roleError);
      // Continue anyway
    }

    console.log(`[demo-signup] Demo signup completed successfully for ${email}`);

    // Return success with login info
    return new Response(
      JSON.stringify({
        success: true,
        message: "Conta demo criada com sucesso!",
        user_id: userId,
        empresa_id: empresaData.id,
        empresa_name: empresaName,
        trial_ends_at: trialEndsAt.toISOString(),
        trial_days: DEMO_TRIAL_DAYS,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('[demo-signup] Unexpected error:', error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno do servidor";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
