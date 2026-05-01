# DESIGN SYSTEM FRONTEND - FELIXOVERSE

Status: concluido.

> **Contexto**: Este documento é o guia de padronização **front-end** extraído do código-fonte do portfólio FelixoVerse. Ele cataloga todos os padrões visuais, estruturais e técnicos utilizados na interface do projeto, servindo como referência oficial para manter consistência visual e de UX em futuras implementações e novos projetos.
>
> **Escopo**: Exclusivamente **front-end** — identidade visual, componentes de UI, animações, layout responsivo e interações do lado do cliente.
>
> **Objetivo**: Transformar decisões de design implícitas no código em um sistema documentado e reutilizável, facilitando a manutenção, escalabilidade e colaboração.
>
> **Stack Frontend**: React 18 + Tailwind CSS 3 + Framer Motion 10 + Vite

---

## 1. IDENTIDADE VISUAL

### 1.1 Paleta de Cores

#### Cores Primárias

| Nome | Código | Uso Principal |
|------|--------|---------------|
| **Felixo Purple** | `#C084FC` | Cor de marca estática, textos de destaque |
| **Felixo Purple Bright** | `#A855F7` | Cor de marca vibrante, efeitos de glow |
| **Branco** | `#FFFFFF` | Textos principais, ícones |
| **Preto Puro** | `#000000` | Fundo base |

#### Cores de Fundo (Gradientes)

| Nome | Código | Uso |
|------|--------|-----|
| **Zinc 950** | `rgb(9, 9, 11)` | Fundo principal escuro |
| **Zinc 900** | `rgb(24, 24, 27)` | Cards, containers |
| **Zinc 800** | `rgb(39, 39, 42)` | Inputs, elementos secundários |
| **Black/Zinc Gradient** | `from-black via-zinc-950 to-black` | Fundo da aplicação |

#### Cores de Texto

| Nome | Código | Uso |
|------|--------|-----|
| **Zinc 50** | `rgb(250, 250, 250)` | Texto principal |
| **Zinc 300** | `rgb(212, 212, 216)` | Texto secundário |
| **Zinc 400** | `rgb(161, 161, 170)` | Texto terciário, placeholders |
| **Zinc 500** | `rgb(113, 113, 122)` | Texto desabilitado |

#### Cores de Tecnologias (Badges)

| Tecnologia | Cor | Código |
|------------|-----|--------|
| HTML | Laranja | `#E34F26` |
| CSS | Azul | `#1572B6` |
| JavaScript | Amarelo | `#F7DF1E` |
| TypeScript | Azul TS | `#3178C6` |
| Python | Azul Python | `#3776AB` |
| React | Ciano | `#61DAFB` |
| Tailwind | Ciano Claro | `#06B6D4` |
| Vite | Roxo Vite | `#646CFF` |
| C# | Roxo Escuro | `#512BD4` |
| Django | Verde Escuro | `#0C4B33` |
| Git | Vermelho | `#F05032` |

#### Cores de Status

| Status | Cor de Fundo | Cor de Texto | Borda |
|--------|--------------|--------------|-------|
| **Finalizado** | `bg-green-950/80` | `text-green-300` | `border-green-700/60` |
| **Em Desenvolvimento** | `bg-yellow-400/20` | `text-yellow-100` | `border-yellow-400/40` |

#### Cores de Categoria

| Categoria | Background | Texto | Borda |
|-----------|------------|-------|-------|
| Web | `bg-blue-500/10` | `text-blue-400` | `border-blue-500/20` |
| Code | `bg-green-500/10` | `text-green-400` | `border-green-500/20` |
| Music | `bg-pink-500/10` | `text-pink-400` | `border-pink-500/20` |
| Design | `bg-purple-500/10` | `text-purple-400` | `border-purple-500/20` |
| Game | `bg-orange-500/10` | `text-orange-400` | `border-orange-500/20` |
| Automation | `bg-yellow-500/10` | `text-yellow-400` | `border-yellow-500/20` |

### 1.2 Tipografia

#### Fonte Principal
- **Família**: `'Space Grotesk', sans-serif`
- **Aplicação**: Todo o sistema

#### Hierarquia de Tamanhos

| Elemento | Tamanho Desktop | Tamanho Mobile | Peso |
|----------|----------------|----------------|------|
| **H1 (Hero)** | `text-5xl` (48px) | `text-4xl` (36px) | `font-bold` (700) |
| **H2 (Seções)** | `text-3xl` (30px) | `text-2xl` (24px) | `font-bold` (700) |
| **H3 (Cards)** | `text-base` (16px) | `text-base` (16px) | `font-bold` (700) |
| **Body** | `text-base` (16px) | `text-base` (16px) | `font-normal` (400) |
| **Body Large** | `text-lg` (18px) | `text-base` (16px) | `font-normal` (400) |
| **Small** | `text-sm` (14px) | `text-sm` (14px) | `font-medium` (500) |
| **Extra Small** | `text-xs` (12px) | `text-xs` (12px) | `font-medium` (500) |
| **Mono (Timer)** | `font-mono` | `font-mono` | `font-bold` (700) |

