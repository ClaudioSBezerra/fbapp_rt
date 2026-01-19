# Changelog - Sistema de Gestão da Reforma Tributária

## [MVP_19012026] - 19 de Janeiro de 2026

> **Primeira versão MVP (Minimum Viable Product) estável do sistema.**

---

## 📊 Estatísticas do Sistema

| Métrica | Valor |
|---------|-------|
| Total de Mercadorias | 1.336.762 registros |
| Total de Fretes | 15.222 registros |
| Total de Serviços | 9.279 registros |
| Total de Energia/Água | 82 registros |
| Total de Uso/Consumo | 1.039 registros |
| Total de Participantes | 123.487 registros |
| Total de Filiais | 51 |
| Total de Empresas | 2 |
| Total de Grupos | 1 |
| Total de Tenants | 1 |
| Total de Usuários | 4 |

---

## ✅ Funcionalidades Implementadas

### Páginas (19 total)

| Categoria | Páginas |
|-----------|---------|
| **Marketing** | Landing Page |
| **Autenticação** | Login, Cadastro, Recuperação de Senha, Reset de Senha |
| **Setup** | Onboarding (configuração inicial) |
| **Dashboards** | Dashboard Principal (projeções tributárias), Dashboard Uso/Consumo |
| **Operações** | Mercadorias, Mercadorias por Participante, Serviços, Energia/Água, Fretes, Uso/Consumo/Imobilizado |
| **Configuração** | Alíquotas (tabela da reforma), Empresas (admin), Configurações (admin) |
| **Importação** | Importar EFD Contribuições, Importar EFD ICMS/IPI |

### Edge Functions (17 total)

| Função | Descrição |
|--------|-----------|
| `parse-efd` | Parser de arquivos EFD Contribuições |
| `process-efd-job` | Processamento assíncrono de EFD Contribuições |
| `parse-efd-icms` | Parser de arquivos EFD ICMS/IPI |
| `process-efd-icms-job` | Processamento assíncrono de EFD ICMS/IPI |
| `refresh-views` | Atualização de materialized views |
| `clear-company-data` | Limpeza de dados por empresa |
| `clear-icms-data` | Limpeza de dados ICMS |
| `clear-imported-data` | Limpeza de dados importados |
| `reset-all-data` | Reset completo de dados |
| `cancel-import-job` | Cancelamento de importações em andamento |
| `send-password-reset` | Envio de email para reset de senha |
| `verify-security-keyword` | Verificação de palavra de segurança |
| `onboarding-complete` | Finalização do onboarding |
| `join-tenant` | Ingresso em tenant existente |
| `list-tenants` | Listagem de tenants disponíveis |
| `get-tenant-structure` | Estrutura organizacional do tenant |
| `send-import-email` | Notificação de importação concluída |

### Materialized Views (11 total)

| View | Descrição |
|------|-----------|
| `mv_mercadorias_aggregated` | Agregação de mercadorias por filial/período |
| `mv_mercadorias_participante` | Mercadorias detalhadas por participante |
| `mv_participantes_cache` | Cache de participantes por empresa (otimizado) |
| `mv_fretes_aggregated` | Agregação de fretes |
| `mv_fretes_detailed` | Fretes detalhados com Simples Nacional |
| `mv_energia_agua_aggregated` | Agregação de energia/água |
| `mv_energia_agua_detailed` | Energia/água detalhado |
| `mv_servicos_aggregated` | Agregação de serviços |
| `mv_uso_consumo_aggregated` | Agregação de uso/consumo/imobilizado |
| `mv_uso_consumo_detailed` | Uso/consumo detalhado |
| `mv_dashboard_stats` | Estatísticas consolidadas para dashboard |

### Funções RPC (30+ funções)

**Segurança e Acesso:**
- `has_role(user_id, role)` - Verificação de papel do usuário
- `has_tenant_access(user_id, tenant_id)` - Acesso ao tenant
- `has_empresa_access(user_id, empresa_id)` - Acesso à empresa
- `has_filial_access(user_id, filial_id)` - Acesso à filial

**Acesso a Materialized Views:**
- `get_mv_mercadorias_aggregated()`
- `get_mv_fretes_aggregated()` / `get_mv_fretes_detailed()`
- `get_mv_energia_agua_aggregated()` / `get_mv_energia_agua_detailed()`
- `get_mv_servicos_aggregated()`
- `get_mv_uso_consumo_aggregated()` / `get_mv_uso_consumo_detailed()`
- `get_mv_dashboard_stats()`

