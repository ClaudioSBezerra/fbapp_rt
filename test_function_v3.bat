@echo off
REM Testar a função parse-efd-v3 diretamente
REM Usando ANON_KEY do projeto

set PROJECT_ID=lfrkfthmlxrotqfrdmwq
set ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmcmtmdGhtbHhydHFmcmRtd3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzA1Mjg2NTEsImV4cCI6MjA0NjEwNDY1MX0.rJgHN7Y8YzjEQXFofKYnSsOBJ0cRB0K9_P-2D9sFq0Y

echo ========================================
echo Testando função parse-efd-v3
echo URL: https://%PROJECT_ID%.supabase.co/functions/v1/parse-efd-v3
echo ========================================
echo.

REM Test 1: Verificar se a função existe e responde
echo [Teste 1] Verificando se a função está implantada...
curl -X POST "https://%PROJECT_ID%.supabase.co/functions/v1/parse-efd-v3" \
  -H "Authorization: Bearer %ANON_KEY%" \
  -H "Content-Type: application/json" \
  -d '{"test": true}' \
  -w "\nHTTP Status: %%{http_code}\n" \
  -s

echo.

REM Test 2: Testar com payload mais realista
echo [Teste 2] Testando com payload realista (deve retornar 400 por missing parametros)...
curl -X POST "https://%PROJECT_ID%.supabase.co/functions/v1/parse-efd-v3" \
  -H "Authorization: Bearer %ANON_KEY%" \
  -H "Content-Type: application/json" \
  -d '{"empresa_id": "test", "file_path": "test.txt"}' \
  -w "\nHTTP Status: %%{http_code}\n" \
  -s

echo.
echo ========================================
echo INTERPRETACAO DOS RESULTADOS:
echo - Status 404: Funcao NAO foi implantada
echo - Status 401: Funcao ativa, mas token invalido
echo - Status 400: Funcao ativa, parametros invalidos
echo - Status 500: Funcao ativa, mas erro interno
echo ========================================
echo.
echo Se status foi 404, execute:
echo npx supabase functions deploy parse-efd-v3

echo.
echo Verifique os logs em: https://supabase.com/dashboard/project/%PROJECT_ID%/edge-functions
echo.
pause