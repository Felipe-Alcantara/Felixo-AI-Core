# 🐙 GUIA-INTEGRACAO-REUTILIZAVEL-COM-API-DO-GITHUB-PARA-COLETA-DE-REPOSITORIOS-PUBLICOS-E-PRIVADOS.md

> **O que é**: Um guia reutilizável para construir uma camada de integração com a API do GitHub capaz de coletar repositórios **públicos e privados** com paginação, deduplicação, retry e tratamento de rate limit.
>
> **De onde vem**: Este padrão foi extraído do fluxo de importação do projeto **Git-Hub-Repositories**, principalmente de `src/utils/github.js`, `src/components/ImportProfileModal.jsx` e `src/components/GitHubTokenModal.jsx`.
>
> **Qual é o propósito dentro de `Utils/`**: Preservar esse subsistema como bloco reaproveitável no `Felixo System Design`, para uso em dashboards, ETLs, sincronizadores e qualquer produto que precise buscar dados de repositórios no GitHub.
>
> **Quando usar**: Importação de portfólio, catálogos de projetos, inventário de repositórios, backup de metadados, painéis analíticos, automações de curadoria e sincronização contínua.

Este documento não tenta explicar o produto original inteiro. O foco é isolar o padrão técnico que resolve a coleta confiável de repositórios no GitHub e deixá-lo pronto para reaproveitamento.

---

## Visão geral

O padrão é composto por **6 camadas**:

| Camada | Onde | Responsabilidade |
|---|---|---|
| **Token e autenticação** | `localStorage` + headers HTTP | Armazenar token, montar `Authorization` quando existir |
| **Cliente resiliente** | Helper de fetch | Retry com backoff para falhas temporárias (5xx/rede) |
| **Descoberta de repositórios** | Endpoints `/users/*` e `/user/*` | Listar públicos sempre + privados quando elegível |
| **Enriquecimento do repositório** | Endpoints de linguagens/README/contents | Trazer dados além da listagem básica |
| **Orquestração de importação** | Camada de uso (UI/serviço) | Buscar múltiplos usuários, comparar updates, importar em lote |
| **Tratamento operacional** | Mensagens + rate-limit info | Expor erros úteis e próximos passos para quem usa o módulo |

---

## 1. Regra central para públicos e privados

Para obter comportamento seguro e previsível:

1. Sempre buscar repositórios públicos pelo endpoint do usuário alvo:
   - `GET /users/{username}/repos`
2. Se existir token, descobrir o login autenticado:
   - `GET /user`
3. Só buscar privados pelo endpoint autenticado quando o alvo for o mesmo usuário autenticado:
   - `authenticatedLogin.toLowerCase() === username.toLowerCase()`
   - `GET /user/repos?visibility=all&affiliation=owner`

Isso evita misturar contexto e garante que privados sejam lidos apenas do próprio dono autenticado.

---

## 2. Contrato de dados reutilizável

Padronize a saída em um objeto único por repositório:

```js
{
  name: repo.name,
  description: repo.description || '',
  language: repo.language,
  repoUrl: repo.html_url,
  homepage: repo.homepage || '',
  topics: repo.topics || [],
  stars: repo.stargazers_count,
  forks: repo.forks_count,
  createdAt: repo.created_at,
  updatedAt: repo.updated_at,
  defaultBranch: repo.default_branch,
  private: Boolean(repo.private),
}
```

Esse contrato facilita reaproveitamento em UI, banco, exportação JSON, ETL e analytics.

---

## 3. Base de autenticação e headers

```js
const GITHUB_TOKEN_KEY = 'github_api_token';

export function getGitHubToken() {
  return localStorage.getItem(GITHUB_TOKEN_KEY);
}

export function setGitHubToken(token) {
  if (token) localStorage.setItem(GITHUB_TOKEN_KEY, token);
  else localStorage.removeItem(GITHUB_TOKEN_KEY);
}

function getGitHubHeaders() {
  const headers = { Accept: 'application/vnd.github.v3+json' };
  const token = getGitHubToken();
  if (token) headers.Authorization = `token ${token}`;
  return headers;
}
```

**Escopos recomendados de token:**
- `public_repo`: apenas públicos
- `repo`: públicos + privados do usuário autenticado

---

## 4. Resiliência: retry + backoff + rate limit

### Retry para falhas temporárias

