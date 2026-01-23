# PowerShell script para testar a função parse-efd-v3
Set-Location "c:\Projetos TRAE\fbapp_rt"

$PROJECT_ID = "lfrkfthmlxrotqfrdmwq"
$ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmcmtmdGhtbHhydHFmcmRtd3FxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzA1Mjg2NTEsImV4cCI6MjA0NjEwNDY1MX0.rJgHN7Y8YzjEQXFofKYnSsOBJ0cRB0K9_P-2D9sFq0Y"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Testando função parse-efd-v3" -ForegroundColor Cyan
Write-Host "URL: https://$PROJECT_ID.supabase.co/functions/v1/parse-efd-v3" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[Teste 1] Verificando se a função está implantada..." -ForegroundColor Yellow

$headers = @{
    "Authorization" = "Bearer $ANON_KEY"
    "Content-Type" = "application/json"
}

$body = @{"test" = $true} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://$PROJECT_ID.supabase.co/functions/v1/parse-efd-v3" -Method POST -Headers $headers -Body $body -StatusCodeVariable statusCode
    
    Write-Host "HTTP Status: $statusCode" -ForegroundColor $(if($statusCode -eq 404){"Red"}elseif($statusCode -eq 400 -or $statusCode -eq 401){"Green"}else{"Yellow"})
    
    Write-Host "Response: $response" -ForegroundColor Gray
} 
catch {
    Write-Host "HTTP Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "INTERPRETACAO:" -ForegroundColor Cyan
Write-Host "- 404: Funcao NAO foi implantada" -ForegroundColor Red
Write-Host "- 401/400: Funcao ATIVA (OK)" -ForegroundColor Green
Write-Host "- 500: Funcao ATIVA com erro interno" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

if ($statusCode -eq 404) {
    Write-Host "" -ForegroundColor White
    Write-Host "Solucao: Execute o deploy da funcao:" -ForegroundColor White
    Write-Host "npx supabase functions deploy parse-efd-v3 --no-verify-jwt" -ForegroundColor Green
}

Write-Host ""
Write-Host "Verifique logs em: https://supabase.com/dashboard/project/$PROJECT_ID/edge-functions" -ForegroundColor Cyan
Write-Host ""
Read-Host "Pressione Enter para sair"