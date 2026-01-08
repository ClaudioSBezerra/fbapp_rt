import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const results: Record<string, number> = {};

    // 1. Limpar tabelas de dados operacionais
    await supabaseAdmin.from("mercadorias").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    results.mercadorias = 1;

    await supabaseAdmin.from("energia_agua").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    results.energia_agua = 1;

    await supabaseAdmin.from("fretes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    results.fretes = 1;

    await supabaseAdmin.from("import_jobs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    results.import_jobs = 1;

    // 2. Estrutura organizacional
    await supabaseAdmin.from("filiais").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    results.filiais = 1;

    await supabaseAdmin.from("empresas").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    results.empresas = 1;

    await supabaseAdmin.from("grupos_empresas").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    results.grupos_empresas = 1;

    // 3. Vínculos de usuário
    await supabaseAdmin.from("user_tenants").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    results.user_tenants = 1;

    await supabaseAdmin.from("user_roles").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    results.user_roles = 1;

    // 4. Tenants
    await supabaseAdmin.from("tenants").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    results.tenants = 1;

    // 5. Profiles
    await supabaseAdmin.from("profiles").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    results.profiles = 1;

    // 6. Logs e alíquotas
    await supabaseAdmin.from("audit_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    results.audit_logs = 1;

    // Alíquotas NÃO são limpas - são dados de referência da reforma tributária

    // 7. Deletar todos os usuários do auth.users
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error("Erro ao listar usuários:", listError);
      throw listError;
    }

    const users = usersData?.users || [];
    let deletedUsersCount = 0;

    for (const user of users) {
      const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
      if (deleteError) {
        console.error(`Erro ao deletar usuário ${user.email}:`, deleteError);
      } else {
        deletedUsersCount++;
        console.log(`Usuário deletado: ${user.email}`);
      }
    }

    results.auth_users = deletedUsersCount;

    console.log("Limpeza completa realizada:", results);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Base de dados limpa completamente. Faça logout e cadastre um novo usuário (será ADMIN).",
        deleted: results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Erro na limpeza:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
