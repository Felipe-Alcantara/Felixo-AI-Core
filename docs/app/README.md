# Felixo AI Core App

Aplicação desktop inicial do Felixo AI Core.

## Stack

- Electron
- React
- TypeScript
- Vite
- Tailwind CSS
- lucide-react

## Requisitos

- Node `25.9.0` recomendado via `.nvmrc`
- npm

## Como Rodar

Pela raiz do repositório:

```bash
python3 start_app.py
```

Ou manualmente:

```bash
nvm use
npm install
npm run dev
```

## Scripts

```bash
npm run dev      # abre Vite + Electron
npm run dev:web  # abre somente o frontend no navegador
npm test         # valida adapters e leitor JSONL do backend Electron
npm run lint     # valida ESLint
npm run build    # valida TypeScript e gera build web
npm run start    # abre Electron usando o build em dist/
```

## Estado Atual

A interface funciona como um chatbot desktop com sidebar fixa, landing central e prompt em destaque. O processo principal do Electron já expõe um backend local para executar `claude`, `codex` e `gemini`, ler stdout em JSONL e enviar eventos normalizados ao React em streaming.

O chat cria uma mensagem assistente vazia, atualiza o texto incrementalmente e permite interromper a execução em andamento pelo botão de parar. Modelos importados recebem `cliType` por inferência a partir do nome, origem e comando.

O workspace também inclui um painel `QA Logger` no rodapé para observar eventos do backend Electron em tempo real: comando iniciado, PID, cwd, stdout JSONL bruto, stderr, saída fora de JSONL, encerramento e erros. A lateral `Terminal` mostra uma visão humanizada desses eventos: início, processamento, respostas, ferramentas, tempo e tokens. Ruídos conhecidos de `stderr` do Codex e avisos visuais não fatais do Gemini que não impedem a conclusão são filtrados antes de chegar à UI.

A conversa separa `threadId` e `sessionId`: o `threadId` identifica a conversa/modelo e agrupa o terminal; o `sessionId` identifica a mensagem assistente que recebe o streaming. Claude já usa processo persistente real via `--input-format stream-json`, mantendo `stdin` aberto entre mensagens da mesma conversa. Codex e Gemini ainda rodam one-shot por mensagem e recebem continuidade pelo contexto explícito enviado no prompt.

Status detalhado do que está pronto e do que falta: [docs/projeto/STATUS-ATUAL.md](../projeto/STATUS-ATUAL.md).

## Estrutura

```text
electron/
├── core/       # caminhos e configuração base
├── services/   # adapters, IPC e processos CLI do backend local
└── windows/    # criação das janelas Electron

src/
└── features/
    └── chat/
        ├── components/
        ├── data/
        ├── services/
        └── types.ts
```

Essa organização segue a ideia dos padrões Felixo: componentes visuais no front, regras e dados do fluxo em serviços próprios, e processo Electron tratado como backend local com responsabilidades separadas.