#### Espaçamento de Linhas
- **Títulos**: `leading-tight` (1.25)
- **Parágrafos**: `leading-relaxed` (1.625)

### 1.3 Contraste e Hierarquia Visual

#### Opacidades Padrão
- **Bordas Sutis**: `border-white/5` (5%)
- **Bordas Padrão**: `border-white/10` (10%)
- **Bordas Hover**: `border-white/20` (20%)
- **Bordas Ativas**: `border-white/30` (30%)
- **Backgrounds Overlay**: `bg-black/80` (80%)
- **Backgrounds Card**: `bg-zinc-950/50` (50%)

## 2. PADRÕES DE LAYOUT

### 2.1 Sistema de Grid

#### Container Principal
```css
max-w-7xl mx-auto px-6
```
- **Largura Máxima**: 1280px
- **Padding Horizontal**: 24px (1.5rem)

#### Grid de Seções
```css
grid md:grid-cols-2 gap-10
grid md:grid-cols-[280px_1fr] lg:grid-cols-[280px_1fr_240px] gap-8
```

#### Grid de Cards (Projetos)
```css
grid sm:grid-cols-2 lg:grid-cols-3 gap-5
```
- **Mobile**: 1 coluna
- **Tablet**: 2 colunas
- **Desktop**: 3 colunas
- **Gap**: 20px (1.25rem)

### 2.2 Espaçamentos Recorrentes

#### Padding Interno

| Elemento | Padding |
|----------|---------|
| **Seções** | `py-14` (56px vertical) |
| **Cards** | `p-5` (20px) |
| **Botões** | `px-4 py-2` (16px/8px) |
| **Inputs** | `px-3` (12px horizontal) |
| **Badges** | `px-3 py-1` (12px/4px) |
| **Modais** | `p-6` (24px) |

#### Margin/Gap

| Uso | Valor |
|-----|-------|
| **Gap entre cards** | `gap-3` (12px), `gap-4` (16px), `gap-5` (20px) |
| **Espaçamento vertical** | `space-y-4` (16px), `space-y-6` (24px) |
| **Gap de botões** | `gap-3` (12px) |

### 2.3 Breakpoints

| Nome | Valor | Uso |
|------|-------|-----|
| **sm** | 640px | Tablets pequenos |
| **md** | 768px | Tablets |
| **lg** | 1024px | Desktop |

### 2.4 Border Radius

| Elemento | Valor |
|----------|-------|
| **Cards** | `rounded-2xl` (16px), `rounded-3xl` (24px) |
| **Botões** | `rounded-2xl` (16px) |
| **Inputs** | `rounded-xl` (12px) |
| **Badges** | `rounded-full` (9999px) |
| **Ícones Container** | `rounded-lg` (8px) |

## 3. COMPONENTES REUTILIZÁVEIS

### 3.1 Button

#### Estrutura Base
```jsx
<Button variant="default" size="md">Texto</Button>
```

#### Variantes

| Variante | Classes | Uso |
|----------|---------|-----|
| **default** | `bg-white text-black border-white/10 hover:bg-zinc-100` | Ação primária |
| **outline** | `bg-transparent text-white border-white/20 hover:bg-white/5` | Ação secundária |
| **ghost** | `bg-transparent text-white border-transparent hover:bg-white/5` | Ação terciária |
| **secondary** | `bg-zinc-800 text-white border-white/10 hover:bg-zinc-700` | Alternativa |

#### Tamanhos

| Tamanho | Classes | Altura |
|---------|---------|--------|
| **md** | `h-10 px-4` | 40px |
| **sm** | `h-9 px-3` | 36px |
| **icon** | `h-12 w-12 p-2` | 48px |

#### Estados
- **Base**: `inline-flex items-center justify-center gap-2 rounded-2xl text-sm font-medium transition shadow-sm border`
- **Hover**: Definido por variante
- **Disabled**: Opacidade reduzida (implícito)

### 3.2 Card

#### Estrutura
```jsx
<Card>
  <CardHeader>
    <CardTitle>Título</CardTitle>
    <CardDescription>Descrição</CardDescription>
  </CardHeader>
  <CardContent>Conteúdo</CardContent>
  <CardFooter>Rodapé</CardFooter>
</Card>
```

