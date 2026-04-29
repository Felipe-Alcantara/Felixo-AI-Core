# 📖 GUIA DE DOCUMENTAÇÃO — PADRÃO README

> **Contexto**: Este guia define o padrão de estrutura e escrita de README.md para todos os projetos, extraído do padrão estabelecido no projeto **Cifra de César**.
>
> **Objetivo**: Garantir consistência, clareza e profissionalismo na documentação de qualquer repositório.
>
> **Autor**: Felipe Alcantara

---

## 1. ESTRUTURA OBRIGATÓRIA

Todo README.md deve seguir esta ordem de seções. Seções marcadas com ⭐ são obrigatórias; as demais são opcionais conforme o projeto.

```
1.  ⭐ Título + Badges + Descrição curta + Links rápidos
2.  ⭐ Índice
3.     Destaque Principal (demo online, feature principal)
4.  ⭐ Sobre o Projeto
5.  ⭐ Estrutura do Projeto (árvore de pastas)
6.  ⭐ Ferramentas / Funcionalidades Disponíveis
7.     Documentação Completa Disponível
8.  ⭐ Como Usar (instalação + execução)
9.     Guia Rápido (por perfil de usuário)
10.    Funcionalidades Técnicas
11.    Limitações
12.    Segurança (se aplicável)
13.    Objetivo / Propósito
14. ⭐ Licença
15. ⭐ Autor
16.    Contribuições
17.    CTA final (estrela no GitHub)
```

---

## 2. SEÇÃO POR SEÇÃO

### 2.1 ⭐ Header (Título + Badges + Links)

O header é a primeira impressão. Deve conter:

```markdown
# 🔐 Nome do Projeto

<div align="center">

![Tech1](https://img.shields.io/badge/Tech-Versão-Cor?style=for-the-badge&logo=tech&logoColor=white)
![Tech2](...)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

**Descrição curta e impactante em uma linha**

[🌐 Demo Online](URL) • [📖 Documentação](URL) • [🚀 Como Usar](#-como-usar) • [⭐ Features](#-features)

</div>
```

#### Regras:
- **Emoji no título**: Sempre usar um emoji representativo antes do nome
- **Badges**: Usar `style=for-the-badge` para uniformidade. Incluir:
  - Linguagem principal + versão mínima
  - Frameworks/ferramentas relevantes (máx. 5 badges)
  - Licença (sempre por último)
- **Descrição**: Uma frase em negrito, concisa e descritiva
- **Links rápidos**: Separados por ` • `, apontando para seções-chave
- **Centralizado**: Tudo dentro de `<div align="center">`

---

### 2.2 ⭐ Índice

Lista todas as seções com links âncora e emojis. Destaque a seção principal:

```markdown
## 📋 Índice

- [🌐 **Feature Principal**](#-feature-principal) ⭐ **DESTAQUE**
- [📋 Sobre o Projeto](#-sobre-o-projeto)
- [📁 Estrutura do Projeto](#-estrutura-do-projeto)
- [🚀 Como Usar](#-como-usar)
- ...
```

#### Regras:
- Cada item tem emoji + nome da seção
- Seção de destaque usa **negrito** e label `⭐ **DESTAQUE**`
- Separador `---` após o índice

---

### 2.3 Destaque Principal

Se o projeto tem uma demo online, feature matadora ou algo que mereça atenção imediata:

```markdown
## 🌐 Feature Principal ⭐

> **🚀 CHAMADA DE AÇÃO EM CAPS**
> 
> **[👉 LINK GRANDE E CLARO 👈](URL)**

### 💡 Por que usar?

Lista de benefícios com emojis:
- **🎯 Benefício 1**: Descrição curta
- **🌙 Benefício 2**: Descrição curta
- **📱 Benefício 3**: Descrição curta
```

#### Regras:
- Usar blockquote `>` para o CTA principal
- Listar benefícios com emoji + negrito + descrição
- Se tiver sub-ferramentas, listar em lista numerada
- Fechar com detalhes técnicos (`Tecnologias da Interface:`)

---

### 2.4 ⭐ Sobre o Projeto

Explicação expandida do que o projeto faz:

```markdown
## 📋 Sobre o Projeto

Parágrafo explicativo com termos técnicos em **negrito**.

### ✨ **NOVO: Feature recente!**
Lista de novidades recentes com emojis e checkmarks.
```

#### Regras:
- 1-2 parágrafos de contexto
- Se houver features novas, usar `### ✨ **NOVO:**`
- Lista com bullets e emojis para cada feature nova

---

### 2.5 ⭐ Estrutura do Projeto

Árvore de pastas visual com emojis de pasta/arquivo:

```markdown
## 📁 Estrutura do Projeto

\```
NomeProjeto/
│
├── 📁 src/                    # Descrição curta
│   ├── 📁 modulo1/            # Descrição
│   │   ├── arquivo.py
│   │   └── README.md
│   └── README.md
│
├── 📁 docs/                   # Documentação
│   └── index.html
│
├── README.md                  # Este arquivo
└── LICENSE
\```
```

#### Regras:
- Usar `📁` para pastas e nomes sem emoji para arquivos
- Comentários `# Descrição curta` alinhados à direita
- Mostrar até 3 níveis de profundidade (não mais)
- `README.md` raiz sempre comentado como `# Este arquivo`

---

### 2.6 ⭐ Ferramentas / Funcionalidades

Cada ferramenta/módulo documentado individualmente:

```markdown
## 🚀 Ferramentas Disponíveis

### 🔐 Nome do Módulo (`caminho/`)

**`nome_do_arquivo.py`**
- O que faz (ação principal)
- Detalhe técnico relevante
- Exemplo: `entrada` → `saída`

📖 [Ver documentação detalhada](caminho/README.md)

---
```

#### Regras:
- Cada módulo com emoji próprio + nome + caminho entre parênteses
- Arquivos em **negrito com backticks**: **\`nome.py\`**
- Lista de 3-4 bullets descrevendo funcionalidades
- Exemplo prático com `→` mostrando transformação
- Link para README específico do módulo
- Separador `---` entre módulos

---

### 2.7 ⭐ Como Usar

Dividido por opções de uso, com a mais acessível primeiro:

```markdown
## 🎯 Como Usar

### Opção 1: Forma mais fácil (Recomendado!) 🌐

**🚀 Link direto:** [URL](URL)

### Opção 2: Para desenvolvedores

#### Instalação

\```bash
# Clone o repositório
git clone https://github.com/usuario/repo.git

# Entre na pasta
cd repo

# Instale dependências (se houver)
pip install -r requirements.txt
\```

### Executando

\```bash
# Comando principal
python main.py
\```
```

#### Regras:
- Opção mais simples primeiro (web, GUI, etc.)
- Blocos de código com `bash` para comandos
- Comentários em cada comando explicando o que faz
- Separar Instalação de Execução

---

### 2.8 Guia Rápido (por perfil)

```markdown
## 📚 Guia Rápido

### Para Iniciantes
1. Passo 1
2. Passo 2

### Para Desenvolvedores
1. Passo técnico 1
2. Passo técnico 2

### Para Uso Prático
- **Cenário A:** Use `arquivo_x.py`
- **Cenário B:** Use `arquivo_y.py`
```

---

### 2.9 Funcionalidades Técnicas

Listar funções, APIs ou sistemas internos:

```markdown
## 🔧 Funcionalidades Técnicas

### Funções Principais

- **`nome_funcao(params)`**: Descrição do que faz
- **`outra_funcao(params)`**: Descrição

### Sistema Interno

Explicação de como funciona internamente com exemplos:
- **Valor X**: Representa Y
- **Valor Z**: Representa W

Exemplo completo: `entrada` → `[saída detalhada]`
```

---

### 2.10 Limitações & Segurança

```markdown
## ⚠️ Limitações

- **Item**: Descrição da limitação
- **Acentos:** ✅ **SUPORTADO!** (se resolvido, celebrar!)

## 🛡️ Segurança

⚠️ **IMPORTANTE:** Aviso de segurança em negrito.

**Para uso real, use:**
- Alternativa 1
- Alternativa 2
```

---

### 2.11 ⭐ Rodapé (Licença + Autor + Contribuições)

