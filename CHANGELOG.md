# Changelog

Todas as alterações notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Adicionado
- Configuração inicial do fluxo de CI/CD com Vercel.
- Estrutura de branches e convenção de commits.
- Pipeline de testes automatizados com Vitest.
- Utilitário de logging estruturado (`src/lib/logger.ts`).
- Documentação do workflow (`WORKFLOW.md`).
- Script de reescrita de rotas para SPA (`vercel.json`).

### Corrigido
- Erro "Missing script: test" no `package.json`.
- Configuração do Vitest (`vitest.config.ts`) para suporte a alias `@`.
- Dependências duplicadas no `package.json`.
- Vulnerabilidades de segurança em dependências (`tar`, `xlsx`).

## [0.0.0] - 2026-01-22
- Versão inicial do projeto.