#### Classes Base
- **Card**: `rounded-3xl border bg-zinc-950/50 border-white/10`
- **CardHeader**: `p-5 border-b border-white/5`
- **CardContent**: `p-5`
- **CardFooter**: `p-5 border-t border-white/5 flex items-center gap-3`
- **CardTitle**: `text-base font-semibold`
- **CardDescription**: `text-xs text-zinc-400`

#### Estados Visuais
- **Hover**: `hover:border-white/20`
- **Glow Roxo**: `felixo-card-glow` (animação de brilho)
- **Glow Branco**: `felixo-card-glow-white`
- **Glow Intenso**: `felixo-card-glow-intense`

### 3.3 Badge

#### Estrutura
```jsx
<Badge className="bg-purple-500/10 text-purple-400">Tag</Badge>
```

#### Classes Base
```css
inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border border-white/10
```

#### Variações por Tecnologia
Usa função `getTagColor(tag)` para aplicar cores específicas.

### 3.4 Input

#### Estrutura
```jsx
<Input placeholder="Texto" />
```

#### Classes Base
```css
w-full h-10 rounded-xl bg-zinc-800/50 border border-white/10 px-3 text-sm text-white outline-none focus:ring-0
```

#### Estados
- **Focus**: `input-glowing-border:focus` (borda roxa com glow)
- **Placeholder**: `text-zinc-400`

### 3.5 Modal

#### Estrutura Base
```jsx
<motion.div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
  <motion.div className="border border-purple-500/30 rounded-2xl w-11/12 max-w-md p-6 shadow-2xl felixo-card-glow">
    {/* Conteúdo */}
  </motion.div>
</motion.div>
```

#### Características
- **Overlay**: `bg-black/80 backdrop-blur-sm`
- **Container**: `rounded-2xl border-purple-500/30 felixo-card-glow`
- **Largura**: `w-11/12 max-w-md` (responsivo)
- **Animação**: Framer Motion com fade in/out

## 4. PADRÕES DE INTERAÇÃO

### 4.1 Estados de Hover

| Elemento | Efeito |
|----------|--------|
| **Botões** | Mudança de background + shimmer effect |
| **Cards** | `hover:border-white/20` + scale sutil |
| **Links** | `hover:text-purple-400` ou `hover:text-white` |
| **Ícones Sociais** | `hover:scale-150` + cor roxa |
| **Tech Icons** | `hover:scale-150 hover:z-50 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]` |

### 4.2 Animações e Transições

#### Transições Padrão
```css
transition-all duration-300
transition-colors
transition-transform
```

#### Animações Customizadas

| Nome | Duração | Easing | Uso |
|------|---------|--------|-----|
| **title-glow** | 3s | ease-in-out | Brilho de títulos (verde) |
| **title-glow-purple** | 3s | ease-in-out | Brilho de títulos (roxo) |
| **title-glow-ts** | 3s | ease-in-out | Brilho de títulos (azul TS) |
| **title-glow-python** | 3s | ease-in-out | Brilho de títulos (azul Python) |
| **card-glow-breathe** | 3s | ease-in-out | Pulsação de cards (roxo) |
| **card-glow-breathe-white** | 3s | ease-in-out | Pulsação de cards (branco) |
| **card-glow-breathe-intense-hover** | 2.5s | ease-in-out | Pulsação intensa em hover |
| **text-glow-breathe** | 3.8s | ease-in-out | Pulsação de texto |
| **gradient-orbit** | 7.5s | linear | Movimento orbital de gradiente |
| **about-orbit-spin** | 6s / 8.5s | linear | Órbita ao redor da foto |
| **photo-glow-breathe** | 3s | ease-in-out | Brilho da foto de perfil |
| **tech-colors-cycle** | 25s | linear | Ciclo de cores das tecnologias |
| **glow-effect** | 3s | ease-in-out | Brilho branco pulsante |

#### Shimmer Effect (Botões)
```css
/* Brilho que passa da esquerda para direita */
.absolute.inset-0.-translate-x-full.group-hover:translate-x-[150%]
.transition-transform.duration-1000
.bg-gradient-to-r.from-transparent.via-white/20.to-transparent
```

### 4.3 Feedback Visual

#### Loading States
- Ícone `Wrench` para "Em Desenvolvimento"
- Ícone `CheckCircle2` para "Finalizado"

#### Scroll Behavior
```css
scroll-behavior: smooth;
scroll-padding-top: 80px;
```

#### Scrollbar Customizada
```css
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-thumb {
  background: rgba(74, 74, 74, 0.8);
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(106, 106, 106, 0.9);
}
```

### 4.4 Interações Especiais