```markdown
## 📝 Licença

Este projeto está sob a licença MIT — veja o arquivo `LICENSE`.

## 👤 Autor

**Nome Completo**
- GitHub: [@usuario](https://github.com/usuario)
- Repositório: [Nome](URL)

## 🤝 Contribuições

Contribuições são bem-vindas! Sinta-se à vontade para:
- Reportar bugs
- Sugerir novas funcionalidades
- Melhorar a documentação

---

⭐ Se este projeto foi útil, considere dar uma estrela no GitHub!
```

---

## 3. CONVENÇÕES DE ESCRITA

### 3.1 Uso de Emojis

| Contexto | Emojis recomendados |
|----------|-------------------|
| **Títulos de seção** | 📋 📁 🚀 🎯 📚 🔧 ⚠️ 🛡️ 🎓 📝 👤 🤝 |
| **Features/Tools** | 🔐 🔓 🔢 🔍 📊 |
| **Status** | ✅ ❌ 🔄 ⭐ ✨ |
| **Ações** | 💡 💻 📖 📸 🌐 🚀 |
| **Alertas** | ⚠️ 🛡️ ❗ |

### 3.2 Formatação

| Elemento | Formato |
|----------|---------|
| Nomes de arquivos | **\`nome_arquivo.py\`** (negrito + code) |
| Caminhos de pasta | `pasta/subpasta/` (apenas code) |
| Termos técnicos | **negrito** na primeira menção |
| Transformações | `entrada` → `saída` (com seta →) |
| Links internos | 📖 [Texto descritivo](caminho/README.md) |
| Comandos terminal | Bloco \`\`\`bash com comentários |
| Destaques | Label `⭐ **DESTAQUE**` |
| Features novas | `### ✨ **NOVO:**` |

### 3.3 Separadores

- `---` entre seções principais
- `---` entre módulos na lista de ferramentas
- Nunca dois `---` seguidos

### 3.4 Tom de Escrita

- **Direto e objetivo** — sem rodeios
- **Empolgado sem exagero** — usar `!` com moderação
- **Inclusivo** — "Sinta-se à vontade", "Contribuições são bem-vindas"
- **Técnico quando necessário** — não simplificar demais para devs
- **Acessível para iniciantes** — sempre ter um "Para Iniciantes"

---

## 4. CHECKLIST ANTES DE PUBLICAR

- [ ] Header com badges centralizados e descrição curta
- [ ] Índice com links funcionando
- [ ] Estrutura de pastas atualizada
- [ ] Todos os módulos/ferramentas documentados
- [ ] Comandos de instalação testados
- [ ] Exemplos de entrada → saída
- [ ] Links internos apontando para READMEs existentes
- [ ] Limitações honestas
- [ ] Licença e autor preenchidos
- [ ] CTA final (estrela no GitHub)
- [ ] Emojis consistentes
- [ ] Sem erros de português
- [ ] Blocos de código com linguagem especificada

---

## 5. TEMPLATE RÁPIDO

```markdown
# 🎯 Nome do Projeto

<div align="center">

![Badge1](url) ![Badge2](url) ![License](url)

**Descrição curta e impactante**

[🌐 Demo](url) • [📖 Docs](url) • [🚀 Como Usar](#-como-usar)

</div>

---

Parágrafo de contexto.

## 📋 Índice
- [📋 Sobre](#-sobre-o-projeto)
- [📁 Estrutura](#-estrutura-do-projeto)
- [🚀 Como Usar](#-como-usar)
- [📝 Licença](#-licença)

---

## 📋 Sobre o Projeto
(descrição)

## 📁 Estrutura do Projeto
(árvore)

## 🚀 Como Usar
(instalação + execução)

## ⚠️ Limitações
(lista)

## 📝 Licença
MIT

## 👤 Autor
Nome — [@github](url)

---
⭐ Curtiu? Deixa uma estrela!
```

---

**Versão**: 1.0  
**Baseado em**: README.md do projeto Cifra de César em Python  
**Última Atualização**: 2026

---

> **Assinatura de Origem**  
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.  
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design  
> Data desta versão: 2026-03-23  
> Sugestões e pull requests são bem-vindos.
