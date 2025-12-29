import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

function formatCNPJ(cnpj: string): string {
  if (!cnpj) return "";
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

function formatDuration(startedAt: string, completedAt: string): string {
  const start = new Date(startedAt);
  const end = new Date(completedAt);
  const diffMs = end.getTime() - start.getTime();
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

function formatNumber(num: number): string {
  return num.toLocaleString("pt-BR");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { job_id } = await req.json();

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending email for job: ${job_id}`);

    // Get job details with related data
    const { data: job, error: jobError } = await supabase
      .from("import_jobs")
      .select(`
        *,
        empresas:empresa_id (nome),
        filiais:filial_id (razao_social, cnpj)
      `)
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      console.error("Job not found:", jobError);
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user email
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", job.user_id)
      .single();

    if (profileError || !profile?.email) {
      console.error("Profile not found:", profileError);
      return new Response(
        JSON.stringify({ error: "User profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const counts = job.counts as { mercadorias: number; energia_agua: number; fretes: number };
    const totalRecords = counts.mercadorias + counts.energia_agua + counts.fretes;
    const duration = job.started_at && job.completed_at 
      ? formatDuration(job.started_at, job.completed_at) 
      : "N/A";
    const empresaNome = (job.empresas as any)?.nome || "Empresa";
    const filialNome = (job.filiais as any)?.razao_social || "Filial";
    const filialCnpj = (job.filiais as any)?.cnpj || "";
    const isSuccess = job.status === "completed";
    const userName = profile.full_name || profile.email.split("@")[0];

    const statusColor = isSuccess ? "#22c55e" : "#ef4444";
    const statusText = isSuccess ? "Concluída com Sucesso" : "Falhou";
    const statusEmoji = isSuccess ? "✅" : "❌";

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 32px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">
                ${statusEmoji} Importação EFD ${statusText}
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 24px; color: #374151; font-size: 16px; line-height: 1.6;">
                Olá, <strong>${userName}</strong>!
              </p>
              
              <p style="margin: 0 0 24px; color: #374151; font-size: 16px; line-height: 1.6;">
                ${isSuccess 
                  ? `A importação do arquivo <strong>${job.file_name}</strong> foi concluída com sucesso.`
                  : `A importação do arquivo <strong>${job.file_name}</strong> falhou. Erro: ${job.error_message || "Erro desconhecido"}`
                }
              </p>

              <!-- Info Card -->
              <table width="100%" style="background-color: #f9fafb; border-radius: 8px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <table width="100%">
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                          <span style="color: #6b7280; font-size: 14px;">Empresa</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">
                          <span style="color: #111827; font-size: 14px; font-weight: 500;">${empresaNome}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                          <span style="color: #6b7280; font-size: 14px;">Filial</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">
                          <span style="color: #111827; font-size: 14px; font-weight: 500;">${filialNome}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
                          <span style="color: #6b7280; font-size: 14px;">CNPJ</span>
                        </td>
                        <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">
                          <span style="color: #111827; font-size: 14px; font-weight: 500;">${formatCNPJ(filialCnpj)}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0;">
                          <span style="color: #6b7280; font-size: 14px;">Tempo de processamento</span>
                        </td>
                        <td style="padding: 8px 0; text-align: right;">
                          <span style="color: #111827; font-size: 14px; font-weight: 500;">${duration}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${isSuccess ? `
              <!-- Stats -->
              <table width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td width="33%" style="padding: 12px; text-align: center; background-color: #eff6ff; border-radius: 8px 0 0 8px;">
                    <div style="font-size: 24px; font-weight: 700; color: #1d4ed8;">${formatNumber(counts.mercadorias)}</div>
                    <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Mercadorias</div>
                  </td>
                  <td width="33%" style="padding: 12px; text-align: center; background-color: #f0fdf4;">
                    <div style="font-size: 24px; font-weight: 700; color: #15803d;">${formatNumber(counts.energia_agua)}</div>
                    <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Energia/Água</div>
                  </td>
                  <td width="33%" style="padding: 12px; text-align: center; background-color: #fef3c7; border-radius: 0 8px 8px 0;">
                    <div style="font-size: 24px; font-weight: 700; color: #b45309;">${formatNumber(counts.fretes)}</div>
                    <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Fretes</div>
                  </td>
                </tr>
              </table>

              <div style="text-align: center; padding: 16px; background-color: #f0fdf4; border-radius: 8px; margin-bottom: 24px;">
                <span style="font-size: 14px; color: #15803d;">
                  <strong>${formatNumber(totalRecords)}</strong> registros importados com sucesso
                </span>
              </div>
              ` : ""}

              <!-- CTA Button -->
              <table width="100%">
                <tr>
                  <td align="center">
                    <a href="https://kocbdudzkbvgxwdacdrk.lovableproject.com/importar-efd" 
                       style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
                      Acessar o Sistema
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                Este é um email automático. Por favor, não responda.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const { error: emailError } = await resend.emails.send({
      from: "EFD Import <onboarding@resend.dev>",
      to: [profile.email],
      subject: `${statusEmoji} Importação EFD ${statusText} - ${empresaNome}`,
      html,
    });

    if (emailError) {
      console.error("Email send error:", emailError);
      return new Response(
        JSON.stringify({ error: "Failed to send email: " + emailError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Email sent successfully to ${profile.email} for job ${job_id}`);

    return new Response(
      JSON.stringify({ success: true, message: "Email sent successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
