# 🌌 GUIA-BACKGROUND-SISTEMA-VISUAL-REUTILIZAVEL-DA-CALCULADORA-PRO-WEB-BRYTHON.md

Status: concluido.

> **O que é**: Um guia reutilizável para estruturar um **sistema de background visual em camadas**, com gradiente, símbolos animados e integração com troca de tema.
>
> **De onde vem**: Este padrão foi extraído da versão web da **Calculadora Científica Pro**, construída com **Brython**.
>
> **Qual é o propósito dentro de `Utils/`**: Registrar esse subsistema visual como referência reaproveitável do `Felixo System Design`, separando a mecânica de ambientação visual do restante da aplicação original.
>
> **Quando usar**: Calculadoras, dashboards, landing pages técnicas, apps educacionais ou qualquer interface que precise de um fundo temático vivo sem comprometer legibilidade e usabilidade.
>
> **Origem no código-fonte**: Este material foi extraído do comportamento real implementado em `docs/index.html`, `docs/style.css`, `docs/calculator.py` e `docs/regra-de-3.html`.
>
> **Stack de origem**: HTML5 + CSS3 + JavaScript + Brython.
>
> **Leitura correta deste documento**: Isto não é uma proposta conceitual nem uma spec hipotética; é uma documentação de engenharia reversa do que já existe no produto.

Este documento não tenta documentar toda a Calculadora Científica Pro. O foco aqui é isolar o padrão de background como subsistema visual reutilizável, deixando claro o que pode ser reaproveitado, mantido ou evoluído em outros projetos.

---

## 1. VISÃO GERAL DO SUBSISTEMA

O background da versão web da calculadora não é apenas um "fundo decorativo". Ele funciona como um subsistema de identidade visual que cumpre quatro papéis ao mesmo tempo:

1. Estabelece a base cromática da aplicação com um gradiente de tela inteira.
2. Adiciona profundidade visual com uma camada fixa de símbolos matemáticos animados.
3. Mantém consistência entre tema escuro e tema claro.
4. Preserva usabilidade, mantendo a interface interativa acima do fundo e sem interferência de clique.

Na prática, o sistema foi desenhado para fazer a interface parecer viva, temática e técnica, sem disputar atenção diretamente com o conteúdo da calculadora.

## 2. ESCOPO DE APLICAÇÃO

Este subsistema aparece de duas formas dentro da versão web:

### 2.1 Home da Calculadora (`docs/index.html`)

Na home, o background é composto por:

- gradiente base no `body`
- camada fixa `.math-background`
- elementos `.math-symbol` criados dinamicamente via JavaScript
- adaptação visual via tema claro/escuro controlado em Brython

### 2.2 Página de Regra de 3 (`docs/regra-de-3.html`)

Na página auxiliar de regra de 3, o projeto reutiliza apenas:

- gradiente base do `body`
- versão clara do gradiente
- preferência de tema salva em `localStorage`

Essa página não reaproveita a camada animada de símbolos matemáticos. Portanto, ela herda a linguagem visual geral, mas não o subsistema completo de background da home.

## 3. OBJETIVOS DE DESIGN IDENTIFICADOS

Analisando a implementação atual, o sistema de background atende aos seguintes objetivos implícitos:

| Objetivo | Como é atendido |
|----------|------------------|
| **Identidade matemática** | Uso de símbolos, letras gregas, operadores e expressões científicas |
| **Profundidade visual** | Separação entre gradiente base, camada animada e conteúdo |
| **Dinamismo contínuo** | Geração constante de novos elementos em loop |
| **Baixa interferência** | `pointer-events: none` no fundo e conteúdo acima via `z-index` |
| **Consistência de tema** | Mudança de gradiente e cor dos símbolos via classe `light-theme` |
| **Persistência de preferência** | Tema salvo e carregado por `localStorage` |

Esses objetivos explicam por que o fundo foi implementado como sistema e não apenas como um bloco estático de CSS.

## 4. ARQUITETURA EM CAMADAS

Na home, o background segue uma arquitetura simples de três camadas principais:

```
┌──────────────────────────────────────────────┐
│ z-index 10   Conteúdo principal              │
│              (.main-container)               │
│ z-index 1    Fundo animado                   │
│              (.math-background)              │
│ base         Gradiente do body               │
└──────────────────────────────────────────────┘
```

### 4.1 Estrutura HTML base

```html
<body onload="brython()">
    <div class="math-background" id="math-bg"></div>

    <div class="main-container">
        ...interface da calculadora...
    </div>
</body>
```

### 4.2 Leitura arquitetural

- O `body` sustenta a base visual permanente.
- A `div#math-bg` é a camada dinâmica do sistema.
- A `.main-container` sobe o conteúdo acima da animação.
- O resultado é um fundo com profundidade visual, mas semanticamente separado da lógica funcional da calculadora.

