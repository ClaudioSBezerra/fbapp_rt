import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Domínio da aplicação - usar variável de ambiente ou fallback para preview
const APP_URL = Deno.env.get("APP_URL") || "https://id-preview--3525ecda-3b58-4d38-9831-7d74a5209fe5.lovable.app";

interface PasswordResetRequest {
  email: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email }: PasswordResetRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email é obrigatório" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`Generating password reset link for: ${email}`);

    // Criar cliente Supabase com service role key para usar admin API
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Gerar link de recuperação usando Admin API
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: `${APP_URL}/reset-password`,
      },
    });

    if (error) {
      console.error("Error generating recovery link:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!data?.properties?.action_link) {
      console.error("No action link generated");
      return new Response(
        JSON.stringify({ error: "Não foi possível gerar o link de recuperação" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const resetLink = data.properties.action_link;
    console.log(`Reset link generated successfully for ${email}`);

    // Enviar email com Resend
    const emailResponse = await resend.emails.send({
      from: "Simulador IBS/CBS <noreply@resend.dev>",
      to: [email],
      subject: "Recuperação de Senha - Simulador IBS/CBS",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Recuperação de Senha</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Simulador IBS/CBS</h1>
          </div>
          
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
            <h2 style="color: #1f2937; margin-top: 0;">Recuperação de Senha</h2>
            
            <p style="color: #4b5563;">Olá,</p>
            
            <p style="color: #4b5563;">Recebemos uma solicitação para redefinir a senha da sua conta associada ao email <strong>${email}</strong>.</p>
            
            <p style="color: #4b5563;">Clique no botão abaixo para criar uma nova senha:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetLink}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                Redefinir Minha Senha
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px;">Se você não solicitou esta recuperação de senha, pode ignorar este email com segurança.</p>
            
            <p style="color: #6b7280; font-size: 14px;">Este link expira em 24 horas.</p>
            
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">
            
            <p style="color: #9ca3af; font-size: 12px; margin-bottom: 0;">
              Se o botão não funcionar, copie e cole o link abaixo no seu navegador:
            </p>
            <p style="color: #6b7280; font-size: 12px; word-break: break-all; margin-top: 5px;">
              ${resetLink}
            </p>
          </div>
          
          <p style="color: #9ca3af; font-size: 11px; text-align: center; margin-top: 20px;">
            © ${new Date().getFullYear()} Simulador IBS/CBS. Todos os direitos reservados.
          </p>
        </body>
        </html>
      `,
    });

    console.log("Email response:", emailResponse);

    // Check if Resend returned an error
    if (emailResponse.error) {
      console.error("Resend error:", emailResponse.error);
      
      // Handle domain validation error specifically
      const errorMessage = String(emailResponse.error.message || emailResponse.error);
      if (errorMessage.includes("verify a domain") || errorMessage.includes("403")) {
        return new Response(
          JSON.stringify({ 
            error: "domain_not_verified",
            message: "O serviço de email ainda não está configurado para enviar para destinatários externos. Por favor, use a recuperação por palavra-chave ou entre em contato com o suporte."
          }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: "email_send_failed",
          message: errorMessage || "Erro ao enviar email de recuperação"
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Email de recuperação enviado com sucesso" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-password-reset function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno do servidor" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
