import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple hash function for keyword (using Web Crypto API)
async function hashKeyword(keyword: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(keyword.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate a random token
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Parse body once
    const body = await req.json();
    
    // Get action from URL query params OR from body
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || body.action || "verify";

    console.log("Action:", action, "Body:", JSON.stringify(body));

    if (action === "set") {
      // Set security keyword for user
      const { userId, keyword } = body;

      if (!userId || !keyword) {
        return new Response(
          JSON.stringify({ error: "userId e keyword são obrigatórios" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      if (keyword.length < 4) {
        return new Response(
          JSON.stringify({ error: "A palavra-chave deve ter pelo menos 4 caracteres" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const keywordHash = await hashKeyword(keyword);
      console.log("Setting keyword hash for user:", userId);

      // Try to update first, if no rows affected, insert
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .single();

      if (existingProfile) {
        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({ security_keyword_hash: keywordHash })
          .eq("id", userId);

        if (updateError) {
          console.error("Error updating profile:", updateError);
          return new Response(
            JSON.stringify({ error: "Erro ao salvar palavra-chave" }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      } else {
        // Profile doesn't exist, need to create it
        // Get user email from auth.users
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
        
        if (authError || !authUser?.user?.email) {
          console.error("Error fetching auth user:", authError);
          return new Response(
            JSON.stringify({ error: "Usuário não encontrado" }),
            { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }

        const { error: insertError } = await supabaseAdmin
          .from("profiles")
          .insert({ 
            id: userId, 
            email: authUser.user.email,
            security_keyword_hash: keywordHash,
            full_name: authUser.user.user_metadata?.full_name || null
          });

        if (insertError) {
          console.error("Error inserting profile:", insertError);
          return new Response(
            JSON.stringify({ error: "Erro ao criar perfil" }),
            { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      }

      console.log("Keyword saved successfully for user:", userId);
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );

    } else if (action === "check") {
      // Check if user has security keyword configured
      const { email } = body;

      if (!email) {
        return new Response(
          JSON.stringify({ error: "Email é obrigatório" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("security_keyword_hash")
        .eq("email", email.toLowerCase().trim())
        .single();

      if (profileError || !profile) {
        // Don't reveal if user exists
        return new Response(
          JSON.stringify({ hasKeyword: false }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      return new Response(
        JSON.stringify({ hasKeyword: !!profile.security_keyword_hash }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );

    } else if (action === "verify") {
      // Verify keyword and generate reset token
      const { email, keyword } = body;

      if (!email || !keyword) {
        return new Response(
          JSON.stringify({ error: "Email e palavra-chave são obrigatórios" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Get user profile with keyword hash
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id, security_keyword_hash")
        .eq("email", email.toLowerCase().trim())
        .single();

      if (profileError || !profile) {
        console.log("Profile not found for email:", email);
        return new Response(
          JSON.stringify({ error: "Email ou palavra-chave incorretos" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      if (!profile.security_keyword_hash) {
        return new Response(
          JSON.stringify({ error: "Palavra-chave de segurança não configurada para este usuário" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Verify keyword
      const providedHash = await hashKeyword(keyword);
      console.log("Provided keyword:", keyword);
      console.log("Provided hash:", providedHash);
      console.log("Stored hash:", profile.security_keyword_hash);
      
      if (providedHash !== profile.security_keyword_hash) {
        console.log("Keyword mismatch for user:", profile.id);
        return new Response(
          JSON.stringify({ error: "Email ou palavra-chave incorretos" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Generate reset token
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Store token
      const { error: tokenError } = await supabaseAdmin
        .from("password_reset_tokens")
        .insert({
          user_id: profile.id,
          token,
          expires_at: expiresAt.toISOString(),
        });

      if (tokenError) {
        console.error("Error creating token:", tokenError);
        return new Response(
          JSON.stringify({ error: "Erro ao gerar token de redefinição" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      console.log("Reset token generated for user:", profile.id);

      return new Response(
        JSON.stringify({ 
          success: true, 
          token,
          expiresAt: expiresAt.toISOString() 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );

    } else if (action === "reset") {
      // Reset password using token
      const { token, newPassword } = body;

      if (!token || !newPassword) {
        return new Response(
          JSON.stringify({ error: "Token e nova senha são obrigatórios" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      if (newPassword.length < 6) {
        return new Response(
          JSON.stringify({ error: "A senha deve ter pelo menos 6 caracteres" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Find valid token
      const { data: tokenData, error: tokenError } = await supabaseAdmin
        .from("password_reset_tokens")
        .select("*")
        .eq("token", token)
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (tokenError || !tokenData) {
        console.log("Invalid or expired token");
        return new Response(
          JSON.stringify({ error: "Token inválido ou expirado" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Update user password
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        tokenData.user_id,
        { password: newPassword }
      );

      if (updateError) {
        console.error("Error updating password:", updateError);
        return new Response(
          JSON.stringify({ error: "Erro ao atualizar senha" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Mark token as used
      await supabaseAdmin
        .from("password_reset_tokens")
        .update({ used: true })
        .eq("id", tokenData.id);

      console.log("Password reset successful for user:", tokenData.user_id);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida" }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in verify-security-keyword:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
