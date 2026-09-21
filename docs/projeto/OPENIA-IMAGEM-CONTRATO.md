# Contrato Felixo AI Core ↔ Openia para geração de imagem

Definido em 21/09/2026 (task "Openia — integrar geração de imagens via IPC, processo filho e arquivo de
saída"). O lado do **Felixo** está implementado e testado com um `openia` falso rodando como processo de
verdade (`app/electron/services/openia-image-service.cjs`). O lado do **Openia** (repositório
`Felipe-Alcantara/Openia`) ainda NÃO existe: a versão 0.1.0 não tem `image` nem informa capacidade.

Princípio: a chave do OpenRouter fica só no Openia. O Felixo nunca a lê, nunca a passa por argumento nem a
recebe de volta; quem gera a imagem é um filho do Openia.

## 1. Capacidade — `openia models --json`

Cada modelo PODE ganhar `outputModalities` (lista das modalidades de saída do OpenRouter, ex.:
`architecture.output_modalities`):

```json
{ "models": [ { "id": "acme/pixel-1", "vendor": "acme", "name": "Pixel", "completionPrice": 0, "outputModalities": ["text", "image"] } ] }
```

- Valores aceitos pelo Felixo: `text`, `image`, `audio`, `video`, `embeddings`, `file` (o resto é descartado).
- **Ausente = capacidade desconhecida.** Se NENHUM modelo trouxer o campo, o Felixo não oferece geração de
  imagem e recusa pedidos com `capability_unknown` — ele não presume que um modelo gera imagem.

## 2. Geração — `openia image`

```
openia image --json --model <empresa/modelo> --out-dir <pasta> --request-id <id>
```

- O **prompt** chega por **stdin** (UTF-8, até o EOF), no máximo 4.000 caracteres. Nunca em argumento.
- `--out-dir` é uma pasta **privada do pedido**, criada pelo Felixo (modo 0700). Escreva os arquivos direto
  nela, com nome simples (sem `/`, `\` nem `..`). Arquivos de trabalho: escreva com nome temporário e
  renomeie só quando estiver completo. Saia com código 0 **somente depois** de todos os arquivos completos.
- Formatos aceitos (conferidos pelos BYTES, não pela extensão): PNG, JPEG, WebP, GIF, BMP, AVIF. **SVG e HTML
  são recusados.** Até 4 arquivos, cada um com no máximo 25 MB.
- **stdout**: um único objeto JSON.
  - Sucesso: `{ "ok": true, "files": [ { "name": "img-1.png", "mimeType": "image/png" } ], "cost": 0.04 }`
    (`mimeType` é só informativo; `cost` opcional, número ≥ 0 em USD).
  - Falha: `{ "ok": false, "code": "<código>" }` com código de saída ≠ 0. Códigos que o Felixo reconhece:
    `key_missing`, `insufficient_credits`, `model_unavailable`, `content_policy`. Qualquer outro vira
    "geração falhou". **Texto livre de erro é ignorado**: não confie em `message`.
- **stderr** é descartado. Nunca imprima a chave, cabeçalho de autorização nem traceback esperando que
  alguém leia: o Felixo não os mostra ao usuário.
- **Cancelamento/tempo**: o Felixo envia `SIGTERM` ao grupo de processos (Windows: `taskkill /T /F`) e,
  depois de 2 s, `SIGKILL`. Tempo máximo de uma geração: 180 s. Limpar parciais é bem-vindo, mas o Felixo
  apaga a pasta do pedido de qualquer forma.

## 3. O que o Felixo garante do seu lado

- O renderer só envia `{ prompt, model, requestId }`; qualquer outra chave (pasta, caminho) é recusada.
- Só lê os arquivos que o filho **listou**, um a um, se forem arquivo regular (nunca link), dentro da pasta
  do pedido, com tamanho no limite e bytes de imagem raster. Qualquer falha invalida o resultado inteiro.
- Grava pelo caminho seguro das imagens geradas (`saveGeneratedImage`, escrita atômica em
  `userData/generated-images`) e só **depois** avisa o canvas (`canvas:image-generated`).
- No máximo 2 gerações ao mesmo tempo; estados `pending` → `success` | `error` | `cancelled`.
- Mensagens ao renderer são fixas por código (`MESSAGES` no serviço): nunca stderr, chave ou traceback.