**Paginação de Participantes:**
- `get_mercadorias_participante_lista()` - Lista de participantes
- `get_mercadorias_participante_page()` - Paginação de mercadorias
- `get_mercadorias_participante_totals()` - Totais agregados
- `get_mercadorias_participante_meses()` - Meses disponíveis

**Deleção em Batch:**
- `delete_mercadorias_batch()`
- `delete_fretes_batch()`
- `delete_energia_agua_batch()`
- `delete_servicos_batch()`
- `delete_participantes_batch()`
- `delete_uso_consumo_batch()`

**Simples Nacional:**
- `get_simples_counts()` - Contadores de optantes
- `get_simples_link_stats()` - Estatísticas de vinculação
- `get_cnpjs_mercadorias_pendentes()` - CNPJs não classificados
- `get_cnpjs_uso_consumo_pendentes()` - CNPJs pendentes em uso/consumo

---

## 🔧 Correções Recentes (19/01/2026)

### Isolamento de Dados por Empresa
**Problema:** Usuários visualizavam dados de outras empresas no filtro de participantes.

**Solução:**
- `mv_participantes_cache` agora agrupa por `empresa_id` ao invés de apenas `tenant_id`
- `get_mercadorias_participante_lista()` filtra por empresas acessíveis ao usuário
- Admins: visualizam todas as empresas do tenant
- Usuários normais: visualizam apenas empresas vinculadas via `user_empresas`

**Hierarquia respeitada:** Tenant → Grupo → Empresa → Filial

### Otimização de Performance
- Extensão `pg_trgm` habilitada para buscas fuzzy
- Índices GIN para busca de texto otimizada
- Statement timeout aumentado para 300 segundos
- Cache de participantes com índices específicos:
  - `idx_mv_part_cache_empresa` (empresa_id)
  - `idx_mv_part_cache_tenant` (tenant_id)
  - `idx_mv_part_cache_nome` (nome do participante)
  - `idx_mv_part_cache_valor` (ordenação por valor)
  - `idx_mv_part_cache_nome_trgm` (busca fuzzy GIN)

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      LOVABLE CLOUD                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  PostgreSQL │  │    Auth     │  │   Edge Functions    │  │
│  │   + RLS     │  │    JWT      │  │   (Deno Runtime)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐                           │
│  │   Storage   │  │  Realtime   │                           │
│  │ (EFD Files) │  │  (Jobs)     │                           │
│  └─────────────┘  └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

### Multi-tenancy (4 níveis)

```
Tenant (Escritório/Cliente)
    └── Grupo de Empresas
            └── Empresa (CNPJ Matriz)
                    └── Filial (CNPJ Filial)
```

---

## 🗄️ Tabelas do Banco de Dados (17 tabelas)

| Categoria | Tabelas |
|-----------|---------|
| **Hierarquia Organizacional** | `tenants`, `grupos_empresas`, `empresas`, `filiais` |
| **Transações Fiscais** | `mercadorias`, `servicos`, `fretes`, `energia_agua`, `uso_consumo_imobilizado`, `participantes` |
| **Usuários e Acesso** | `profiles`, `user_roles`, `user_tenants`, `user_empresas` |
| **Suporte** | `aliquotas`, `import_jobs`, `audit_logs`, `simples_nacional`, `password_reset_tokens`, `subscription_plans` |

---

## 📋 Próximos Passos Planejados

- [ ] Filtro por Empresa no painel de Mercadorias/Participante
- [ ] Histórico de importações com detalhes
- [ ] Dashboard de gestão de usuários (admin)
- [ ] Auditoria de acesso para compliance
- [ ] Integração com Stripe para pagamentos
- [ ] Exportação de relatórios em PDF
- [ ] Notificações em tempo real
- [ ] Backup automatizado de dados

---

## 📝 Notas de Versão

Esta versão representa o primeiro marco estável do sistema, com todas as funcionalidades core implementadas:

1. **Importação de EFD** - Suporte completo a EFD Contribuições e EFD ICMS/IPI
2. **Projeções Tributárias** - Cálculos baseados nas alíquotas da Reforma Tributária (2027-2033)
3. **Multi-tenancy** - Isolamento completo de dados entre clientes
4. **Gestão de Simples Nacional** - Classificação de fornecedores optantes
5. **Performance** - Materialized views para consultas otimizadas

---

*Documento gerado em 19/01/2026*
