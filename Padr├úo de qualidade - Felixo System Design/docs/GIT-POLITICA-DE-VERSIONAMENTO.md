# Git — Branches, Commits e Documentacao Viva

> **O que e**: A politica unica de git deste repositorio. Define como agentes (e pessoas) devem versionar mudancas: quando criar branch, como commitar e como manter a documentacao viva.
>
> **Quando usar**: Sempre que for **alterar este repositorio diretamente** (sem fork). Para contribuicoes externas via fork + Pull Request, veja [`CONTRIBUTING.md`](../CONTRIBUTING.md).
>
> **Por que existe**: Estas regras viviam apenas numa secao do README e os agentes nao as absorviam de forma consistente. Este documento e a fonte unica — o README e o [Guia Minimo de Qualidade](../core/GUIA_MINIMO_QUALIDADE.md) apenas resumem e apontam para ca.

> Voltar ao [README](../README.md).

---

## 1. Resumo em uma frase

**Commite direto no `main`, em commits pequenos e descritivos, atualizando a documentacao no mesmo passo. So crie branch quando a mudanca for grande, arriscada ou precisar ser testada antes de entrar.**

---

## 2. Branches — o padrao e *nao* criar branch

A regra mais importante deste repositorio, e a que os agentes mais erram: **trabalhe direto no `main` por padrao.**

Muitos agentes tem o vicio de abrir uma branch nova para cada implementacao. **Aqui isso e considerado errado.** Branch nao e gratis: cada branch sem necessidade gera overhead de merge, fragmenta o historico e exige revisao que a mudanca nao pedia.

### Quando commitar direto no `main` (a maioria dos casos)

Commite direto, sem branch, quando a mudanca for:

- correcao simples de bug ou de texto;
- alteracao ou criacao de documentacao;
- ajuste pequeno e localizado;
- refatoracao segura (que **nao** altera comportamento observavel).

### Quando criar uma branch nova (excecao)

Crie branch **somente** quando a mudanca for uma das tres:

1. **Feature grande** — funcionalidade nova e substancial, com varios commits ate ficar utilizavel.
2. **Refatoracao significativa** — mexe em muitos arquivos ou na estrutura, e voce quer poder revisar/reverter como um bloco.
3. **Alto risco** — altera comportamento e **precisa ser testado antes** de entrar no `main`, ou pode quebrar algo existente.

> Regra pratica: se voce nao consegue dizer **qual** das tres justifica a branch, entao **nao** crie branch — commite no `main`.

### Nomes de branch (quando criar uma)

Use prefixo + descricao curta em kebab-case:

- `feat/` — nova funcionalidade. Ex.: `feat/instalador-powershell`
- `fix/` — correcao. Ex.: `fix/link-quebrado-instalacao`
- `refactor/` — refatoracao. Ex.: `refactor/separa-docs-por-responsabilidade`
- `docs/` — documentacao (quando, excepcionalmente, virar uma branch). Ex.: `docs/guia-git`

### Apos o merge: apague a branch

Branch tem vida curta: existe so para abrigar a mudanca ate ela entrar no `main`. **Assim que a branch for mesclada, apague-a** — local e remota. Branch ja mesclada que fica para tras polui a lista, confunde quem nao sabe se ainda esta em uso e mascara o que de fato esta em andamento.

```bash
git branch -d <branch>                 # apaga local (so se ja foi mesclada)
git push origin --delete <branch>      # apaga a remota
git fetch --prune                      # limpa referencias remotas que ja sumiram
```

Regra pratica: **uma branch viva = trabalho em andamento.** Se o trabalho ja entrou no `main`, a branch nao deveria mais existir.

---

## 3. Commits — pequenos, frequentes e descritivos

### Frequencia

- **Sempre commite apos uma adicao concluida.** Nao acumule varias mudancas soltas sem commitar.
- Cada commit deve ser uma unidade coesa: uma ideia, um motivo. Se voce precisa usar "e" varias vezes para descrever o commit, provavelmente sao dois commits.

### Mensagem

Mensagens seguem o formato **Conventional Commits**: `tipo: descricao no imperativo`.

Tipos usados neste repositorio:

| Tipo | Quando usar |
|------|-------------|
| `feat:` | Nova funcionalidade ou conteudo novo (guia, script, comando). |
| `fix:` | Correcao de bug, link quebrado, erro de conteudo. |
| `docs:` | Mudanca apenas em documentacao. |
| `refactor:` | Reorganizacao sem mudar comportamento observavel. |
| `chore:` | Manutencao (configuracao, dependencias, ajustes de repo). |

A descricao deve explicar **o que mudou e por que**, em linguagem geral e acessivel (o repositorio e open source — veja [`DESIGN_SYSTEM_README.md`](../core/DESIGN_SYSTEM_README.md), secao 3.5). Sem valores hardcoded, caminhos locais ou contexto privado na mensagem.

### Exemplos

| Evite | Prefira |
|-------|---------|
| `update` | `docs: corrige link quebrado em INSTALACAO` |
| `mudancas no readme` | `docs: separa README por responsabilidade em docs/` |
| `fix bug` | `fix: trata caminho com espacos no instalador cmd` |
| `feat: novo guia + ajustes no readme + fix de link` (3 coisas) | tres commits separados, um por mudanca |
| `wip` | (nao commite "wip" no `main`; termine a unidade ou use branch) |

---

## 4. Documentacao viva — parte do mesmo commit

Documentacao desatualizada conta como **trabalho incompleto**. Ao mudar comportamento, estrutura ou comandos, atualize **no mesmo commit** (ou na mesma sequencia coesa) os documentos afetados:

- [`README.md`](../README.md) — uso, setup e mapa do repositorio.
- documentos em [`docs/`](.) — cada um com **uma responsabilidade unica**.
- guias em [`guias/`](../guias/) afetados.
- o `IA.md` do projeto (contexto operacional, decisoes, proximos passos).

Se um tema de documentacao nao couber naturalmente nos arquivos existentes de `docs/`, crie um novo arquivo ali com responsabilidade unica — foi exatamente o caso deste documento de politica de git.

---

## 5. Checklist antes de commitar

- [ ] A mudanca vai para o `main`? (Se for criar branch, ela e feature grande, refatoracao significativa ou alto risco?)
- [ ] O commit e uma unidade coesa, com escopo claro?
- [ ] A mensagem segue `tipo: descricao` e explica **o que** e **por que**?
- [ ] Nao ha segredo, token, caminho local ou contexto privado na mensagem nem nos arquivos.
- [ ] A documentacao afetada (README, `docs/`, guias, `IA.md`) foi atualizada no mesmo passo.
- [ ] Se uma branch foi mesclada, ela foi apagada (local e remota) — nenhuma branch ja mesclada ficou para tras.

---

## 6. Contribuicao externa (via fork)

Tudo acima vale para quem trabalha **direto neste repositorio**. Quem contribui **de fora** segue o fluxo de fork + branch + Pull Request descrito em [`CONTRIBUTING.md`](../CONTRIBUTING.md), onde criar branch e parte natural do processo.