```js
async function retryableFetch(url, options = {}, attempts = 3, delayMs = 500) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok && res.status >= 500 && res.status < 600) {
        lastErr = new Error(`Server error: ${res.status}`);
        await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, i)));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, i)));
    }
  }
  throw lastErr;
}
```

### Leitura dos headers de rate limit

```js
function getRateLimitInfo(response) {
  const remaining = response.headers.get('x-ratelimit-remaining');
  const limit = response.headers.get('x-ratelimit-limit');
  const reset = response.headers.get('x-ratelimit-reset');
  return {
    remaining: remaining !== null ? parseInt(remaining, 10) : null,
    limit: limit !== null ? parseInt(limit, 10) : null,
    reset: reset !== null ? parseInt(reset, 10) : null,
  };
}
```

Com isso, sua camada de aplicação pode mostrar mensagens úteis como:
- token inválido (401)
- limite atingido (403)
- usuário não encontrado (404)

---

## 5. Motor de coleta: públicos + privados com deduplicação

```js
function mapGitHubRepo(repo) {
  return {
    name: repo.name,
    description: repo.description || '',
    language: repo.language,
    repoUrl: repo.html_url,
    homepage: repo.homepage || '',
    topics: repo.topics || [],
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    createdAt: repo.created_at,
    updatedAt: repo.updated_at,
    defaultBranch: repo.default_branch,
    private: Boolean(repo.private),
  };
}

async function fetchAuthenticatedUserLogin() {
  const token = getGitHubToken();
  if (!token) return null;

  const response = await retryableFetch('https://api.github.com/user', {
    headers: getGitHubHeaders(),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Token inválido ou expirado.');
    }
    return null;
  }

  const data = await response.json();
  return data?.login || null;
}

export async function fetchUserRepositories(username) {
  const reposByUrl = new Map();

  // 1) Públicos do usuário alvo
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const response = await retryableFetch(
      `https://api.github.com/users/${username}/repos?per_page=100&page=${page}&sort=updated`,
      { headers: getGitHubHeaders() }
    );

    if (!response.ok) {
      const rl = getRateLimitInfo(response);
      const err = new Error(`Erro ${response.status} ao buscar repositórios públicos.`);
      err.rateLimitInfo = rl;
      throw err;
    }

    const data = await response.json();
    if (data.length === 0) {
      hasMore = false;
    } else {
      data.forEach((repo) => reposByUrl.set(repo.html_url, repo));
      page++;
    }

    if (reposByUrl.size >= 500) hasMore = false; // trava de segurança operacional
  }

  // 2) Privados (somente se username buscado == login autenticado)
  const token = getGitHubToken();
  if (token) {
    const authenticatedLogin = await fetchAuthenticatedUserLogin();
    if (authenticatedLogin && authenticatedLogin.toLowerCase() === username.toLowerCase()) {
      page = 1;
      hasMore = true;

      while (hasMore) {
        const response = await retryableFetch(
          `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&visibility=all&affiliation=owner`,
          { headers: getGitHubHeaders() }
        );

        if (!response.ok) {
          const rl = getRateLimitInfo(response);
          const err = new Error(`Erro ${response.status} ao buscar privados.`);
          err.rateLimitInfo = rl;
          throw err;
        }

        const data = await response.json();
        const ownerRepos = data.filter(
          (repo) => (repo.owner?.login || '').toLowerCase() === username.toLowerCase()
        );
        ownerRepos.forEach((repo) => reposByUrl.set(repo.html_url, repo));

        if (data.length === 0 || reposByUrl.size >= 500) hasMore = false;
        else page++;
      }
    }
  }

  return Array.from(reposByUrl.values())
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .map(mapGitHubRepo);
}
```

**Por que esse desenho funciona bem:**
- `Map` com chave `html_url` elimina duplicatas entre rotas públicas e autenticadas.
- Paginação em lotes de 100 reduz chamadas.
- Filtro por owner na rota autenticada evita incluir repositórios de terceiros.
- Ordenação final por `updated_at` atende cenários de sincronização incremental.

---

## 6. Enriquecimento do repositório (opcional, mas recomendado)

Além da listagem, o padrão inclui blocos para enriquecer cada projeto:

### Linguagens

`GET /repos/{owner}/{repo}/languages`

Uso comum:
- converter objeto `{ linguagem: bytes }` em lista ordenada por volume
- exibir barras de proporção em dashboards

### README

`GET /repos/{owner}/{repo}/readme` com:

```http
Accept: application/vnd.github.v3.raw
```

Uso comum:
- importar documentação original para bases internas
- gerar resumo automático por IA

### Conteúdo de arquivo específico

`GET /repos/{owner}/{repo}/contents/{path}?ref={branch}`

Uso comum:
- ler `package.json`, `requirements.txt`, `Dockerfile`, etc.
- inferir stack automaticamente

### GitHub Pages

Tentativas:
- `https://{owner}.github.io/{repo}/`
- `https://{owner}.github.io/`

