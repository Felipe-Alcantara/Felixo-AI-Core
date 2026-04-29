# IA.md — Contexto Operacional do Felixo AI Core

## Objetivo do Projeto

[2026-04-28] Felixo AI Core é uma aplicação desktop Linux-first para centralizar ideias, agentes, CLIs de IA e fluxos de trabalho em uma interface única.

[2026-04-28] Primeiro corte: interface simples de chatbot para iniciar ideias, sem integração real com modelos ainda.

## Metas & Milestones

[2026-04-28] Concluído — Scaffold inicial em `app/` com Electron, React, TypeScript, Vite e Tailwind.

[2026-04-28] Concluído — Primeira tela útil: chat local de ideação com seletor visual de modelos.

[2026-04-28] Concluído — Criado `start_app.py` para iniciar o app pela raiz usando Python.

[2026-04-28] Concluído — Interface compactada e arredondada para uma experiência mais leve e menos parecida com dashboard genérico de IA.

[2026-04-28] Concluído — Frontend reorganizado em `src/features/chat/` com componentes, dados, tipos e serviço local separados.

[2026-04-28] Concluído — Processo Electron modularizado em `core/`, `services/` e `windows/`, seguindo separação de responsabilidades do padrão backend Felixo.

[2026-04-28] Concluído — Layout ajustado para o padrão desktop com sidebar fixa, landing central e prompt em destaque inspirado nas referências enviadas.

[2026-04-28] Concluído — Layout adaptado para zoom in/out: sidebar oculta em viewport compacto, prompt quebra controles em múltiplas linhas, landing ganha scroll vertical e janela aceita dimensões menores.

[2026-04-28] Pendente — Conectar os scripts de `ai-clis/` ao Electron via processo controlado.

[2026-04-28] Pendente — Salvar histórico local de conversas e ideias.

[2026-04-29] Em progresso — Integração real com CLIs iniciada pelo backend Electron: gerenciador de processos, adapters JSONL e IPC criados.

[2026-04-29] Concluído — Contratos do renderer atualizados com `cliType`, `StreamEvent` e bridge `window.felixo.cli` tipada.

[2026-04-29] Concluído — Chat React conectado ao bridge `window.felixo.cli`, com resposta assistente vazia, append incremental, cursor de streaming e botão de parar.

## Stack & Dependências

[2026-04-28] Desktop: Electron 41.

[2026-04-28] Frontend: React 19 + TypeScript 6 + Vite 8 + Tailwind CSS 3.

[2026-04-28] UI: `lucide-react` para ícones.

[2026-04-28] Tooling: ESLint 10, npm, Node 25.9.0 via `.nvmrc`.

[2026-04-29] Testes: `node:test` para validar adapters de streaming e leitor JSONL do backend Electron.

## Decisões de Arquitetura

[2026-04-28] TypeScript foi escolhido para o primeiro protótipo porque Electron e Vite têm integração direta com a stack frontend recomendada nos padrões Felixo.

[2026-04-28] Python permanece como opção forte para automações, agentes e serviços auxiliares depois que a interface desktop estiver validada.

[2026-04-28] A primeira resposta do chatbot é local e determinística; isso permite validar layout e fluxo antes de conectar CLIs reais.

[2026-04-28] Electron usa `contextIsolation: true`, `nodeIntegration: false` e preload dedicado para preservar uma base segura.

[2026-04-28] Layout padrão da janela ajustado para `1320x760`, com sidebar fixa e área central aproveitando todo o espaço útil.

[2026-04-28] A UI deve tratar zoom como redução do viewport útil: evitar larguras fixas rígidas na área central e preferir breakpoints, wrapping e scroll controlado.

[2026-04-28] `App.tsx` deve permanecer como composição de alto nível; regras e estado do chat ficam em `features/chat`.

[2026-04-28] O processo principal do Electron deve continuar fino, delegando criação de janela e serviços auxiliares para módulos dedicados.

[2026-04-29] Integração de CLIs segue padrão de adapters: `claude`, `codex` e `gemini` convertem formatos próprios de JSONL para um contrato único de evento de stream.

[2026-04-29] `cli-process-manager.cjs` concentra ciclo de vida dos processos filhos; IPC apenas valida entrada, orquestra adapter/processo e publica eventos para o renderer.

[2026-04-29] Leitura de stdout JSONL foi isolada em `jsonl-line-reader.cjs` para preservar linhas parciais entre chunks e facilitar teste unitário.

[2026-04-29] Modelos salvos passaram a carregar `cliType`; registros antigos sem esse campo são normalizados por inferência a partir de nome, origem e comando.

[2026-04-29] `ChatWorkspace` mantém uma sessão ativa por vez para evitar concorrência acidental no MVP; novas mensagens são bloqueadas enquanto há processo CLI em execução.

## Comandos Importantes

```bash
cd app
nvm use
npm install
npm run dev
```

```bash
python3 start_app.py
```

```bash
cd app
npm test
```

```bash
cd app
npm run lint
npm run build
```

## Próximo Passo Técnico

[2026-04-28] Implementar uma camada Electron IPC para executar comandos cadastrados com controle de processo, output incremental e botão de interrupção.

[2026-04-29] Próximo passo: conectar `window.felixo.cli` ao estado do chat React, adicionando `cliType` aos modelos, mensagem assistente vazia, streaming incremental e botão de parar.

## Testes Importantes

[2026-04-29] ✅ `npm test` — valida adapters `claude`, `codex`, `gemini` e preservação de linhas parciais no leitor JSONL.

[2026-04-29] ✅ `npm run build` e `npm run lint` — validação da fase de contratos TypeScript para modelos, stream events e preload bridge.

[2026-04-29] ✅ `npm test`, `npm run build` e `npm run lint` — validação da fase de UI streaming com Composer, ChatWorkspace e ChatThread.

[2026-04-29] BUG: Codex encerrava com código 1 ao enviar prompt pelo app.
CAUSA: adapter executava `codex exec` em um diretório sem git confiável e não passava `--skip-git-repo-check`.
FIX: `codex-adapter.cjs` agora inclui `--skip-git-repo-check`; teste de args atualizado para evitar regressão.