#### Drag no Carrossel
- `cursor-grab` no estado normal
- `cursor-grabbing` durante o drag
- Momentum desabilitado: `dragMomentum={false}`

#### Grid de Projetos com Hover
- Card em hover: `felixo-card-glow-intense-hover`
- Cards adjacentes: `felixo-card-glow-subtle`
- Cards distantes: `opacity: 0.2` (faded)

#### Busca Interativa
- Animação `layoutId` para transição suave
- Overlay com `backdrop-blur-sm`
- Stagger animation nos resultados

## 5. COMPOSIÇÃO DO FUNDO (BACKGROUND)

### 5.1 Estrutura em Camadas

O fundo da aplicação é construído por **três camadas empilhadas** via z-index, criando profundidade visual sem interferir na interatividade:

```
┌──────────────────────────────────────────────┐
│  z-50   Modais / Overlays                    │
│  z-40   Navbar                               │
│  z-10   Conteúdo (seções, cards, textos)     │
│  z-0    Partículas flutuantes                │
│  base   Gradiente de fundo (bg)              │
└──────────────────────────────────────────────┘
```

### 5.2 Gradiente Base

O gradiente de fundo é aplicado no container raiz (`App.jsx`) e cria uma transição suave de preto puro a um cinza quase-preto:

```jsx
<div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-zinc-50">
```

| Propriedade | Valor | Descrição |
|-------------|-------|-----------|
| **Direção** | `to-b` (top → bottom) | Gradiente vertical |
| **Cor Início** | `black` (`#000000`) | Topo da página |
| **Cor Central** | `zinc-950` (`rgb(9,9,11)`) | Meio, levemente mais claro |
| **Cor Fim** | `black` (`#000000`) | Rodapé, volta ao preto puro |

#### Seções com Fundo Próprio
Algumas seções aplicam um fundo adicional para criar separação visual sem quebrar o gradiente global:

| Seção | Classe de Fundo | Efeito |
|-------|-----------------|--------|
| **About** | `bg-zinc-950/20` | Camada translúcida sobre o gradiente |
| **Cards** | `bg-zinc-950/50` | Fundo semi-transparente para contraste |
| **Modais** | `bg-black/80 backdrop-blur-sm` | Overlay escuro com desfoque |
| **Overlay de Busca** | `bg-black/90 backdrop-blur-sm` | Overlay mais intenso para foco total |

### 5.3 Partículas de Fundo (BackgroundParticles)

O componente `BackgroundParticles` renderiza **35 partículas** flutuantes que sobem continuamente, criando uma sensação de ambiente vivo e imersivo.

#### Anatomia de uma Partícula

```jsx
<motion.div
  className="absolute rounded-full bg-purple-200 shadow-[0_0_15px_rgba(192,132,252,0.8)] blur-[0.5px]"
  style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }}
  animate={{ y: [0, -150], opacity: [0, opacity, 0] }}
  transition={{ duration, repeat: Infinity, ease: "linear", delay }}
/>
```

| Propriedade | Intervalo | Descrição |
|-------------|-----------|-----------|
| **Quantidade** | 35 | Número fixo de partículas |
| **Tamanho** | 2px – 6px | `Math.random() * 4 + 2` |
| **Posição X** | 0% – 100% | Distribuição aleatória horizontal |
| **Posição Y** | 0% – 100% | Ponto de origem aleatório |
| **Duração** | 4s – 12s | `Math.random() * 8 + 4` |
| **Delay** | 0s – 2s | Entrada escalonada |
| **Opacidade Máx.** | 0.5 – 1.0 | `Math.random() * 0.5 + 0.5` |
| **Cor** | `bg-purple-200` | Lilás suave |
| **Glow** | `shadow-[0_0_15px_rgba(192,132,252,0.8)]` | Brilho roxo ao redor |
| **Blur** | `blur-[0.5px]` | Suavização leve |
| **Movimento** | `y: [0, -150]` | Sobe 150px e desaparece |
| **Loop** | `repeat: Infinity` | Ciclo infinito |

#### Comportamento
- As partículas nascem em posições aleatórias, flutuam para cima e desaparecem (fade out).
- O blur e o glow roxo criam um efeito de "estrelas vivas" no fundo escuro.
- O componente usa `pointer-events-none` e `select-none` para não interferir na interação.
- Renderizado com `useMemo` para evitar re-cálculos desnecessários.

### 5.4 Micro-Partículas Decorativas (Particles)

O componente `Particles` adiciona **3 micro-pontos** animados dentro de elementos individuais (botões, badges), dando uma sensação de brilho orgânico:

```jsx
<Particles variant="purple" />  // ou variant="white"
```

