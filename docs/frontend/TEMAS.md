# Temas e Customização Visual

Status: concluido.

## Contexto

O app começou com um tema escuro fixo. A tasklist pede novos estilos e preparação para customização futura por CSS/Tailwind.

## Escopo inicial

- Criar tokens CSS básicos para fundo, painéis, bordas, texto e destaque.
- Persistir preferência de tema em `localStorage`.
- Expor seletor no modal Felixo.
- Adicionar um tema alternativo inicial de alto contraste.

## Temas iniciais

| Tema | Objetivo |
|------|----------|
| Escuro | Tema padrão atual, discreto para uso prolongado |
| Alto contraste | Variante com fundos mais escuros, bordas mais fortes e destaque ciano |

## Fora do escopo inicial

- Editor visual de CSS.
- Importação/exportação de tema.
- Tema por workspace.
- Customização de todos os componentes legados hardcoded.

## Evolução recomendada

1. Migrar componentes centrais para tokens CSS.
2. Cobrir modais e painéis laterais.
3. Criar schema de tema persistente.
4. Permitir tema customizado por JSON ou CSS seguro.
5. Migrar persistência para SQLite/config Electron.

## Arquivos implementados

- `app/src/features/chat/services/theme-storage.ts`
- `app/src/features/chat/components/FelixoSettingsModal.tsx`
- `app/src/features/chat/components/ChatWorkspace.tsx`
- `app/src/index.css`