Uso comum:
- preencher link de demo/site automaticamente

---

## 7. Parse de URL e busca individual

Aceite múltiplos formatos de entrada:

- `https://github.com/owner/repo`
- `github.com/owner/repo`
- `owner/repo`

```js
export function parseGitHubUrl(url) {
  const patterns = [
    /github\.com\/([^\/]+)\/([^\/\?#]+)/i,
    /^([^\/]+)\/([^\/\?#]+)$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, ''),
      };
    }
  }
  return null;
}
```

Isso facilita formulários flexíveis para importação por URL ou atalho.

---

## 8. Padrão de orquestração para múltiplos perfis

O fluxo extraído do projeto original funciona bem para importação em lote:

1. Aceitar múltiplas linhas (um username/URL por linha).
2. Normalizar entrada para username.
3. Buscar cada perfil de forma independente.
4. Acumular erros sem abortar o lote completo.
5. Unificar todos os repositórios em uma lista única.
6. Comparar `updatedAt` com dados já existentes para detectar atualização real.
7. Pré-selecionar novos/atualizados por padrão.

Esse padrão evita bloquear o usuário por falha pontual de um perfil e melhora UX de sincronização.

---

## 9. Segurança, privacidade e governança

- Armazene token apenas localmente quando for app client-side.
- Nunca envie token para logs ou analytics.
- Exiba indicação de escopo exigido (`public_repo` vs `repo`).
- Trate `401` como token inválido e peça reconfiguração.
- Trate `403` com mensagem de rate limit e fallback operacional (aguardar ou usar token).

---

## 10. Como reutilizar em outros projetos

### Cenário A: Dashboard frontend puro

1. Copiar módulo de integração (`githubClient.js`).
2. Salvar token em storage local.
3. Chamar `fetchUserRepositories(username)`.
4. Enriquecer sob demanda (`languages`, `readme`) para não sobrecarregar API.

### Cenário B: Backend/API intermediária

1. Mover lógica para serviço server-side.
2. Trocar `localStorage` por secret manager/env var.
3. Expor endpoint interno com contrato normalizado.
4. Adicionar cache por usuário para reduzir rate limit.

### Cenário C: ETL de inventário técnico

1. Rodar coleta paginada por usuário.
2. Persistir snapshot diário (`updatedAt`, `language`, `private`, etc.).
3. Calcular diferenças entre snapshots para detectar mudanças.

---

## 11. Checklist de qualidade para implementação

1. Contrato de saída único e estável.
2. Paginação até página vazia.
3. Deduplicação por URL.
4. Regra explícita para privados.
5. Retry com backoff para 5xx/rede.
6. Tratamento de 401/403/404.
7. Exposição de metadados de rate limit.
8. Enriquecimento opcional desacoplado.
9. Mensagens de erro acionáveis.
10. Token protegido (sem vazamento em logs).

---

## 12. Referência de arquivos de origem

| Arquivo | O que foi extraído |
|---|---|
| `Git-Hub-Repositories/src/utils/github.js` | Motor principal de integração com GitHub API |
| `Git-Hub-Repositories/src/components/ImportProfileModal.jsx` | Orquestração de importação em lote e detecção de atualização |
| `Git-Hub-Repositories/src/components/GitHubTokenModal.jsx` | Estratégia de configuração de token e orientação de escopos |

---

## Resumo da receita

1. Salvar token e montar headers dinâmicos.
2. Coletar públicos via `/users/{username}/repos`.
3. Descobrir login autenticado via `/user`.
4. Se for o mesmo usuário, coletar privados via `/user/repos`.
5. Deduplicar por `html_url`.
6. Ordenar por `updated_at`.
7. Enriquecer com linguagens/README/arquivos conforme necessidade.
8. Expor erros operacionais com dados de rate limit.
9. Reutilizar o mesmo contrato de saída em qualquer sistema consumidor.

---

> **Assinatura de Origem**  
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.  
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design  
> Data desta versão: 2026-04-14  
> Sugestões e pull requests são bem-vindos.