| Ponto | Posição | Animação | Cor |
|-------|---------|----------|-----|
| **1** | `top-1 left-2` | `animate-pulse` | Variável (`purple` / `white`) |
| **2** | `bottom-1 right-2` | `animate-pulse delay-300` | Variável |
| **3** | `top-1/2 right-1/4` | `animate-ping duration-[1.5s]` | Sempre branco |

- Tamanho: `w-0.5 h-0.5` (2px × 2px)
- Todos usam `pointer-events-none` e `z-0` para não interferir no elemento pai.

### 5.5 Seleção de Texto

A cor de seleção de texto é customizada para manter a identidade roxa:
```css
selection:bg-purple-600/40
```

---

## 6. SISTEMA DE GLOW RESPIRANTE (BREATHING GLOW)

O efeito de "respiração" é o signature visual do FelixoVerse: elementos pulsam suavemente entre estados de brilho baixo e alto, simulando algo orgânico e vivo. Este sistema é aplicado em **textos**, **cards**, **bordas**, **fotos** e **inputs**.

### 6.1 Conceito Central

Todas as animações de glow seguem o mesmo padrão CSS:

```css
@keyframes nome-da-animacao {
  0%, 100% {
    /* estado de brilho MÍNIMO */
  }
  50% {
    /* estado de brilho MÁXIMO */
  }
}
```

- **Easing**: `ease-in-out` (aceleração suave) — nunca `linear`, para parecer orgânico.
- **Duração**: 2.5s – 5s dependendo da intensidade desejada.
- **Loop**: `infinite` — sempre pulsando.

### 6.2 Variável de Intensidade

O sistema possui uma variável CSS customizada que permite controlar a intensidade do glow globalmente ou por elemento:

```css
:root {
  --felixo-glow-intensity: 1; /* padrão 100% */
}
```

#### Classes Utilitárias de Intensidade

| Classe | Valor | Uso |
|--------|-------|-----|
| `felixo-glow-intensity-25` | `0.25` | Glow muito sutil (elementos distantes) |
| `felixo-glow-intensity-50` | `0.5` | Glow reduzido (estado inativo) |
| `felixo-glow-intensity-75` | `0.75` | Glow padrão reduzido |
| `felixo-glow-intensity-100` | `1` | Glow padrão (100%) |
| `felixo-glow-intensity-150` | `1.5` | Glow ampliado (destaque especial) |

#### Funções JS para controle dinâmico

```js
// Retorna style inline com intensidade customizada
felixoGlowIntensityStyle(percent) → { '--felixo-glow-intensity': percent / 100 }

// Retorna classe utilitária mais próxima
getFelixoGlowClass(percent) → 'felixo-glow-intensity-25' | '50' | '75' | '100' | '150'
```

### 6.3 Glow de Texto (Text Glow)

#### `.text-felixo-purple-glow` — Texto Roxo Respirante

Classe principal para textos de destaque. Combina cor roxa vibrante com duas animações simultâneas:

```css
.text-felixo-purple-glow {
  color: #A855F7;
  text-shadow: 0 0 8px rgba(168,85,247 / 0.55),
               0 0 44px rgba(168,85,247 / 0.32);
  animation: title-glow-purple 3s ease-in-out infinite,
             text-glow-breathe 3.8s ease-in-out infinite;
}
```

| Propriedade | Descrição |
|-------------|-----------|
| **Cor** | `#A855F7` (roxo vibrante, mais brilhante que o estático) |
| **text-shadow interna** | 8px blur, opacidade 55% — halo próximo |
| **text-shadow externa** | 44px blur, opacidade 32% — aura difusa |
| **Animação 1** | `title-glow-purple` (3s) — varia o `filter: drop-shadow` |
| **Animação 2** | `text-glow-breathe` (3.8s) — varia `text-shadow` + `filter` |
| **Dessincronia** | Durações diferentes (3s vs 3.8s) para evitar padrão previsível |

#### `.text-felixo-purple` — Texto Roxo Estático (sem glow)

```css
.text-felixo-purple {
  color: #C084FC; /* roxo mais suave, sem animação */
}
```

#### `.text-glow-white` — Glow Branco Estático

```css
.text-glow-white {
  text-shadow: 0 0 5px rgba(255,255,255,0.35),
               0 0 20px rgba(255,255,255,0.15);
}
```

#### `.glowing-spinning-text` — Texto Branco Respirante

```css
.glowing-spinning-text {
  color: #FFFFFF;
  animation: glow-effect 3s ease-in-out infinite;
}
```

Usa a animação `glow-effect` que varia o `text-shadow` branco entre:
- Mínimo: `8px/20px` blur, opacidade `0.7/0.5`
- Máximo: `15px/30px` blur, opacidade `1.0/0.8`

