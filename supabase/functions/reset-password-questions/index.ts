import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { email, recovery_city, recovery_dob, new_password } = await req.json();

    if (!email || !recovery_city || !recovery_dob || !new_password) {
      return new Response(
        JSON.stringify({ error: "Todos os campos são obrigatórios (Email, Cidade, Data de Nascimento, Nova Senha)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Get User ID by Email using RPC (Postgres Function)
    // We use an RPC because we can't query auth.users directly easily without admin API listing users (which is slow/limited)
    // But actually, with service role, we can use auth.admin.listUsers() filtering by email.
    // However, the RPC approach is faster if the function exists.
    // Let's try to find the user via Admin API first to avoid dependency on RPC if possible, 
    // OR just use the RPC as planned since I created the migration.
    // Given I haven't applied the migration yet, maybe Admin API is safer?
    // supabase.auth.admin.listUsers() doesn't support filtering by email directly in all versions, 
    // but getUserById does.
    // Wait, createClient(..., service_role) allows us to use auth.admin.
    // But how to get ID from Email?
    // There is no `getUserByEmail` in the admin API public types easily exposed?
    // Actually `listUsers` usually allows page/perPage but not search?
    // Wait, the migration `get_user_id_by_email` is better. I should rely on it.
    
    const { data: userId, error: rpcError } = await supabase.rpc('get_user_id_by_email', { user_email: email });

    if (rpcError) {
      console.error('RPC Error:', rpcError);
      // Fallback: Try to verify if we can find the user another way or return generic error
      return new Response(
        JSON.stringify({ error: "Erro ao localizar usuário. Verifique o email." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Usuário não encontrado." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check Profile Recovery Answers
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('recovery_city, recovery_dob')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
       return new Response(
        JSON.stringify({ error: "Perfil não encontrado ou dados de recuperação não cadastrados." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if profile has recovery info
    if (!profile.recovery_city || !profile.recovery_dob) {
       return new Response(
        JSON.stringify({ error: "Esta conta não possui perguntas de segurança configuradas." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize and Compare
    const cityMatch = profile.recovery_city.trim().toLowerCase() === recovery_city.trim().toLowerCase();
    const dobMatch = profile.recovery_dob === recovery_dob;

    if (!cityMatch || !dobMatch) {
       return new Response(
        JSON.stringify({ error: "Respostas de segurança incorretas." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Update Password
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: new_password
    });

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({ success: true, message: "Senha atualizada com sucesso!" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Reset Password Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
