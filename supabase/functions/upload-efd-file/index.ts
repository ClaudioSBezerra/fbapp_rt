import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("[UPLOAD_EFD] Iniciando upload via Edge Function");
    
    const {
      fileName,
      filePath,
      fileBase64,
      fileSize,
      contentType,
      metadata
    } = await req.json();

    // Validar dados de entrada
    if (!fileName || !filePath || !fileBase64) {
      throw new Error("Dados incompletos: fileName, filePath e fileBase64 são obrigatórios");
    }

    // Validar tamanho (máximo 100MB para Edge Function)
    const maxFileSize = 100 * 1024 * 1024;
    if (fileSize > maxFileSize) {
      throw new Error(`Arquivo muito grande para Edge Function. Máximo permitido: ${formatBytes(maxFileSize)}`);
    }

    console.log(`[UPLOAD_EFD] Processando arquivo: ${fileName} (${formatBytes(fileSize)})`);
    
    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Converter base64 para Blob
    const binaryString = atob(fileBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const fileBlob = new Blob([bytes], { type: contentType || "text/plain" });
    
    console.log(`[UPLOAD_EFD] Convertido para blob, tamanho: ${fileBlob.size} bytes`);
    
    // Fazer upload direto via Storage API
    const startTime = Date.now();
    
    const { data, error } = await supabase.storage
      .from("efd-files")
      .upload(filePath, fileBlob, {
        contentType: contentType || "text/plain",
        cacheControl: "3600",
        upsert: true,
        metadata: {
          originalName: fileName,
          uploadMethod: "edge_function",
          uploadTimestamp: new Date().toISOString(),
          ...metadata
        }
      });

    const uploadDuration = Date.now() - startTime;
    
    if (error) {
      console.error("[UPLOAD_EFD] Erro no upload:", error);
      
      // Tratamento específico para erros comuns
      if (error.message?.includes("413") || error.message?.includes("Maximum size exceeded")) {
        throw new Error(`Erro 413: Arquivo rejeitado por tamanho. Isso indica um problema de configuração do bucket ou limite do projeto Supabase. Detalhes: ${error.message}`);
      }
      
      if (error.message?.includes("bucket not found")) {
        throw new Error("Bucket 'efd-files' não encontrado. Execute as migrações necessárias.");
      }
      
      if (error.message?.includes("permission denied")) {
        throw new Error("Permissão negada. Verifique as políticas RLS do bucket.");
      }
      
      throw new Error(`Falha no upload: ${error.message}`);
    }

    console.log(`[UPLOAD_EFD] ✅ Upload concluído em ${uploadDuration}ms:`, data);
    
    // Retornar informações do upload
    return new Response(
      JSON.stringify({
        success: true,
        filePath: data?.path,
        fileSize: fileBlob.size,
        uploadDuration,
        uploadMethod: "edge_function",
        message: "Upload realizado com sucesso via Edge Function"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error) {
    console.error("[UPLOAD_EFD] Erro geral:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});

// Função utilitária para formatar bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}