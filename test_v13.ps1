
# Script de teste para parse-efd-v13
$env:SUPABASE_URL = "https://lfrkfthmlxrotqfrdmwq.supabase.co"
$env:SUPABASE_ANON_KEY = "sua_chave_aqui_se_necessario_mas_vamos_usar_service_role_ou_anon_no_header"

# ID da empresa de teste (deve existir na tabela empresas)
$empresaId = "c3f4b2a7-1e8d-4c5a-9f2e-6d8a9b7c3d5f"

# Headers
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer token_mock_ou_anon"
}

# Body
$body = @{
    "empresa_id" = $empresaId
    "file_path" = "test_path/arquivo.txt"
    "file_name" = "arquivo_teste.txt"
    "file_size" = 12345
    "record_limit" = 100
    "import_scope" = "full"
} | ConvertTo-Json

Write-Host "Invocando parse-efd-v13 com empresa_id: $empresaId"

try {
    $response = Invoke-RestMethod -Uri "$($env:SUPABASE_URL)/functions/v1/parse-efd-v13" `
        -Method POST `
        -Headers $headers `
        -Body $body `
        -ErrorAction Stop

    Write-Host "Sucesso!" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 5)
} catch {
    Write-Host "Erro na requisição:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errorBody = $reader.ReadToEnd()
        Write-Host "Detalhes do erro:"
        Write-Host $errorBody
    }
}