### 6.4 Glow de Cards (Card Glow)

Sistema de classes para aplicar brilho pulsante nas bordas e sombras de cards:

| Classe | Animação | Duração | Cor | Uso |
|--------|----------|---------|-----|-----|
| `felixo-card-glow` | `card-glow-breathe` | 3s | Roxo | Card padrão com destaque |
| `hover-felixo-card-glow` | `card-glow-breathe` (hover) | 3s | Roxo | Ativa apenas no hover |
| `felixo-card-glow-intense-hover` | `card-glow-breathe-intense-hover` | 2.5s | Roxo | Card em foco na grade |
| `felixo-card-glow-subtle` | `card-glow-breathe-subtle` | 3s | Roxo | Cards adjacentes (vizinhos) |
| `felixo-card-glow-white` | `card-glow-breathe-white` | 3s | Branco | Alternativa branca |
| `hover-felixo-card-glow-white` | `card-glow-breathe-white` (hover) | 3s | Branco | Branca apenas no hover |
| `felixo-card-glow-intense` | `card-glow-breathe-intense` | 5s | Branco | Destaque branco intenso |

#### Valores de Box-Shadow por Variante

| Variante | Mínimo | Máximo |
|----------|--------|--------|
| **Roxo Padrão** | `0 0 15px rgba(168,85,247,0.15)` | `0 0 40px rgba(168,85,247,0.45)` |
| **Roxo Intenso** | `0 0 20px rgba(168,85,247,0.25)` | `0 0 55px rgba(168,85,247,0.65)` |
| **Roxo Sutil** | `0 0 8px rgba(168,85,247,0.1)` | `0 0 15px rgba(168,85,247,0.2)` |
| **Branco Padrão** | `0 0 15px rgba(255,255,255,0.15)` | `0 0 40px rgba(255,255,255,0.45)` |
| **Branco Intenso** | `0 0 10px rgba(255,255,255,0.25)` | `0 0 30px rgba(255,255,255,0.6)` |

#### Padrão de Proximidade na Grade de Projetos

Quando o usuário passa o mouse sobre um card na grade, um sistema de destaque por proximidade é ativado:

```
[ Card Sutil ] [ Card Sutil ] [ Card Distante ]
[ Card Sutil ] [ CARD HOVER ] [ Card Sutil    ]
[ Card Sutil ] [ Card Sutil ] [ Card Distante ]
```

| Estado | Classe | Efeito |
|--------|--------|--------|
| **Em hover** | `felixo-card-glow-intense-hover` | Glow roxo intenso + pulsação rápida (2.5s) |
| **Adjacente** | `felixo-card-glow-subtle` | Glow roxo suave |
| **Distante** | `card-faded` | `opacity: 0.2` (esmaecido) |

### 6.5 Glow de Input (Focus Glow)

Inputs recebem um glow roxo quando em foco:

```css
.input-glowing-border:focus {
  box-shadow: 0 0 0 2px rgba(168,85,247,0.4),  /* anel interno */
              0 0 0 4px rgba(168,85,247,0.2);   /* anel externo */
  border-color: rgba(168,85,247,0.6);
}
```

### 6.6 Glow da Foto de Perfil

A foto de perfil na seção About combina duas camadas de glow roxo com animação de respiração dessincronizada:

| Classe | Animações | Direção |
|--------|-----------|---------|
| `animate-photo-glow-1` | `photo-glow-breathe 3s` + `gradient-orbit 7.5s` | Normal |
| `animate-photo-glow-2` | `photo-glow-breathe 3s (delay 0.5s)` + `gradient-orbit 7.5s` | Reverso |

- **`photo-glow-breathe`**: Varia opacidade entre `0.6` e `1.0` (3s).
- **`gradient-orbit`**: Move a posição do gradiente de fundo em uma órbita circular (7.5s).
- **Dessincronia**: O delay de 0.5s e a direção reversa entre as camadas cria um efeito de "luz viva" ao redor da foto.

### 6.7 Órbita de Luz (About Section)

A foto de perfil possui também uma órbita de luz giratória com dois pontos luminosos:

#### Estrutura CSS

| Classe | Função |
|--------|--------|
| `about-orbit` | Container da órbita, com `overflow: hidden` |
| `about-orbit::before` | Borda circular estática (`border 1px rgba(255,255,255,0.08)`) |
| `about-orbit-dot` | Ponto de luz branco (8px) com glow |
| `about-orbit-dot::after` | Rastro de luz (70px) que segue o ponto |
| `about-orbit-a` | Velocidade da órbita A: `6s linear infinite` |
| `about-orbit-b` | Velocidade da órbita B: `8.5s linear infinite` |

