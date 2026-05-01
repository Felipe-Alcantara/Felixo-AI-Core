# Bloco de Notas Interno

Status: concluido.

## Contexto

O bloco de notas serve para guardar tasklists, ideias, brainstorms, decisões e rascunhos relacionados ao uso do Felixo AI Core. Ele é diferente de histórico de chat e de memória persistente.

## Escopo inicial

- Notas locais salvas em `localStorage`.
- Criar nota.
- Editar título e conteúdo.
- Excluir nota com confirmação.
- Buscar por título ou conteúdo.
- Ordenar por atualização recente.
- Enviar uma nota como contexto manual para a próxima mensagem.
- Criar uma nota a partir da conversa atual.

## Diferença entre nota, histórico e memória

| Conceito | Uso |
|----------|-----|
| Nota | Conteúdo escrito ou salvo manualmente pelo usuário |
| Histórico | Registro das mensagens do chat |
| Memória | Conhecimento persistente selecionado para influenciar respostas futuras |

## Persistência

O primeiro recorte usa `localStorage` para evitar introduzir SQLite antes do plano de schema. Quando a persistência SQLite entrar, notas devem migrar para tabela própria e manter vínculo opcional com projeto/workspace.

## Cuidados

- Nota só entra no prompt quando o usuário escolhe usar como contexto.
- Excluir nota exige confirmação nativa.
- O bloco de notas não substitui tasklists versionadas em `/docs`.

## Arquivos implementados

- `app/src/features/chat/services/note-storage.ts`
- `app/src/features/chat/components/NotesModal.tsx`
- `app/src/features/chat/components/AppSidebar.tsx`
- `app/src/features/chat/components/ChatWorkspace.tsx`
