@echo off
REM Navegar para o diretório do projeto primeiro
cd /d "c:\Projetos TRAE\fbapp_rt"

REM Testar a função parse-efd-v3 diretamente
set PROJECT_ID=lfrkfthmlxrotqfrdmwq
set ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmcmtmdGhtbHhydHFmcmRtd3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzA1Mjg2NTEsImV4cCI6MjA0NjEwNDY1MX0.rJgHN7Y8YzjEQXFofKYnSsOBJ0cRB0K9_P-2D9sFq0Y

echo ========================================
echo Testando função parse-efd-v3
echo URL: https://%PROJECT_ID%.supabase.co/functions/v1/parse-efd-v3
echo ========================================
echo.

REM Test 1: Verificar se a função existe
echo [Teste 1] Verificando se a função está implantada...
curl -X POST "https://%PROJECT_ID%.supabase.co/functions/v1/parse-efd-v3" \n  -H "Authorization: Bearer %ANON_KEY%" \n  -H "Content-Type: application/json" \n  -d '{"test": true}' \n  -w "\nHTTP Status: %%{http_code}\n" \n  -s

echo.
echo ========================================
echo INTERPRETACAO:
echo - 404: Funcao NAO implantada

echo.
echo Se 404, execute: npx supabase functions deploy parse-efd-v3
pause