## 5. CAMADA 1: GRADIENTE BASE

O gradiente principal é definido em `docs/style.css` e aplicado diretamente ao `body`.

### 5.1 Tema escuro

```css
body {
    background: linear-gradient(135deg, #1e1e2e 0%, #2e2e4e 100%);
    min-height: 100vh;
    transition: background 0.3s ease;
    position: relative;
    overflow: hidden;
}
```

### 5.2 Decisões implícitas dessa camada

| Decisão | Efeito |
|--------|--------|
| `linear-gradient(135deg, #1e1e2e 0%, #2e2e4e 100%)` | cria um fundo escuro suave, menos rígido que cor chapada |
| `min-height: 100vh` | garante cobertura total da viewport |
| `transition: background 0.3s ease` | suaviza troca entre temas |
| `overflow: hidden` | evita scroll causado pelos elementos animados |
| `position: relative` | organiza o contexto visual da página |

### 5.3 Tema claro

Quando o `body` recebe `light-theme`, o gradiente muda para:

```css
body.light-theme {
    background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);
}
```

Esse comportamento mostra que o sistema trata o gradiente como token principal de ambientação da interface.

## 6. CAMADA 2: FUNDO ANIMADO MATEMÁTICO

A segunda camada é o núcleo do subsistema de background. Ela é composta por um container fixo e elementos flutuantes criados em tempo de execução.

### 6.1 Container do fundo animado

```css
.math-background {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    pointer-events: none;
    overflow: hidden;
}
```

### 6.2 Papel estrutural do container

- ocupa a viewport inteira
- permanece fixo em relação à tela
- não intercepta clique nem seleção
- limita visualmente os elementos à área da janela

Esse container funciona como uma "zona de renderização" exclusiva para o background dinâmico.

### 6.3 Elementos individuais

Cada símbolo é uma `div` com classe `.math-symbol`:

```css
.math-symbol {
    position: absolute;
    color: #1abc9c;
    font-family: 'Times New Roman', serif;
    font-weight: bold;
    pointer-events: none;
    user-select: none;
    animation: float-drift 8s linear forwards;
    will-change: transform, opacity;
    text-shadow:
        0 0 10px currentColor,
        0 0 20px currentColor,
        0 0 30px rgba(26, 188, 156, 0.5);
    filter: brightness(1.2);
}
```

### 6.4 Papel visual dos símbolos

| Propriedade | Função visual |
|-------------|---------------|
| `color: #1abc9c` | assinatura cromática neon do modo escuro |
| `font-family: 'Times New Roman', serif` | reforça leitura de notação matemática clássica |
| `font-weight: bold` | aumenta legibilidade mesmo com baixa opacidade |
| `text-shadow` | cria glow e separação do fundo |
| `filter: brightness(1.2)` | aumenta presença luminosa |
| `will-change` | antecipa animação de `transform` e `opacity` |

## 7. SISTEMA DE ANIMAÇÃO

O movimento dos símbolos é controlado pelo `@keyframes float-drift`.

```css
@keyframes float-drift {
    0% {
        opacity: 0;
        transform: translate(0, 0) rotate(0deg) scale(0.7);
        filter: brightness(1) blur(2px);
    }
    5% {
        opacity: 0.18;
        transform: translate(calc(var(--move-x, 20px) * 0.15), calc(var(--move-y, 20px) * 0.15)) rotate(calc(var(--rotation, 30deg) * 0.2)) scale(1);
        filter: brightness(1.3) blur(0px);
    }
    50% {
        opacity: 0.2;
        transform: translate(calc(var(--move-x, 20px) * 0.6), calc(var(--move-y, 20px) * 0.6)) rotate(calc(var(--rotation, 30deg) * 0.7)) scale(1);
        filter: brightness(1.2) blur(0px);
    }
    95% {
        opacity: 0.15;
        transform: translate(var(--move-x, 20px), var(--move-y, 20px)) rotate(var(--rotation, 30deg)) scale(1);
        filter: brightness(1.1) blur(1px);
    }
    100% {
        opacity: 0;
        transform: translate(var(--move-x, 20px), var(--move-y, 20px)) rotate(var(--rotation, 30deg)) scale(0.7);
        filter: brightness(1) blur(3px);
    }
}
```

### 7.1 Leitura do comportamento temporal

| Faixa | Comportamento |
|-------|----------------|
| `0%` | símbolo nasce invisível, pequeno e desfocado |
| `5%` | aparece rapidamente e ganha nitidez |
| `50%` | atinge o estado de presença visual principal |
| `95%` | começa a perder nitidez e opacidade |
| `100%` | some reduzindo escala e aumentando blur |

### 7.2 Variáveis que controlam a animação

