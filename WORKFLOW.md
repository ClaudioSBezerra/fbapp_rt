# Workflow de Desenvolvimento e Deploy

Este documento descreve o fluxo de trabalho para desenvolvimento, versionamento e deploy da aplicação **fbapp_rt**.

## 1. Configuração do Repositório Git

### Estrutura de Branches
- **`main`**: Código de produção. Estável e pronto para deploy. Protegido (exige Pull Request).
- **`develop`**: (Opcional) Branch de integração para próximas versões.
- **`feature/nome-da-feature`**: Para novas funcionalidades.
- **`fix/nome-do-fix`**: Para correções de bugs.

### Convenção de Commits
Utilizamos o padrão [Conventional Commits](https://www.conventionalcommits.org/):
- `feat`: Nova funcionalidade
- `fix`: Correção de bug
- `docs`: Alterações na documentação
- `style`: Formatação, pontos e vírgulas (sem alteração de código)
- `refactor`: Refatoração de código
- `test`: Adição ou correção de testes
- `chore`: Atualização de tarefas de build, configurações, etc.

## 2. Pipeline de Deploy (Vercel)
O projeto está configurado para deploy automático na Vercel:
1. **Push na `develop`**: Gera um Preview Deployment.
2. **Merge na `main`**: Gera o Deploy de Produção.

## 3. Testes e Verificação
Antes de cada deploy, o script de build executa automaticamente:
1. **Testes Unitários**: `npm run test`
2. **Checagem de Tipos**: `tsc -b`
3. **Build**: `vite build`