#### Detalhes do Ponto de Luz

```css
.about-orbit-dot {
  width: 8px; height: 8px;
  background: rgba(255,255,255,0.95);
  box-shadow: 0 0 10px rgba(255,255,255,0.65),
              0 0 22px rgba(255,255,255,0.25);
}
```

#### Rastro de Luz (Trail)

```css
.about-orbit-dot::after {
  width: 70px; height: 2px;
  background: linear-gradient(90deg,
    rgba(255,255,255,0.0) 0%,
    rgba(255,255,255,0.25) 55%,
    rgba(255,255,255,0.75) 100%
  );
  filter: blur(0.5px);
}
```

- Dois pontos giram em velocidades diferentes (6s e 8.5s) para criar assincronia.
- O segundo ponto começa na posição oposta (`top: 100%`) com opacidade reduzida (`0.85`).

### 6.8 Gradientes de Texto com Glow

Títulos de seções usam gradientes de texto animados com glow colorido:

#### Variantes Disponíveis

| Classe | Gradiente | Glow | Uso |
|--------|-----------|------|-----|
| `animate-title-glow` | — | Verde (`#22C55E`) | Títulos verdes |
| `animate-title-glow-purple` | — | Roxo (`#A855F7`) | Títulos roxos |
| `animate-title-glow-ts` | — | Azul TS (`#3178C6`) | Títulos TypeScript |
| `text-gradient-glow-purple` | `white → #10b981 → white` | Roxo | Gradiente com glow roxo |
| `text-gradient-glow-python` | `white → #3776AB → white` | Azul Python | Gradiente com glow azul |
| `text-gradient-glow-amethyst` | `white → #A855F7 → white` | Roxo | Gradiente roxo puro |

#### Receita de um Gradiente de Texto

```css
.text-gradient-glow-[nome] {
  /* 1. Gradiente de fundo recortado no texto */
  background: linear-gradient(to right, white, [COR], white);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;

  /* 2. Animação de glow (respiração) + órbita do gradiente */
  animation: title-glow-[nome] 3s ease-in-out infinite,
             gradient-orbit 7.5s linear infinite;
  background-size: 220% 220%;

  /* 3. Sombra de texto na cor do glow */
  text-shadow: 0 0 6px rgba([r,g,b], 0.45),
               0 0 34px rgba([r,g,b], 0.25);
}
```

- O `background-size: 220%` garante que o gradiente seja maior que o elemento, permitindo a animação orbital.
- A animação `gradient-orbit` move o `background-position` em 4 pontos cardeais, criando o efeito de luz percorrendo o texto.

### 6.9 Ciclo de Cores das Tecnologias

A seção About possui um glow radial que percorre todas as cores das tecnologias:

```css
.animate-tech-glow {
  background-image: radial-gradient(circle at center, var(--tech-glow-color), transparent 70%);
  animation: tech-colors-cycle 25s linear infinite,
             gradient-orbit 7.5s linear infinite;
}
```

- **Duração**: 25s para o ciclo completo de 14 cores.
- **Transição suave**: Usa `@property --tech-glow-color` com `syntax: '<color>'` para permitir interpolação CSS nativa entre as cores.
- **Opacidade**: Cada cor usa `0.12` de alpha — glow extremamente sutil.
- A órbita de gradiente (7.5s) adiciona movimento espacial ao glow radial.

### 6.10 Animação Orbital de Gradiente

A animação `gradient-orbit` é reutilizada em múltiplos efeitos. Ela move o `background-position` em um ciclo de 4 pontos:

```css
@keyframes gradient-orbit {
  0%   { background-position: 50% 0%;   }  /* topo-centro */
  25%  { background-position: 100% 50%; }  /* direita-centro */
  50%  { background-position: 50% 100%; }  /* baixo-centro */
  75%  { background-position: 0% 50%;   }  /* esquerda-centro */
  100% { background-position: 50% 0%;   }  /* volta ao topo */
}
```

- **Duração padrão**: 7.5s
- **Easing**: `linear` (velocidade constante, movimento orbital)
- **Requer**: `background-size` maior que `100%` (tipicamente `200%` ou `220%`)
- **Usada em**: gradientes de texto, glow de foto, ciclo de cores tech

---

## 7. PADRÕES TÉCNICOS

### 7.1 Convenções de Nomenclatura

#### Arquivos
- **Componentes**: `kebab-case.jsx` (ex: `portfolio-card.jsx`)
- **Seções**: `kebab-case.jsx` (ex: `hero.jsx`)
- **Utilitários**: `kebab-case.js` (ex: `utils.js`)