A animação depende de três custom properties definidas via JavaScript:

- `--move-x`
- `--move-y`
- `--rotation`

Isso significa que o CSS define a coreografia, mas o JavaScript decide a trajetória individual de cada símbolo.

## 8. LÓGICA DE GERAÇÃO DOS ELEMENTOS

A criação dos símbolos acontece em um script inline dentro de `docs/index.html`.

### 8.1 Catálogo de símbolos

O array `mathSymbols` combina vários grupos semânticos:

- símbolos matemáticos clássicos: `∑`, `∫`, `∞`, `π`, `√`
- letras gregas: `α`, `β`, `γ`, `θ`, `λ`, `μ`, `σ`, `φ`
- operadores e relações: `÷`, `×`, `±`, `≠`, `≈`, `≤`, `≥`
- teoria de conjuntos e lógica: `∈`, `∀`, `∃`, `∅`, `∩`, `∪`, `⊂`, `⊆`
- números: `0` a `9`
- expressões científicas: `sin`, `cos`, `tan`, `log`, `ln`, `x²`, `x³`, `dy/dx`, `lim`

A consequência dessa mistura é importante: o fundo não parece um padrão repetitivo. Ele parece um espaço matemático vivo, com baixa previsibilidade visual.

### 8.2 Função `createMathElement()`

Cada símbolo segue o mesmo pipeline de criação:

1. localizar `#math-bg`
2. criar uma `div`
3. atribuir a classe `math-symbol`
4. escolher conteúdo textual aleatório
5. definir posição inicial aleatória em toda a viewport
6. definir tamanho aleatório entre `26px` e `44px`
7. definir opacidade base entre `0.10` e `0.18`
8. definir deslocamento horizontal e vertical aleatório
9. definir rotação aleatória
10. definir duração de animação entre `6s` e `10s`
11. anexar o elemento ao DOM
12. remover o elemento após o fim do ciclo

Trecho central:

```js
const durations = [6, 7, 8, 9, 10];
const duration = durations[Math.floor(Math.random() * durations.length)];
element.style.animationDuration = duration + 's';

mathBg.appendChild(element);

setTimeout(() => {
    if (element.parentNode) {
        element.remove();
    }
}, duration * 1000 + 100);
```

### 8.3 Impacto arquitetural dessa abordagem

- o DOM não cresce indefinidamente
- cada símbolo tem trajetória própria
- a densidade visual nasce de volume e renovação contínua, não de um loop com poucos elementos reaproveitados

## 9. DENSIDADE E RITMO DO FUNDO

A função `initMathBackground()` define o comportamento macro do sistema.

```js
for (let i = 0; i < 100; i++) {
    setTimeout(() => createMathElement(), i * 80);
}

setInterval(() => {
    createMathElement();
    createMathElement();
}, 250);
```

### 9.1 Estratégia usada

| Estratégia | Implementação | Resultado |
|-----------|---------------|-----------|
| **Carga inicial rápida** | `100` elementos com atraso incremental | tela ganha vida logo após abrir |
| **Renovação contínua** | `setInterval` de `250ms` | fundo nunca entra em estado estático |
| **Criação dupla por ciclo** | `createMathElement()` duas vezes | aumenta a sensação de volume |
| **Remoção sincronizada** | `setTimeout` baseado na duração | evita acúmulo de nós no DOM |

### 9.2 Interpretação de design

Esse fundo foi calibrado para ser denso e perceptível. Ele não é um detalhe quase invisível. Ele participa da identidade visual principal da página.

## 10. INTEGRAÇÃO COM O SISTEMA DE TEMA

O fundo não é reconstruído ao trocar de tema. O sistema opera por mudança de estado visual via classe no `body`.

### 10.1 Controle em Brython

O arquivo `docs/calculator.py` controla o estado com:

- `current_theme = "dark"`
- `toggle_theme()`
- `load_theme()`

### 10.2 Fluxo de `toggle_theme()`

Quando o usuário clica no botão de tema:

1. o estado alterna entre `dark` e `light`
2. a classe `light-theme` é adicionada ou removida do `body`
3. o texto do botão é atualizado
4. a preferência é persistida em `localStorage`

### 10.3 Fluxo de `load_theme()`

Na inicialização:

1. o código consulta `localStorage.getItem("theme")`
2. se o valor salvo for `light`, aplica `light-theme`
3. o botão também é atualizado para refletir o estado carregado

### 10.4 Reflexo visual do tema claro

Além do gradiente, o tema claro ajusta os próprios símbolos:

```css
body.light-theme .math-symbol {
    color: #2c3e50;
    text-shadow:
        0 0 8px rgba(44, 62, 80, 0.4),
        0 0 15px rgba(44, 62, 80, 0.3),
        0 0 25px rgba(44, 62, 80, 0.2);
}
```

