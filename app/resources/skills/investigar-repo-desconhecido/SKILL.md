---
name: investigar-repo-desconhecido
description: Entender rápido um repositório que você nunca viu, antes de opinar ou alterar qualquer coisa — estrutura real, convenções locais, gate de qualidade e onde mora o risco. Use ao abrir um projeto novo, ao auditar código de terceiro, ou antes de qualquer mudança em base desconhecida.
---

# Entrar em um repositório desconhecido

Alterar código que você não entendeu é a forma mais rápida de quebrar algo que
funcionava. Esta skill é a leitura mínima antes da primeira linha alterada.

## Etapa 1 — Os arquivos que falam sobre o repositório

Nesta ordem, porque cada um responde uma pergunta diferente:

| Arquivo | Responde |
| --- | --- |
| `AGENTS.md` / `CLAUDE.md` | Como **este** repositório quer ser trabalhado. Vale mais que sua preferência. |
| `IA.md` | Decisões já tomadas, com motivo, e o estado atual. |
| `README` | O que é, para quem, como roda. |
| `package.json` / `pyproject.toml` / equivalente | Stack real, scripts, gate. |
| `.env.example` | Que integrações existem de verdade. |
| CI (`.github/workflows`) | O que precisa passar para o código ser aceito. |

Se houver `AGENTS.md`, **as regras dele vencem** qualquer padrão genérico.

## Etapa 2 — Rode o gate antes de mexer

```bash
# o que o projeto define: lint + testes + build
```

Fazer isso **antes** de qualquer alteração é o que separa "eu quebrei" de "já
estava quebrado". Anote o resultado.

## Etapa 3 — Leia a forma, não só o conteúdo

- **Estrutura de pastas**: dá para nomear a responsabilidade de cada uma? Se
  não, a arquitetura é implícita — trate com cuidado.
- **Os maiores arquivos**: `wc -l` nos maiores revela onde a complexidade se
  acumulou e onde estão os monólitos.
- **Camadas**: existe fronteira entre regra de negócio, acesso a dados,
  integração externa e interface? Onde ela vaza?
- **Idioma e convenções**: nomes, comentários, mensagens de erro, estilo de
  commit. Escreva como o repositório escreve.
- **Testes**: quantos, e cobrem regra de negócio ou só caminho feliz?

## Etapa 4 — Leia o histórico

```bash
git log --oneline -30
git log --format='%an' | sort | uniq -c | sort -rn   # quem construiu o quê
```

- Ritmo recente: ativo, parado, abandonado?
- Mensagens de commit: elas explicam **por quê**? Se sim, é uma fonte rica.
- Arquivos que mudam sempre juntos indicam acoplamento não declarado.

## Etapa 5 — Ache o risco antes que ele ache você

- Segredo versionado, `.env` commitado.
- `TODO`/`FIXME`/`HACK` concentrados numa área.
- Erro silenciado (`catch` vazio, `.catch(() => {})`).
- Migrações duplicadas ou fora de ordem.
- Dependência desatualizada em ponto sensível (auth, criptografia, parsing).

## Etapa 6 — Escreva o que você entendeu

Antes de propor mudança, devolva:

```
O que este projeto é: <uma frase>
Stack real: <...>
Gate: <comandos> — estado hoje: <passa/não passa>
Convenções que vou seguir: <...>
Onde está o risco: <...>
O que não entendi: <...>
```

Se o repositório não tiver `IA.md`, **essa é a primeira contribuição a propor**.

## Regra de ouro

Não introduza stack, biblioteca, padrão ou convenção nova quando o repositório
já define uma — a menos que tenha justificativa técnica explícita e a declare.
Consistência com o que existe vale mais que sua preferência pessoal.
