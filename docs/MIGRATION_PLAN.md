# Planejamento de Migração: Arquitetura Go + VPS

Este documento descreve a arquitetura técnica preliminar para a migração do sistema `fbapp_rt` (atualmente React/Supabase) para um ambiente de produção robusto utilizando Go (Golang) e PostgreSQL em servidor VPS, mantendo o frontend hospedado na Vercel.

## 1. Visão Geral da Infraestrutura (Arquitetura Híbrida)

A infraestrutura será híbrida, combinando a excelência da Vercel para entrega de conteúdo estático (Frontend) com a robustez e controle de um VPS (Hostinger) para o Backend e Banco de Dados.

### Diagrama de Componentes

```mermaid
graph TD
    User[Usuário Final] -->|HTTPS| Vercel[Frontend React (Vercel)]
    Vercel -->|API REST/WebSocket| VPS[VPS Hostinger (Backend)]
    
    subgraph "VPS Hostinger (Docker)"
        Nginx[Nginx Proxy Reverso]
        App[Backend Go (Echo)]
        DB[PostgreSQL 15+]
        Redis[Redis (Cache/Sessão)]
    end
    
    User -->|API Direct Call| Nginx
    Nginx --> App
    App --> DB
    App --> Redis
```

### Justificativa da Escolha (Vercel vs VPS)

| Recurso | Vercel | Hostinger (VPS) | Decisão |
| :--- | :--- | :--- | :--- |
| **Frontend (React)** | **Excelente.** CDN global, deploy automático (git push), cache otimizado. | Bom, mas requer configuração manual de Nginx/CDN. | **Vercel** |
| **Backend (Go)** | **Inviável.** Serverless tem timeouts curtos (10-60s) e não suporta WebSockets persistentes. Incompatível com processamento de arquivos grandes (EFD). | **Ideal.** Controle total, sem timeouts, suporta processos longos em memória e conexões persistentes. Custo fixo e previsível. | **Hostinger** |
| **Banco de Dados** | Não oferece nativamente (usa parceiros). | Pode hospedar PostgreSQL no mesmo servidor (custo zero) ou gerenciado. | **Hostinger** |

### Especificações do VPS (Recomendado: Hostinger KVM 2 ou similar)
- **OS:** Ubuntu 22.04 LTS (Minimal)
- **CPU:** 2 vCPU
- **RAM:** 4 GB (Go é eficiente, mas o PostgreSQL precisa de cache)
- **Disco:** 50 GB+ NVMe SSD
- **Portas Abertas:** 22 (SSH), 80 (HTTP), 443 (HTTPS)

## 2. Backend em Go (Golang)

O backend será reescrito focando em performance para processamento de arquivos grandes (EFD) e baixa latência.

### Stack Tecnológica
- **Linguagem:** Go 1.22+
- **Web Framework:** **Echo (v4)** ou **Gin**. (Echo é recomendado pela facilidade de middleware e performance).
- **Database Driver:** **pgx/v5** (Driver PostgreSQL de alta performance, type-safe).
- **Migration Tool:** **golang-migrate** (Versionamento de schema do banco).
- **Auth:** `golang-jwt` (JWT) + `crypto/bcrypt` (Senhas) + `pquerna/otp` (2FA).
- **WebSockets:** `gorilla/websocket` (Para substituir o Supabase Realtime no progresso de uploads).

### Estrutura de Diretórios (Padrão Clean Architecture/Golang-Standards)

```text
/backend
├── cmd/
│   └── api/            # Ponto de entrada (main.go)
├── internal/
│   ├── config/         # Carregamento de env vars
│   ├── models/         # Estruturas de dados (Structs)
│   ├── repository/     # Acesso ao banco de dados (SQL queries)
│   ├── service/        # Regras de negócio (Processamento EFD, Auth)
│   ├── handler/        # Controllers HTTP (Endpoints)
│   └── middleware/     # Auth, Logger, CORS
├── pkg/
│   ├── database/       # Conexão Postgres
│   └── utils/          # Helpers globais
├── migrations/         # Scripts SQL (.up.sql e .down.sql)
└── go.mod
```

## 3. Estratégia de Autenticação e Segurança

### Fluxo de Login
1.  Usuário envia Email/Senha.
2.  Backend valida hash da senha (`bcrypt`).
3.  Se 2FA estiver ativo, solicita código TOTP (Google Authenticator).
4.  Backend gera par de tokens:
    *   **Access Token (JWT):** Expira em 15min. Contém `user_id`, `role`, `tenant_id`.
    *   **Refresh Token:** Expira em 7 dias. Armazenado no banco e enviado como **HttpOnly Cookie**.

### Recuperação de Senha
1.  Usuário solicita reset via e-mail.
2.  Backend gera token aleatório (armazenado no Redis ou Postgres com expiração de 30min).
3.  Link enviado por e-mail aponta para o frontend com o token.

## 4. Migração de Banco de Dados

### Adaptação do Schema
O Supabase utiliza schemas proprietários (`auth`, `storage`, `realtime`). A migração envolverá:

1.  **Tabela `users`:** Criar tabela própria no schema `public`.
    ```sql
    CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        two_factor_secret VARCHAR(255), -- Para TOTP
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMPTZ DEFAULT now()
    );
    ```
2.  **Tabelas de Negócio:** `import_jobs`, `mercadorias`, `uso_consumo_imobilizado`, etc., serão replicadas 1:1.
3.  **Views Materializadas:** Serão recriadas exatamente como estão.

## 5. Processamento de Arquivos (Diferencial do Go)

Diferente das Edge Functions (que sofrem com timeout), o Go permite **Streaming Processing**:

1.  **Upload:** O arquivo é recebido via stream multipart e salvo temporariamente no disco do VPS.
2.  **Processamento:** Uma *goroutine* (thread leve) lê o arquivo linha a linha.
3.  **Batch Insert:** O driver `pgx` utiliza `CopyFrom` (protocolo COPY do Postgres) para inserir milhares de linhas por segundo, muito mais rápido que `INSERT` comum.
4.  **Feedback:** O progresso é enviado via WebSocket para o frontend em tempo real.

## 6. Próximos Passos Imediatos

1.  **Setup do Repositório:** Criar a estrutura do projeto Go.
2.  **Docker Local:** Criar `docker-compose.yml` para rodar Postgres e Go localmente.
3.  **POC de Auth:** Implementar Registro e Login com JWT para validar a estrutura.