### 10.5 Interpretação sistêmica

O tema altera a leitura do fundo, mas não altera a mecânica do subsistema. Em outras palavras:

- a estrutura permanece a mesma
- a animação permanece a mesma
- apenas os tokens visuais mudam

Esse é um sinal de separação saudável entre comportamento e aparência.

## 11. GARANTIAS DE USABILIDADE

Apesar de visualmente ativo, o background não interfere na navegação.

### 11.1 Mecanismos de proteção

| Mecanismo | Onde | Efeito |
|-----------|------|--------|
| `pointer-events: none` | `.math-background` e `.math-symbol` | fundo não bloqueia interação |
| `z-index: 10` | `.main-container` | conteúdo fica acima da animação |
| `overflow: hidden` | `body` e `.math-background` | elimina vazamento visual e scroll indesejado |

### 11.2 Resultado prático

- botões continuam clicáveis
- display e histórico permanecem legíveis
- a animação trabalha como ambiência, não como obstáculo

## 12. VARIANTE DE IMPLEMENTAÇÃO: REGRA DE 3

A página `docs/regra-de-3.html` é importante para entender o limite do sistema.

### 12.1 O que ela reaproveita

- gradiente escuro
- gradiente claro
- leitura do tema salvo em `localStorage`

### 12.2 O que ela não reaproveita

- `.math-background`
- geração dinâmica de símbolos
- animação `float-drift`

### 12.3 Conclusão arquitetural

Hoje o projeto possui:

- um **background system completo** na home da calculadora
- uma **variante simplificada** na página de regra de 3

Isso é relevante para o repositório de System Design porque mostra que o padrão visual principal ainda não foi extraído para uma camada compartilhada entre todas as páginas web do projeto.

## 13. PONTOS DE MANUTENÇÃO

Se o objetivo for evoluir ou reaproveitar esse sistema em outros projetos, os pontos de alteração corretos são estes:

| Mudança desejada | Arquivo principal | Ponto de edição |
|------------------|-------------------|-----------------|
| Alterar gradiente base | `docs/style.css` | `body`, `body.light-theme` |
| Alterar container animado | `docs/style.css` | `.math-background` |
| Alterar aparência dos símbolos | `docs/style.css` | `.math-symbol`, `body.light-theme .math-symbol` |
| Alterar trajetória visual | `docs/style.css` | `@keyframes float-drift` |
| Alterar catálogo de símbolos | `docs/index.html` | array `mathSymbols` |
| Alterar densidade/ritmo | `docs/index.html` | `createMathElement()` e `initMathBackground()` |
| Alterar persistência de tema | `docs/calculator.py` | `toggle_theme()`, `load_theme()` |
| Alterar variante da regra de 3 | `docs/regra-de-3.html` | CSS inline + `load_theme()` |

## 14. OBSERVAÇÕES TÉCNICAS IMPORTANTES

### 14.1 Regras `nth-child` de duração estão sobrescritas

O CSS define variações como:

```css
.math-symbol:nth-child(2n) { animation-duration: 6s; }
.math-symbol:nth-child(3n) { animation-duration: 9s; }
```

Mas o JavaScript define `animationDuration` inline para cada elemento.

Como o estilo inline tem precedência maior, a duração efetiva vem do JavaScript, não dessas regras CSS. Portanto, essas regras existem no arquivo, mas hoje não governam o comportamento real dos símbolos.

### 14.2 O subsistema é independente da lógica matemática da calculadora

A camada de background não depende do motor de cálculo. Ela depende apenas de:

- um container `#math-bg`
- os estilos CSS correspondentes
- a rotina de geração dos símbolos
- o estado visual do tema

Isso facilita reaproveitamento futuro em outras interfaces com estética semelhante.

### 14.3 O sistema atual é orientado à home

Embora exista consistência visual entre páginas, o comportamento completo do background ainda não foi abstraído como módulo compartilhado. Hoje ele está acoplado à `index.html` principal.

## 15. RESUMO EXECUTIVO

O background da versão web da Calculadora Científica Pro, construída com Brython, pode ser entendido como um sistema composto por:

1. um gradiente base aplicado ao `body`
2. uma camada fixa de renderização de fundo
3. um gerador dinâmico de símbolos matemáticos
4. uma animação CSS baseada em deslocamento, rotação, blur, escala e opacidade
5. uma integração leve com o sistema de tema persistido em `localStorage`

Como documento de **System Design**, este arquivo existe para registrar esse comportamento como padrão técnico e visual extraído do produto real, facilitando manutenção, comparação entre versões e eventual reaproveitamento do padrão em outros projetos.

---

> **Assinatura de Origem**  
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.  
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design  
> Data desta versão: 2026-03-23  
> Sugestões e pull requests são bem-vindos.
