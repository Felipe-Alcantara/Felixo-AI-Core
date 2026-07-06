# 🚂 GUIA-DEPLOY-RAILWAY — PLATAFORMA PADRAO PARA BACKEND ONLINE

> **O que e**: Um guia reutilizavel para colocar **qualquer backend** no ar usando o [Railway](https://railway.com) — uma PaaS (Platform as a Service) que faz build, deploy, banco de dados, variaveis de ambiente, dominio HTTPS e logs sem voce gerenciar servidor.
>
> **De onde vem**: Padrao operacional adotado como **servico padrao de deploy de backend** dentro do `Felixo System Design`. Verificado com o Railway CLI `v4.36.1`.
>
> **Qual e o proposito dentro de `guias/`**: Padronizar como subir back-ends (Django, FastAPI, Node, .NET, etc.) para producao com o minimo de configuracao, evitando reaprender deploy a cada projeto.
>
> **Quando usar**: APIs REST, back-ends de apps, jobs/cron, bots, scrapers agendados, bancos Postgres/MySQL/Redis/Mongo e qualquer servico que precise ficar **online** com URL publica e HTTPS.

---

## Por que Railway e o padrao para backend

Railway e **mais do que suficiente para a maioria das aplicacoes**. Ele entrega, sem configuracao de infraestrutura:

| Recurso | O que resolve |
|---|---|
| **Build automatico** | Detecta a stack (Nixpacks) ou usa seu `Dockerfile`. Sem escrever pipeline. |
| **Deploy por Git ou CLI** | `git push` no repo conectado **ou** `railway up` da pasta atual. |
| **Bancos gerenciados** | Postgres, MySQL, Redis e Mongo provisionados em 1 comando. |
| **Variaveis de ambiente** | Gestao por servico/ambiente, com referencia entre servicos. |
| **Dominio + HTTPS** | Dominio `*.up.railway.app` gratis ou dominio customizado com TLS automatico. |
| **Logs e metricas** | Stream de build/deploy/HTTP direto no CLI. |
| **Ambientes** | `production`, `staging`, PR environments isolados. |

**Quando NAO usar:** workloads que exigem GPU dedicada pesada, compliance on-premise obrigatorio, ou escala que justifique infra dedicada (Kubernetes proprio). Para o resto — comece no Railway.

---

## Conceitos centrais

Entenda a hierarquia antes de rodar qualquer comando:

```
Workspace
└── Project          (uma aplicacao / produto)
    └── Environment  (production, staging, ...)
        └── Service  (o backend, o banco, o worker, ...)
            └── Deployment (uma versao publicada)
```

- **Project**: agrupa tudo de uma aplicacao.
- **Environment**: copias isoladas do mesmo project (prod vs staging).
- **Service**: cada processo separado — sua API e um service, o Postgres e outro.
- **Deployment**: cada build publicado de um service.

O CLI trabalha sempre sobre um project/environment/service **linkados** ao diretorio atual.

---

## 1. Instalacao e login

```bash
# Instalar (qualquer um dos dois)
npm i -g @railway/cli
# ou: brew install railway   |   curl -fsSL https://railway.com/install.sh | sh

railway --version          # confirmar instalacao
railway login              # abre o navegador para autenticar
railway whoami             # confirma o usuario logado
```

### ⚠️ AVISO IMPORTANTE: login e autorizacao do Railway falham com frequencia

O Railway foi lancado cedo para sair na frente com quem **delega a configuracao para a IA** ("vibe coding"), mas **varias funcoes de login e autorizacao nao parecem bem validadas**. Na pratica, o agente costuma enfrentar **erros repetidos de login, token e autorizacao** — e, em muitos casos, **o agente simplesmente nao consegue conectar mesmo com o usuario fazendo login manualmente**.

> **Regra para o agente/IA:** se voce estiver tendo **erros repetidos de login/autorizacao** ou **dificuldade de se conectar ao Railway** (`railway login`, `railway whoami`, `railway link`, `railway up` falhando por auth), **nao insista em loop**. Pare e **envie ao usuario o passo a passo** de como fazer manualmente — no **terminal** ou pela **interface web** — porque muitas vezes a conexao so funciona com o usuario operando diretamente.

**Sinais de que e hora de escalar para o usuario:**

- `railway login` abre o navegador mas o CLI nao confirma a sessao (`Unauthorized` / `Not logged in`).
- `railway whoami` continua dizendo que nao ha usuario logado apos um login aparentemente bem-sucedido.
- Erros `401`/`403`, token invalido/expirado, ou `railway link`/`railway up` recusando por autorizacao.
- O mesmo comando de auth falha **2 ou mais vezes** sem mudanca util de mensagem.

**Passo a passo para enviar ao usuario quando a conexao falhar:**

*Opcao A — Terminal (login interativo no navegador):*

```bash
railway logout            # limpa qualquer sessao quebrada
railway login             # abra o link no SEU navegador e autorize manualmente
railway whoami            # confirme que aparece o seu usuario
```

*Opcao B — Terminal (login por token, quando o navegador nao fecha o ciclo):*

1. Acesse o dashboard: https://railway.com/account/tokens
2. Crie um **Account Token** (ou **Project Token** para um project especifico).
3. Exporte o token e rode os comandos:

```bash
# Linux/macOS
export RAILWAY_TOKEN="seu_token_aqui"
railway whoami            # ou: railway status / railway up
```

```powershell
# Windows (PowerShell)
$env:RAILWAY_TOKEN="seu_token_aqui"
railway whoami
```

*Opcao C — Interface web (quando o CLI nao coopera de jeito nenhum):*

1. Entre em https://railway.com e faca login pela conta normalmente.
2. **New Project → Deploy from GitHub repo** e selecione o repositorio.
3. Configure variaveis em **Variables**, gere o dominio em **Settings → Networking → Generate Domain**.
4. O deploy on push passa a funcionar pela interface, sem depender do CLI travado.

> Em resumo: **o agente nao deve ficar preso tentando autenticar.** Apos falhas repetidas, a acao correta e **devolver o controle ao usuario com instrucoes claras** (terminal ou interface) em vez de gastar tentativas que provavelmente nao vao conectar.

---

## 2. Fluxo padrao: subir um backend do zero

Dentro da pasta do seu backend:

```bash
railway init                       # cria o project (pergunta o nome)
railway add --service api          # cria o service "api"
railway up                         # faz build + deploy da pasta atual
railway domain                     # gera URL publica HTTPS (*.up.railway.app)
```

Pronto: o backend esta online. `railway up` empacota a pasta atual (respeitando o `.gitignore`), envia, builda e faz deploy.

> **Dica:** `railway up --ci` transmite so o log de build e sai (ideal para pipeline). `railway up -d` faz deploy sem prender o terminal no stream de logs.

---

## 3. Conectar um repositorio Git (deploy continuo)

Para deploy automatico a cada `git push` (recomendado para producao):

```bash
railway add --service api --repo Felipe-Alcantara/meu-backend
```

A partir daí cada push no branch configurado dispara build + deploy automaticamente. Use `railway up` apenas para deploys manuais/locais pontuais.

### ⚠️ Regra obrigatoria: deploy on push e nativo — nao reinvente

O Railway ja oferece **deploy automatico a cada push (deploy on push) por padrao**. Por isso:

- **Nao crie GitHub Actions / pipelines so para deployar no Railway.** Se o Railway ja faz o build e o deploy no push, um workflow de CI/CD para isso e redundante e so adiciona ponto de falha.
- **Prefira sempre o recurso nativo do Railway.** Antes de escrever qualquer automacao (Actions, webhooks, scripts de deploy), verifique se o Railway ja entrega aquilo de fabrica — deploy, rollback, PR environments, redeploy, restart, agendamento.
- **GitHub Actions so para o que o Railway NAO faz.** Reserve Actions para testes, lint, type-check e validacoes **antes** do merge — nao para o deploy em si.

> Regra de ouro: **se o Railway ja faz nativo, use o nativo.** Automacao externa so entra quando preenche uma lacuna real que a plataforma nao cobre.

---

## 4. Banco de dados gerenciado

Provisione e conecte sem instalar nada localmente:

```bash
railway add --database postgres     # ou: mysql | redis | mongo
railway connect                     # abre o shell do banco (psql, mongosh, ...)
```

Railway injeta as variaveis de conexao (`DATABASE_URL`, etc.) automaticamente. Referencie-as no seu service em vez de hardcodar credenciais.

---

## 5. Variaveis de ambiente

Nunca comite segredos no repo — coloque no Railway:

```bash
railway variable set "SECRET_KEY=valor"          # define uma variavel
railway variable set "DEBUG=False" --skip-deploys # sem redeploy imediato
railway variable list                            # lista as variaveis do service
railway variable list --kv                       # formato KEY=VALUE
railway variable delete SECRET_KEY               # remove uma variavel
```

No codigo, leia sempre do ambiente (`os.environ` / `process.env`). Esse e o contrato: **config fora do codigo**.

### ⚠️ Regra obrigatoria: Railway como fonte global de variaveis e cofre de segredos

Esta e a parte que **nao pode ser esquecida**:

- **Sempre mantenha as variaveis de ambiente atualizadas no Railway.** Toda nova chave, token, URL de banco ou flag de config entra **primeiro** no Railway via `railway variable set`. Variavel nova no codigo = variavel definida no Railway no mesmo momento.
- **Use o Railway como referencia global.** O Railway e a **fonte unica da verdade** das variaveis. Aplicacao, scripts e comandos locais leem do Railway (`railway run` / `railway shell`), nao de arquivos paralelos.
- **Evite chaves locais.** Nao espalhe `.env` divergente por maquina nem hardcode valores no codigo. Se precisar rodar local, puxe do Railway com `railway run <cmd>` em vez de manter copias locais que envelhecem.
- **Guarde informacoes importantes e sigilosas no Railway.** Segredos (API keys, tokens, senhas, credenciais de banco, chaves de assinatura) ficam **somente** no Railway — nunca comitados no repo, nunca em texto plano no projeto.

> Regra de ouro: **se e segredo ou config, o lugar dele e o Railway.** O codigo so referencia; nunca armazena.

---

## 6. Rodar e desenvolver com as variaveis do Railway localmente

```bash
railway run <comando>     # roda o comando local com as vars do environment ativo
railway run python manage.py migrate
railway shell             # abre um subshell com as variaveis carregadas
```

Isso elimina o `.env` divergente entre maquinas: a fonte da verdade e o Railway.

---

## 7. Operacao do dia a dia

```bash
railway status            # project/environment/service linkados + estado
railway logs              # stream de logs (use --build, --deployment, --since)
railway open              # abre o dashboard do project no navegador
railway redeploy          # republica o ultimo deploy
railway restart           # reinicia sem rebuildar
railway down              # remove o deploy mais recente
railway link              # associa um project existente ao diretorio atual
railway environment       # cria/troca de ambiente (prod, staging, ...)
```

---

## 8. Build: Nixpacks vs Dockerfile

- **Sem Dockerfile**: o Railway usa **Nixpacks**, que detecta a stack (Python, Node, .NET, Go...) e builda sozinho. Funciona para a maioria dos projetos.
- **Com Dockerfile na raiz**: o Railway usa o seu `Dockerfile`. Escolha isso quando precisar de controle fino do ambiente de build/runtime.

Garanta que o servico **escute na porta da variavel `PORT`** que o Railway injeta:

```python
# exemplo Python/uvicorn
port = int(os.environ.get("PORT", 8000))
```

```json
// railway.json opcional, na raiz, para fixar comandos
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": { "startCommand": "uvicorn app.main:app --host 0.0.0.0 --port $PORT" }
}
```

---

## 9. Checklist de deploy de backend no Railway

- [ ] App le config de **variaveis de ambiente**, nunca de segredos comitados.
- [ ] **Todas** as variaveis estao atualizadas no Railway (fonte global da verdade), sem chaves locais divergentes.
- [ ] Informacoes sigilosas (tokens, senhas, API keys, credenciais) guardadas **somente** no Railway.
- [ ] App escuta na porta **`$PORT`** injetada pelo Railway.
- [ ] `Dockerfile` na raiz **ou** stack detectavel por Nixpacks.
- [ ] Banco provisionado via `railway add --database` (sem credenciais no codigo).
- [ ] Healthcheck/rota raiz respondendo para o Railway considerar o deploy saudavel.
- [ ] Dominio gerado (`railway domain`) e testado via HTTPS.
- [ ] Producao com **deploy por repo Git**; `railway up` so para casos manuais.
- [ ] Usando o **deploy on push nativo** do Railway; sem GitHub Actions redundante so para deployar (Actions reservado a testes/lint/validacao pre-merge).
- [ ] `production` e `staging` como ambientes separados quando houver risco.
- [ ] Em caso de **erro repetido de login/autorizacao**, o agente **parou e enviou ao usuario** o passo a passo manual (terminal ou interface) em vez de insistir.

---

## Referencia rapida de comandos

| Objetivo | Comando |
|---|---|
| Login | `railway login` |
| Criar project | `railway init` |
| Criar service | `railway add --service <nome>` |
| Criar banco | `railway add --database postgres` |
| Deploy da pasta atual | `railway up` |
| Gerar URL publica | `railway domain` |
| Set variavel | `railway variable set "K=V"` |
| Listar variaveis | `railway variable list` |
| Rodar local com vars | `railway run <cmd>` |
| Ver status | `railway status` |
| Ver logs | `railway logs` |
| Abrir dashboard | `railway open` |
| Docs oficiais | `railway docs` |

---

> **Assinatura de Origem**  
> Este arquivo faz parte do repositorio **Felixo System Design**.  
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design  
> Data desta versao: 2026-06-04
