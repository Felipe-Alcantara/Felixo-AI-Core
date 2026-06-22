# Temas e Customização Visual

Status: concluido.

## Contexto

O app começou com um tema escuro fixo. A tasklist pede novos estilos e preparação para customização futura por CSS/Tailwind.

## Escopo inicial

- Criar tokens CSS básicos para fundo, painéis, bordas, texto e destaque.
- Tokens adicionais: `--color-error`, `--color-success`, `--spacing-base`, `--radius-base`, `--shadow-base`.
- Persistir preferência de tema em `localStorage`.
- Expor seletor no modal Felixo.
- Adicionar um tema alternativo inicial de alto contraste.

## Temas iniciais

| Tema | Objetivo |
|------|----------|
| Escuro | Tema padrão atual, discreto para uso prolongado |
| Alto contraste | Variante com fundos mais escuros, bordas mais fortes e destaque ciano |

## Migração de tokens para componentes

Os tokens `--color-error`, `--color-success`, `--spacing-base`, `--radius-base` e `--shadow-base` agora possuem classes utilitárias em `@layer utilities` no `index.css`, permitindo uso direto nos componentes via classes como `text-theme-error`, `border-theme-success/20`, `bg-theme-error/10`, `rounded-theme`, `shadow-theme`, etc.

Componentes migrados para usar tokens de tema em vez de cores hardcoded:

- `CodePanel.tsx` — mensagens de erro e indicador de working tree limpo.
- `NotesModal.tsx` — botão de excluir nota.
- `TerminalPanel.tsx` — indicadores de erro, métricas, status dot e badge de sessão.
- `ModelSettingsModal.tsx` — botões de remover e limpar modelos.
- `AutomationsModal.tsx` — botão de remover automação e badge "Padrão".
- `ProjectsModal.tsx` — botão de remover projeto.
- `QaLoggerPanel.tsx` — cores de nível error e success nos logs.
- `OrchestratorSettingsModal.tsx` — checkbox de modelo bloqueado e badge de status de disponibilidade.

## Fora do escopo atual

- Editor visual de CSS.
- Importação/exportação de tema.
- Tema por workspace.
- Migração de cores semânticas não-error/success (sky, amber para assistant/tool).

## Evolução recomendada

1. ~~Migrar componentes centrais para tokens CSS.~~ Feito para error/success.
2. ~~Cobrir modais e painéis laterais.~~ Feito.
3. Criar schema de tema persistente.
4. Permitir tema customizado por JSON ou CSS seguro.
5. Migrar persistência para SQLite/config Electron.
6. Migrar cores semânticas restantes (assistant, tool, warn) para tokens.

## Arquivos implementados

- `app/src/features/chat/services/theme-storage.ts`
- `app/src/features/chat/components/FelixoSettingsModal.tsx`
- `app/src/features/chat/components/ChatWorkspace.tsx`
- `app/src/index.css` — tokens CSS e classes utilitárias `@layer utilities`.
