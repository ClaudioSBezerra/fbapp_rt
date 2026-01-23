// Script para testar função parse-efd-emergency localmente com Node.js
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const port = 9000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

app.use(express.json());

// Middleware CORS
app.use((req, res, next) => {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.header(key, value);
  });
  next();
});

// Rota principal (mesmo código da emergency)
app.post('/', async (req, res) => {
  console.log("EMERGENCY LOCAL (Node): Started");

  try {
    console.log("EMERGENCY LOCAL (Node): Reading body...");
    const body = req.body;
    console.log("EMERGENCY LOCAL (Node): Body read successfully", body);

    // Testar conexão com Supabase
    console.log("EMERGENCY LOCAL (Node): Testing Supabase connection...");
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase credentials");
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Testar consulta simples
    console.log("EMERGENCY LOCAL (Node): Testing simple query...");
    const startTime = Date.now();
    const { data: empresas, error: empresasError } = await supabase
      .from("empresas")
      .select("id, nome")
      .limit(1);
    
    const queryTime = Date.now() - startTime;
    console.log(`EMERGENCY LOCAL (Node): Query took ${queryTime}ms`);
    
    if (empresasError) {
      console.error("EMERGENCY LOCAL (Node): Query error:", empresasError);
      throw empresasError;
    }

    // Testar criação de filial (se tiver empresa_id válido)
    let filialTest = null;
    if (body.empresa_id && body.empresa_id !== 'test') {
      try {
        console.log("EMERGENCY LOCAL (Node): Testing filial creation...");
        const testCNPJ = "00000000000192";
        
        // Tentar criar filial
        const { data: newFilial, error: createError } = await supabase
          .from("filiais")
          .upsert({
            empresa_id: body.empresa_id,
            cnpj: testCNPJ,
            razao_social: "Test Local Filial",
          }, {
            onConflict: 'cnpj'
          })
          .select("id")
          .maybeSingle();
          
        if (createError) {
          console.log("EMERGENCY LOCAL (Node): Filial creation failed (expected):", createError.message);
        } else {
          filialTest = newFilial;
          console.log(`EMERGENCY LOCAL (Node): Filial test successful: ${filialTest?.id}`);
        }
      } catch (err) {
        console.log("EMERGENCY LOCAL (Node): Filial test error:", err.message);
      }
    }

    // Response
    console.log("EMERGENCY LOCAL (Node): Sending response...");
    res.json({
      success: true,
      message: "Emergency LOCAL (Node) test - DB connection successful",
      query_time_ms: queryTime,
      empresas_count: empresas?.length || 0,
      filial_test: filialTest ? 'success' : 'skipped',
      received: {
        empresa_id: body.empresa_id,
        file_path: body.file_path
      }
    });

  } catch (error) {
    console.error("EMERGENCY LOCAL (Node) ERROR:", error);
    res.status(500).json({ 
      error: "Emergency LOCAL (Node) error: " + (error.message || String(error))
    });
  }
});

// Rota OPTIONS para CORS
app.options('/', (req, res) => {
  console.log("EMERGENCY LOCAL (Node): OPTIONS request");
  res.status(200).end();
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`Starting local debug server on http://localhost:${port}`);
  console.log('Press Ctrl+C to stop');
  console.log('\nTest with:');
  console.log(`curl -X POST http://localhost:${port} -H "Content-Type: application/json" -d '{"empresa_id": "test", "file_path": "test.txt"}'`);
  console.log('\nOr test with real empresa_id:');
  console.log(`curl -X POST http://localhost:${port} -H "Content-Type: application/json" -d '{"empresa_id": "SEU_EMPRESA_ID_AQUI", "file_path": "test.txt"}'`);
});