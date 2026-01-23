# Diagnóstico da Função parse-efd-v3

## Status Atual
- **Função**: parse-efd-v3
- **URL**: https://lfrkfthmlxrotqfrdmwq.supabase.co/functions/v1/parse-efd-v3
- **Versão**: INITIAL_DEPLOY (linha 14)
- **Último Upload**: Arquivo com CNPJ 1769130058257

## Principais Melhorias Implementadas

### 1. Bypass de RLS (Row Level Security)
```typescript
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
```
- Usa Service Role Key sem contexto de usuário
- Evita bloqueios por políticas RLS na tabela `filiais`

### 2. Tratamento Robusto de CNPJ Duplicado
- **Busca global** por CNPJ (ignora empresa_id)
- **Try/catch** na criação para capturar erros de duplicata
- **Recuperação automática** se CNPJ já existir
- **Logging detalhado** de cada etapa

### 3. Otimização de Memória (OOM Fix)
- **Range requests** para ler apenas 16KB do arquivo
- **Stream cancellation** se servidor ignorar Range header
- **Decodificação ISO-8859-1** para arquivos SPED

## Ações Necessárias

### 1. Testar Deploy da Função
Execute o script `test_function_v3.bat` ou manualmente:

```bash
curl -X POST "https://lfrkfthmlxrotqfrdmwq.supabase.co/functions/v1/parse-efd-v3" \
  -H "Authorization: Bearer EYJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

**Respostas Esperadas:**
- `401`: Função ativa (requer token válido)
- `400`: Função ativa (missing parametros)
- `404`: **Função não foi implantada corretamente**

### 2. Verificar Logs no Dashboard
1. Acesse: https://supabase.com/dashboard/project/lfrkfthmlxrotqfrdmwq
2. Edge Functions → parse-efd-v3 → Logs
3. Procure por:
   - `PARSE-EFD-V3 VERSION: INITIAL_DEPLOY`
   - `Checking existing filial for CNPJ:`
   - `Duplicate CNPJ detected`

### 3. Verificar Jobs no Banco
Execute o SQL em `check_job_status.sql`:

```sql
select 
  id, created_at, status, file_name, 
  left(error_message, 100) as error_preview
from import_jobs 
where created_at > now() - interval '2 hours'
order by created_at desc;
```

## Possíveis Problemas e Soluções

### Problema 1: Função não implantada (404)
**Sintoma:** curl retorna 404
**Causa:** Deploy falhou ou cache do Supabase
**Solução:**
```bash
npx supabase functions deploy parse-efd-v3 --no-verify-jwt
```

### Problema 2: Ainda ocorre erro de CNPJ duplicado
**Sintoma:** Logs mostram `duplicate key value violates unique constraint`
**Causa:** RLS ainda bloqueando ou concorrência
**Solução:** Verificar logs detalhados e confirmar se logging mostra "Service Role Access"

### Problema 3: Jobs não são criados
**Sintoma:** import_jobs tabela vazia após upload
**Causa:** Erro antes da criação do job
**Solução:** Verificar logs para erros de autenticação ou acesso

## Comparações: parse-efd-v2 vs parse-efd-v3

| Característica | v2 | v3 |
|---------------|----|----|
| RLS Bypass | Não implementado | ✅ Implementado |
| Duplicate CNPJ Handling | Simples | ✅ Robusto |
| Memory Optimization | Parcial | ✅ Completa |
| Logging | Básico | ✅ Detalhado |
| Error Recovery | Limitado | ✅ Completo |

## Próximos Passos
1. **Testar deploy** da função v3
2. **Verificar logs** para confirmar bypass RLS
3. **Fazer upload** de teste com arquivo problemático
4. **Monitorar jobs** para confirmar criação
5. **Comparar performance** com v2

## Backup
Se v3 falhar, reativar v2 modificando `ImportarEFD.tsx` linha 174:
```typescript
await supabase.functions.invoke('parse-efd-v2', { // Mudar para v2
```