#### Classes CSS Customizadas
- **Prefixo Felixo**: `felixo-*` (ex: `felixo-card-glow`)
- **Prefixo About**: `about-*` (ex: `about-orbit`)
- **Estados**: `hover-*`, `animate-*`

#### Variáveis CSS
```css
--felixo-glow-intensity: 1;
--tech-glow-color: rgba(...);
```

### 7.2 Organização de Pastas

```
src/
├── assets/
│   ├── images/
│   └── readmes/
├── components/
│   ├── layout/      (navbar, footer)
│   ├── parts/       (portfolio-card)
│   └── ui/          (button, card, badge, input, modais)
├── data/            (projects.jsx)
├── pages/           (páginas específicas)
├── sections/        (seções da home)
├── utils/           (funções auxiliares)
├── App.jsx
├── index.css
└── main.jsx
```

### 7.3 Regras Implícitas de Design

#### Consistência de Brilho (Glow)
- **Roxo**: Marca Felixo, elementos principais
- **Branco**: Elementos secundários, alternativas
- **Cores de Tech**: Badges e títulos específicos

#### Hierarquia de Z-Index
- **Navbar**: `z-40`
- **Modais**: `z-50`
- **Partículas de Fundo**: `z-0` (implícito)
- **Conteúdo**: `z-10`

#### Responsividade
- **Mobile First**: Classes base sem prefixo
- **Breakpoints**: `md:`, `lg:` para ajustes
- **Grid Adaptativo**: 1 → 2 → 3 colunas

### 7.4 Funções Utilitárias

#### cx(...classes)
Combina classes condicionalmente, removendo valores falsy.

#### loop(arr)
Triplica array para carrossel infinito.

#### getTagColor(tag)
Retorna classes Tailwind baseadas na tecnologia.

#### felixoGlowIntensityStyle(percent)
Retorna objeto de estilo com intensidade customizada.

#### getFelixoGlowClass(percent)
Retorna classe utilitária de intensidade (25/50/75/100/150).

## 8. INCONSISTÊNCIAS E OPORTUNIDADES

### 8.1 Inconsistências Identificadas

1. **Border Radius Variável**
   - Cards usam `rounded-2xl` e `rounded-3xl` sem padrão claro
   - **Sugestão**: Padronizar `rounded-3xl` para cards grandes, `rounded-2xl` para cards pequenos

2. **Padding de Cards**
   - `p-5` (20px) é padrão, mas alguns usam `p-6` (24px)
   - **Sugestão**: Documentar quando usar cada um

3. **Animações de Glow**
   - Múltiplas variações similares (`card-glow-breathe`, `card-glow-breathe-intense`, etc.)
   - **Sugestão**: Consolidar em uma animação com variáveis CSS

4. **Nomenclatura de Cores**
   - `felixo-purple` vs `felixo-purple-bright` não é intuitivo
   - **Sugestão**: Renomear para `felixo-purple-400` e `felixo-purple-500` (seguindo padrão Tailwind)

### 8.2 Estilos Duplicados

1. **Gradientes de Fundo**
   - Múltiplos gradientes similares em diferentes seções
   - **Sugestão**: Criar classes utilitárias reutilizáveis

2. **Efeitos de Shimmer**
   - Código repetido em vários botões
   - **Sugestão**: Criar componente `ShimmerButton`

3. **Estrutura de Modal**
   - Overlay e container repetidos
   - **Sugestão**: Criar componente base `Modal` reutilizável

### 8.3 Melhorias Sugeridas

#### Tokens de Design
Criar arquivo de tokens centralizados:
```js
// design-tokens.js
export const colors = {
  brand: {
    purple: '#C084FC',
    purpleBright: '#A855F7',
  },
  // ...
};

export const spacing = {
  section: 'py-14',
  card: 'p-5',
  // ...
};
```

#### Sistema de Variantes
Expandir componentes com mais variantes:
- Button: adicionar `size="lg"` e `size="xs"`
- Card: adicionar variantes `elevated`, `flat`, `outlined`

#### Acessibilidade
- Adicionar `aria-label` em todos os botões de ícone
- Garantir contraste mínimo de 4.5:1 em textos
- Adicionar estados de `focus-visible` mais visíveis

#### Performance
- Usar `will-change` apenas em animações ativas
- Lazy load de imagens
- Code splitting por seção

#### Documentação de Componentes
Adicionar Storybook ou similar para visualizar todos os componentes isoladamente.

---

**Versão**: 1.0  
**Última Atualização**: 2024  
**Tecnologias**: React 18, Tailwind CSS 3, Framer Motion 10

---

> **Assinatura de Origem**  
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.  
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design  
> Data desta versão: 2026-03-23  
> Sugestões e pull requests são bem-vindos.
