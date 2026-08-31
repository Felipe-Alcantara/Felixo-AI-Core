# Arquitetura vigente — Felixo AI Core

Status: concluido.
Última revisão: 2026-08-31.

## Princípio do produto

O Felixo AI Core é **canvas-first**. O canvas organiza agentes, terminais,
arquivos, notas, grupos e páginas web; as conexões e os arquivos compartilhados
formam o contexto de trabalho.

O modo de chat foi depreciado. A implementação continua no repositório para
abrir sessões e exportar dados legados, mas é uma fronteira de compatibilidade:
novas capacidades, documentação de uso e decisões de arquitetura devem apontar
para o canvas.

## Mapa de camadas

```text
Electron main
├── core/                 descoberta de CLI, paths, shell e ciclo de vida
├── services/             IPC, PTY, adapters, contas, uso, Git e persistência
├── orchestration/        execuções multi-agente e continuidade
├── orchestrator/         planejamento, disponibilidade e políticas de spawn
├── mcp/                  catálogo de ferramentas do Felixo
└── windows/              janela principal e estado da janela
        │ preload tipado / contextIsolation
        ▼
React renderer
├── features/canvas/      superfície principal e sessões PTY reais
├── features/shared/      tipos, componentes e serviços compartilhados
└── features/chat/        superfície legada para compatibilidade
```

O processo principal continua responsável por processos, arquivos, Git,
contas, banco e IPC. O renderer compõe a interface e não recebe acesso direto
ao Node. O preload expõe somente os contratos necessários em `window.felixo`.

## Canvas e terminais

- `CanvasView` compõe o quadro e persiste nós e conexões.
- Terminais de agentes usam PTY real (`node-pty`), com `xterm.js` no renderer;
  continuam executando em background quando o bloco é recolhido.
- `TerminalSessionStore` mantém a sessão fora da árvore React para que mover o
  terminal entre o bloco e a gaveta não reinicie o processo.
- Arquivos `.md` do canvas vivem na área de dados do usuário e podem ser
  ligados a vários agentes. Eles são a memória compartilhada recomendada.
- O manifesto `.fxcanvas` transporta layout, conexões e conteúdo dos arquivos
  referenciados, mas não leva comandos ou caminhos dependentes da máquina.

## Providers e contas

Os providers entram por adapters e pelo registry de Terminal Adapters. A
execução de agentes pode usar Claude, Codex, Gemini, Codex App Server, Gemini
ACP e o launcher Openia, conforme a instalação e a configuração local.

Cada conta pode ter um perfil isolado por terminal. O perfil escolhido é
persistido no nó e nas preferências reutilizáveis; credenciais continuam sob o
controle da CLI/provider. O painel **Limites e uso** consulta as fontes que cada
provider realmente publica, separa contas por fingerprint seguro e nunca
transforma ausência de informação em zero.

Quando a fonte responde, a coleta é marcada como atual e mostra o horário da
medição. O Claude é consultado em uma sessão PTY descartável por conta/perfil e
expõe os dados completos e redigidos do `/status`; Codex e Openia usam suas
fontes locais/oficiais disponíveis; providers sem cota consultável são
apresentados como indisponíveis ou sem informação.

## Persistência e comunicação

| Área | Responsabilidade |
|------|------------------|
| SQLite | projetos, canvas, notas, modelos, automações, contas, uso e configurações |
| `canvas-files` | arquivos Markdown compartilhados pelos blocos do canvas |
| `.fxcanvas` | importação/exportação portátil do canvas |
| `context-deliveries` | artefatos temporários somente leitura para prompts longos |
| `logs` e QA Logger | diagnóstico local da sessão e das execuções |

Os caminhos são resolvidos pelo `app.getPath('userData')`, não ficam dentro do
repositório do usuário e não devem ser documentados com caminhos privados ou
credenciais reais.

## Fluxo legado de chat

O código em `features/chat/` e o armazenamento de histórico continuam sendo
carregados para preservar sessões antigas e exportações. Esse caminho não é o
local para novos componentes do produto. Uma mudança que precise atravessar a
compatibilidade deve manter o canvas como fonte da experiência e registrar o
impacto no `IA.md`.

## Documentos relacionados

- [`README.md`](../../README.md): entrada pública e capacidades observáveis.
- [`IA.md`](IA.md): decisões e evolução operacional, em ordem cronológica.
- [`ROADMAP.md`](ROADMAP.md): direção e ideias de contribuição.
- [`RODAR-VIA-CODIGO-FONTE.md`](RODAR-VIA-CODIGO-FONTE.md): execução local e
  atualização do checkout.
- [`GUIA-USUARIO.md`](../guias/GUIA-USUARIO.md): instalação e operação do
  canvas.
