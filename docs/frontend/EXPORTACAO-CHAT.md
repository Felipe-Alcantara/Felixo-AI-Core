# Exportação de Chat

Status: concluido.

## Contexto

O usuário precisa levar uma conversa para fora do app quando quiser continuar em outra plataforma de IA, criar backup, anexar em relatório ou auditar decisões.

## Escopo implementado neste recorte

- Exportação da conversa principal em JSON compacto.
- Exportação da conversa principal em Markdown.
- Inclusão de metadados básicos:
  - data da exportação;
  - título estimado;
  - mensagens;
  - modelo associado a respostas;
  - projetos ativos;
  - anexos de contexto registrados na sessão;
  - resumo das threads de terminal, sem saída bruta de subagentes.
- Nome manual do arquivo antes de exportar.
- Escolha manual de destino com diálogo nativo do Electron quando disponível.
- Fallback para download local pelo navegador quando o diálogo nativo não estiver disponível.

## Fora do escopo inicial

- Reimportação de conversas.
- Exportação completa de terminal bruto.
- Exportação completa de subagentes e runs do orquestrador.
- Criptografia ou redaction automática.

## Formatos

### JSON compacto

Formato indicado para backup, automação futura e reimportação:

```json
{
  "version": 1,
  "exportedAt": "2026-05-01T12:00:00.000Z",
  "title": "Primeira pergunta",
  "messages": []
}
```

### Markdown

Formato indicado para leitura humana e para continuar a conversa em outra IA.

## Cuidados

- Conversas podem conter dados sensíveis.
- O app não tenta remover segredos automaticamente neste recorte.
- O usuário deve revisar o arquivo antes de enviar para outra plataforma.

## Arquivos implementados

- `app/src/features/chat/services/chat-export.ts`
- `app/src/features/chat/components/ChatExportModal.tsx`
- `app/src/features/chat/components/AppSidebar.tsx`
- `app/src/features/chat/components/ChatWorkspace.tsx`
- `app/electron/services/file-export-ipc-handlers.cjs`
- `app/electron/preload.cjs`
