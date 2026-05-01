# Tasklist 01-05-2026 — Plano de Execução

Status: em desenvolvimento.

## Objetivo

Executar a tasklist de 01/05/2026 em ciclos pequenos: investigar, documentar, implementar, validar e registrar o resultado. O foco inicial é estabilizar fluxos já existentes e entregar funcionalidades pequenas que desbloqueiam uso real do app.

## Decisão de escopo

Nem todos os itens da tasklist devem virar implementação completa imediata. A própria tasklist classifica workflows visuais, painel Git completo, relatórios e SQLite como planos ou fases futuras. Esses itens serão documentados agora e só entram em implementação incremental depois de existir contrato claro de UI, dados e segurança.

## Entregas deste ciclo

| Item | Ação |
|------|------|
| Novo chat limpa cache | Validar implementação existente e manter documentação atual |
| Nome das threads | Validar implementação existente e manter documentação atual |
| Modelos e limites no orquestrador | Implementar contexto de capacidades e validação de spawn |
| Configurações do orquestrador | Implementar modal e persistência local |
| Exportação de chat | Implementar exportação JSON compacto e Markdown |
| Bloco de notas | Implementar notas locais por workspace/app e uso como contexto manual |
| Temas | Implementar preferência local e tema alternativo inicial |
| Workflows visuais | Documentar plano faseado |
| Painel Git completo | Documentar plano faseado |
| Relatórios por commits | Documentar plano faseado |
| SQLite | Documentar plano faseado |
| Status da documentação | Criar auditoria de status sem renomear arquivos neste ciclo |
| Modelos baratos | Registrar pesquisa inicial com data e fontes |

## Guardrails

- Não sobrescrever alterações já existentes em `/docs`.
- Não renomear documentos modificados neste ciclo para evitar capturar mudanças do usuário em commits indevidos.
- Não implementar operações destrutivas de Git.
- Não persistir histórico sensível em banco ainda; notas e configurações continuam em `localStorage`.
- Para orquestração, impedir spawn quando o modelo estiver bloqueado ou não existir entre os modelos disponíveis enviados pelo frontend.

## Validação esperada

- `npm test`
- `npm run lint`
- `npm run build`
- `git diff --check`

## Resultado esperado

Ao fim deste ciclo, o app deve oferecer uma base melhor para trabalho diário: exportar conversas, manter notas, configurar orquestração, alternar tema inicial e dar ao orquestrador contexto mais claro sobre quais modelos pode usar.

## Resultado deste ciclo

- Exportação de chat adicionada em JSON compacto e Markdown.
- Bloco de notas local adicionado com criação, edição, exclusão, busca e envio manual como contexto.
- Modal de orquestrador adicionado com contexto, skills, modelos preferidos/bloqueados, modo e limites.
- Contexto de capacidades de modelos adicionado ao prompt de orquestração.
- Backend passou a validar spawn de subagente contra modelos disponíveis e bloqueios.
- Tema alternativo de alto contraste adicionado com preferência persistida.
- Planos futuros documentados para workflows visuais, painel Git, relatórios e SQLite.
- Pesquisa inicial de modelos baratos registrada com fontes e data.
- Todos os Markdown em `/docs` receberam linha `Status:` no corpo.
