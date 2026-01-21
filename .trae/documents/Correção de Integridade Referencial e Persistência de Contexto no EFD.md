O diagnóstico revelou 3 problemas críticos na função `process-efd-job` que podem causar falhas de integridade referencial (Foreign Key) e perda de dados de PIS/COFINS em arquivos grandes (chunking).

### Problemas Identificados

1.  **Violação de Foreign Key (Ordem de Inserção)**:
    *   O código atual insere `participantes` (0150) por *último* no processamento de lote (`flushAllBatches`).
    *   Se um registro de `mercadorias` (C100) referenciar um participante que ainda está no buffer de memória e não foi salvo no banco, o Supabase retornará erro de chave estrangeira.
2.  **Perda de Dados PIS/COFINS (Chunking)**:
    *   Registros de transporte (D100) e telecom (D500) acumulam valores de registros filhos (D101/D105).
    *   Se o processamento for interrompido (chunk limit) *entre* um D100 e seus filhos, o código atual "finaliza" o D100 prematuramente com valores zerados e descarta o contexto `pendingD100`.
    *   Na retomada (próximo chunk), os registros filhos D101/D105 ficam órfãos e os valores de impostos são perdidos.
3.  **Dependência de Flush em Lote**:
    *   Durante o loop principal, se o buffer de `mercadorias` encher (500 itens) antes do buffer de `participantes`, ele tenta inserir as mercadorias sem garantir que os participantes novos já estejam no banco.

### Plano de Correção

#### 1. Corrigir Ordem de Flush e Dependências
*   **Ação:** Modificar `flushAllBatches` para inserir `participantes` **primeiro**.
*   **Ação:** No loop principal, antes de fazer flush de qualquer tabela (`mercadorias`, `fretes`, etc.), forçar um `flushBatch("participantes")` se houver itens pendentes. Isso garante que qualquer participante referenciado já exista no banco.

#### 2. Persistir Contexto de Registros Pendentes
*   **Ação:** Alterar o objeto `context` salvo no banco (`import_jobs`) para incluir `pendingD100` e `pendingD500`.
*   **Ação:** Atualizar a lógica de restauração (`existingContext`) para recuperar esses objetos pendentes ao iniciar um novo chunk.

#### 3. Ajustar Finalização de Chunks
*   **Ação:** Modificar a lógica de finalização no fim do arquivo.
    *   **Atual:** Finaliza D100/D500 sempre que o script para (fim do arquivo OU limite de tempo).
    *   **Novo:** Só finalizar D100/D500 se for realmente o **fim do arquivo** (EOF). Se for apenas uma pausa para retomar no próximo chunk, salvar o estado pendente e continuar depois.

### Arquivos Afetados
*   `supabase/functions/process-efd-job/index.ts`
