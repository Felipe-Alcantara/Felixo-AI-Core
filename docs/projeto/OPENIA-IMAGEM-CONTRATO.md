# Contrato Felixo AI Core ↔ Openia para geração de imagem

**Este é o contrato REAL do Openia** (repositório `Felipe-Alcantara/Openia`, `openia/cli.py` comando `image`
e `openia/image.py`, commits `d1b542e` a `9bb9099`). A primeira versão deste documento (21/09/2026, PR #81)
foi escrita contra um clone desatualizado e definia um contrato que o Openia NÃO tem (prompt por stdin,
`--out-dir`, `files[].name`, `outputModalities` em `models --json`); ela foi substituída por esta.

Princípio: a chave do OpenRouter fica só no Openia. O Felixo nunca a lê, nunca a passa por argumento nem a
recebe de volta; quem gera a imagem é um filho do Openia. Implementação do lado do Felixo:
`app/electron/services/openia-image-service.cjs`.

## 1. Quais modelos geram imagem — catálogo PÚBLICO do OpenRouter

O Openia **não** lista capacidade em `models --json`: ele consulta `/api/v1/images/models` por dentro e recusa
(`model_not_found` / `model_unsupported`) um modelo sem saída de imagem antes do POST. Por decisão da pessoa,
o **Felixo consulta o mesmo catálogo público** (`GET https://openrouter.ai/api/v1/images/models`, respondeu
HTTP 200 sem credencial em 21/09/2026) para listar e validar:

- sem chave nem cabeçalho de autorização, sem redirecionamento, no máximo 10 s e 2 MiB;
- guarda só id, nome, fornecedor e modalidades de uma lista fechada, dos modelos cujo
  `architecture.output_modalities` inclui `image`; ids malformados são ignorados;
- cache de 10 min; catálogo indisponível → `catalog_unavailable` (nada é executado).

## 2. Geração — `openia image` (como o Felixo chama)

```
openia image --json --model <empresa/modelo> --prompt=<texto> --output-dir <pasta> \
             --request-id <id> --cancel-file <arquivo> --timeout 100 --retries 1
```

- **Prompt**: em `--prompt=<texto>` (colado ao `=`, então nunca é lido como opção, mesmo começando com `-`).
  O Openia **não** lê stdin. O prompt fica visível na lista de processos da máquina (não é segredo) e vai
  até 4.000 caracteres pelo Felixo (o Openia aceita 20.000). No Windows, um atalho `.cmd` passa por cmd.exe:
  quebras de linha do prompt viram espaço.
- **`--output-dir`**: pasta **privada do pedido**, criada pelo Felixo (modo 0700). O Openia grava os
  arquivos finais nela (escrita atômica com temporário `.nome.*.tmp`); em falha ou cancelamento ele remove só
  o que criou. O Felixo apaga a pasta de qualquer forma.
- **`--request-id`** (= `--idempotency-key`): segue `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`. O Felixo usa
  `^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$` (nunca começa com `-` nem `_`).
- **`--cancel-file`**: arquivo cuja existência cancela a operação (cooperativo). Fica FORA da pasta de saída
  (`userData/openia-image-runs/<id>.cancel`).
- **`--timeout` / `--retries`**: 100 s por chamada e 1 tentativa extra; o teto do Felixo é 240 s.
- Sem `--count`, `--format` etc.: padrões do Openia (1 imagem). Sem stdin e sem stderr (descartado).

### stdout: um envelope JSON versionado (`version: 1`)

- Sucesso: `{ "version": 1, "ok": true, "requestId", "model", "outputs": [ { "path": "<absoluto>", "mime", "bytes" } ], "createdAt", "completedAt" }`.
  **Não há custo** no envelope (o Openia não o inventa) e o Felixo também não.
- Falha: `{ "version": 1, "ok": false, "error": { "code", "message" }, "requestId"? }`.
  **Texto livre de erro é ignorado**: só o código de saída e uma lista fechada de `error.code` são usados.

| Código de saída | Classe do Openia | Código público do Felixo |
|---|---|---|
| 2 | invalid_request | `invalid_request` |
| 3 | authentication_error (`missing_key`, `invalid_key`) | `authentication_error` |
| 4 | model_error (`model_not_found`, `model_unsupported`…) | `model_unavailable` |
| 5 | limit_error (`rate_limit`, `account_limit`…) | `limit_error` |
| 6 | network_error | `network_error` |
| 124 | timeout | `timeout` |
| 130 | cancelled | `cancelled` |
| 1, 7, 8, outros | provider/output/genérico | `generation_failed` (ou `invalid_output` para `output_too_large`, `unsafe_output`, `mime_mismatch`, `format_mismatch`, `unsupported_mime`) |

Cancelamento pelo Felixo: cria o `--cancel-file`; se o Openia não sair em 2,5 s, `SIGTERM` ao grupo de
processos (Windows: `taskkill /T /F`) e, depois de 2 s, `SIGKILL`.

## 3. O que o Felixo garante do seu lado

- O renderer só envia `{ prompt, model, requestId }`; qualquer outra chave (pasta, caminho) é recusada.
- Só lê os `outputs` cujo **caminho absoluto está diretamente na pasta do pedido** (a pasta do caminho,
  resolvida, é a pasta do pedido, resolvida), se forem arquivo regular (nunca link), no limite de 25 MB e com
  bytes de imagem raster (PNG, JPEG, WebP, GIF, BMP, AVIF; **SVG e HTML recusados**). O `mime` do envelope é
  ignorado: o tipo vem dos bytes. Qualquer falha invalida o resultado inteiro.
- Grava pelo caminho seguro das imagens geradas (`saveGeneratedImage`, escrita atômica em
  `userData/generated-images`) e só **depois** avisa o canvas (`canvas:image-generated`).
- No máximo 2 gerações ao mesmo tempo; estados `pending` → `success` | `error` | `cancelled`.
- Mensagens ao renderer são fixas por código (`MESSAGES` no serviço): nunca stderr, chave, mensagem do
  filho ou traceback.
