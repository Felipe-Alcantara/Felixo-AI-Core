# ✨ GUIA-PARTICULAS-E-SISTEMA-DE-GLOW-REUTILIZAVEIS-DO-FELIPE-SALA-BOARD.md

> **O que é**: Um guia reutilizável para construir um **background de partículas flutuantes animadas** com Framer Motion e um **sistema completo de efeitos de glow CSS** controlado por variável de intensidade.
>
> **De onde vem**: Este padrão foi extraído do componente `BackgroundParticles.tsx` e do CSS global `index.css` do projeto **Felipe Sala Board**.
>
> **Qual é o propósito dentro de `guias/`**: Registrar essa solução como um bloco reaproveitável do `Felixo System Design`, separando o padrão técnico do restante do produto original.
>
> **Quando usar**: Páginas de landing, portfólios, dashboards com identidade visual forte, telas de login, pages de loading e qualquer interface dark-theme que precise de profundidade visual e efeitos de glow sem atrapalhar a interação principal.

Este documento não tenta explicar o `Felipe Sala Board` inteiro. O foco aqui é isolar o sistema de partículas e os efeitos de glow CSS que resolveram esse caso de uso e podem ser transportados para outros projetos.

---

## Visão geral

O sistema é composto por **2 subsistemas independentes**:

| Subsistema | Arquivo | O que faz |
|---|---|---|
| **Partículas flutuantes** | `BackgroundParticles.tsx` | 35 círculos animados subindo com opacidade variável |
| **Glow CSS** | `index.css` | Classes utilitárias para glow em cards, texto e inputs com intensidade controlável |

Os dois funcionam separadamente. Você pode usar apenas as partículas ou apenas o glow.

---

## 1. Partículas flutuantes — BackgroundParticles

### Anatomia visual

```
┌─────────────────────────────── viewport ──────────────────────────────┐
│                    ·                                                   │
│        ·                          ·                                    │
│                                         ·                ·            │
│   ·                    ·                                              │
│              ·                                    ·                   │
│                             ·           ·                             │
│     ·              ·                                    ·             │
│                                    ·                                  │
│          ·                                  ·                         │
│                    ·        ·                         ·               │
│   ·                                                                   │
│              ·                    ·                                    │
│                         ·                                ·            │
│ (partículas sobem continuamente e desaparecem no topo)                │
└───────────────────────────────────────────────────────────────────────┘
```

### Implementação completa

```tsx
import { useMemo } from 'react';
import { motion } from 'framer-motion';

interface Particle {
  id: number;
  x: number;        // posição horizontal (0-100%)
  y: number;        // posição vertical inicial (0-100%)
  size: number;     // diâmetro em px (2-6)
  duration: number; // duração da animação (4-12s)
  delay: number;    // delay inicial (0-2s)
  opacity: number;  // opacidade máxima (0.5-1)
}

const PARTICLE_COUNT = 35;

export default function BackgroundParticles() {
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, id) => ({
        id,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 4 + 2,
        duration: Math.random() * 8 + 4,
        delay: Math.random() * 2,
        opacity: Math.random() * 0.5 + 0.5
      })),
    []
  );

  return (
    <div
      aria-hidden
      className="pointer-events-none select-none fixed inset-0 z-0 overflow-hidden"
    >
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-purple-200 shadow-[0_0_15px_rgba(192,132,252,0.8)] blur-[0.5px]"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size
          }}
          animate={{ y: [0, -150], opacity: [0, p.opacity, 0] }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            ease: 'linear',
            delay: p.delay
          }}
        />
      ))}
    </div>
  );
}
```

### Pontos-chave

- **`useMemo` com `[]`** → Partículas são geradas uma vez e nunca recalculadas
- **`fixed inset-0 z-0`** → Cobre toda a viewport, fica atrás de todo conteúdo
- **`pointer-events-none`** → Não interfere com cliques
- **`aria-hidden`** → Invisível para leitores de tela
- **`overflow-hidden`** → Partículas que saem do viewport não criam scroll
- **Animação** → `y: [0, -150]` faz subir 150px; `opacity: [0, max, 0]` faz fade-in e fade-out
- **`blur-[0.5px]`** → Suaviza as bordas para parecer mais orgânico
- **`shadow-[0_0_15px_rgba(192,132,252,0.8)]`** → Glow roxo em cada partícula

### Customizações comuns

| O que | Onde mexer | Valor padrão |
|---|---|---|
| **Quantidade** | `PARTICLE_COUNT` | 35 |
| **Cor** | `bg-purple-200` e `rgba(192,132,252)` no shadow | Roxo claro |
| **Tamanho** | `Math.random() * 4 + 2` | 2-6px |
| **Velocidade** | `Math.random() * 8 + 4` | 4-12s |
| **Distância de subida** | `y: [0, -150]` | 150px |
| **Direção** | Mude `y` para `x` no `animate` | Para cima |
| **Blur** | `blur-[0.5px]` | Muito sutil |

### Variações

**Partículas caindo** (neve):
```typescript
animate={{ y: [0, 150], opacity: [0, p.opacity, 0] }}
```

**Partículas flutuando lateralmente**:
```typescript
animate={{ x: [-50, 50], y: [-20, 20], opacity: [0, p.opacity, 0] }}
```

**Cor diferente** (azul):
```
className="... bg-blue-200 shadow-[0_0_15px_rgba(96,165,250,0.8)]"
```

---

## 2. Sistema de Glow CSS

### Variável de intensidade

Todo o sistema de glow é controlado por uma única CSS variable:

```css
:root {
  --felixo-glow-intensity: 1;
}
```

Classes utilitárias para ajustar a intensidade:

```css
.felixo-glow-intensity-25  { --felixo-glow-intensity: 0.25; }
.felixo-glow-intensity-50  { --felixo-glow-intensity: 0.5; }
.felixo-glow-intensity-75  { --felixo-glow-intensity: 0.75; }
.felixo-glow-intensity-100 { --felixo-glow-intensity: 1; }
.felixo-glow-intensity-150 { --felixo-glow-intensity: 1.5; }
```

**Uso**: Aplique no container pai para controlar intensidade de todos os glows filhos:

```html
<div class="felixo-glow-intensity-50">
  <div class="felixo-card-glow">Glow suave</div>
</div>
```

---

### Glow de Cards

#### Roxo padrão (respiração)

```css
.felixo-card-glow {
  animation: card-glow-breathe 3s ease-in-out infinite;
  transition: box-shadow 0.3s ease;
}

@keyframes card-glow-breathe {
  0%, 100% {
    box-shadow: 0 0 calc(15px * var(--felixo-glow-intensity)) rgba(168, 85, 247, calc(0.15 * var(--felixo-glow-intensity)));
  }
  50% {
    box-shadow: 0 0 calc(40px * var(--felixo-glow-intensity)) rgba(168, 85, 247, calc(0.45 * var(--felixo-glow-intensity)));
  }
}
```

#### Roxo sutil (para cards secundários)

```css
.felixo-card-glow-subtle {
  animation: card-glow-breathe-subtle 3s ease-in-out infinite;
}

@keyframes card-glow-breathe-subtle {
  0%, 100% { box-shadow: 0 0 calc(8px * var(--felixo-glow-intensity)) rgba(168, 85, 247, calc(0.1 * var(--felixo-glow-intensity))); }
  50% { box-shadow: 0 0 calc(15px * var(--felixo-glow-intensity)) rgba(168, 85, 247, calc(0.2 * var(--felixo-glow-intensity))); }
}
```

#### Roxo intenso no hover

```css
.felixo-card-glow-intense-hover:hover {
  animation: card-glow-breathe-intense-hover 2.5s ease-in-out infinite;
}

@keyframes card-glow-breathe-intense-hover {
  0%, 100% { box-shadow: 0 0 calc(20px * var(--felixo-glow-intensity)) rgba(168, 85, 247, calc(0.25 * var(--felixo-glow-intensity))); }
  50% { box-shadow: 0 0 calc(55px * var(--felixo-glow-intensity)) rgba(168, 85, 247, calc(0.65 * var(--felixo-glow-intensity))); }
}
```

#### Branco padrão

```css
.felixo-card-glow-white {
  animation: card-glow-breathe-white 3s ease-in-out infinite;
}

@keyframes card-glow-breathe-white {
  0%, 100% { box-shadow: 0 0 calc(15px * var(--felixo-glow-intensity)) rgba(255, 255, 255, calc(0.15 * var(--felixo-glow-intensity))); }
  50% { box-shadow: 0 0 calc(40px * var(--felixo-glow-intensity)) rgba(255, 255, 255, calc(0.45 * var(--felixo-glow-intensity))); }
}
```

#### Branco intenso

```css
.felixo-card-glow-intense {
  animation: card-glow-breathe-intense 5s ease-in-out infinite;
}

@keyframes card-glow-breathe-intense {
  0%, 100% { box-shadow: 0 0 calc(10px * var(--felixo-glow-intensity)) rgba(255, 255, 255, calc(0.25 * var(--felixo-glow-intensity))); }
  50% { box-shadow: 0 0 calc(30px * var(--felixo-glow-intensity)) rgba(255, 255, 255, calc(0.6 * var(--felixo-glow-intensity))); }
}
```

### Hierarquia de intensidade de glow

| Classe | Intensidade | Uso recomendado |
|---|---|---|
| `felixo-card-glow-subtle` | Baixa | Cards adjacentes, elementos de fundo |
| `felixo-card-glow` | Média | Card principal, destaque padrão |
| `felixo-card-glow-intense-hover` | Alta (no hover) | Cards interativos |
| `felixo-card-glow-intense` | Alta (constante) | Hero, CTA, elemento focal |

---

### Glow de Texto

#### Texto roxo com glow

```css
.text-felixo-purple {
  color: #C084FC;
}

.text-felixo-purple-glow {
  color: #A855F7;
  text-shadow:
    0 0 8px rgba(168, 85, 247, 0.55),
    0 0 44px rgba(168, 85, 247, 0.32);
  animation:
    title-glow-purple 3s ease-in-out infinite,
    text-glow-breathe 3.8s ease-in-out infinite;
}
```

Combina **duas animações** com durações diferentes (3s e 3.8s) para criar um efeito de respiração orgânico e não repetitivo.

#### Texto branco com glow

```css
.text-glow-white {
  text-shadow:
    0 0 5px rgba(255, 255, 255, 0.35),
    0 0 20px rgba(255, 255, 255, 0.15);
}
```

Sem animação — glow estático para destaque sutil.

#### Texto branco girante (spinning glow)

```css
.glowing-spinning-text {
  color: #FFFFFF;
  animation: glow-effect 3s ease-in-out infinite;
}

@keyframes glow-effect {
  0%, 100% {
    text-shadow:
      0 0 8px rgba(255, 255, 255, 0.7),
      0 0 20px rgba(255, 255, 255, 0.5);
  }
  50% {
    text-shadow:
      0 0 15px rgba(255, 255, 255, 1),
      0 0 30px rgba(255, 255, 255, 0.8);
  }
}
```

---

### Glow de Input em Foco

```css
.input-glowing-border:focus {
  box-shadow:
    0 0 0 2px rgba(168, 85, 247, 0.4),
    0 0 0 4px rgba(168, 85, 247, 0.2);
  border-color: rgba(168, 85, 247, 0.6);
  outline: none;
}
```

Substitui o outline padrão por um glow roxo duplo. Use em `<input>` e `<textarea>`.

---

### Animações de transição de página

```css
@keyframes slide-in-right {
  from { opacity: 0; transform: translateX(60px); }
  to   { opacity: 1; transform: translateX(0); }
}

@keyframes slide-in-left {
  from { opacity: 0; transform: translateX(-60px); }
  to   { opacity: 1; transform: translateX(0); }
}

.animate-slide-right { animation: slide-in-right 0.3s ease-out both; }
.animate-slide-left  { animation: slide-in-left 0.3s ease-out both; }
```

---

## 3. Estilos base do tema

### Body

```css
body {
  @apply font-sans antialiased bg-gradient-to-b from-black via-zinc-950 to-black text-zinc-50;
}
```

### Seleção de texto

```css
::selection {
  background-color: rgba(168, 85, 247, 0.4);
}
```

### Scrollbar customizada

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

---

## 4. Configuração do Tailwind

Para usar as cores do Felixo em classes Tailwind:

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        'felixo-purple': '#C084FC',
        'felixo-purple-bright': '#A855F7'
      },
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif']
      }
    }
  }
};
```

---

## 5. Como reutilizar em outro projeto

### Passo 1: Escolher o que copiar

| Componente | Dependências | Arquivo |
|---|---|---|
| Partículas | React + Framer Motion | `BackgroundParticles.tsx` |
| Glow CSS | Tailwind CSS | Seções do `index.css` |
| Tema base | Tailwind CSS | Seções do `index.css` |

### Passo 2: Instalar dependências (se usar partículas)

```bash
npm install framer-motion
```

### Passo 3: Copiar o CSS

Copie as seções relevantes do CSS para o seu arquivo global. As classes são independentes — copie apenas o que precisa:

| Seção | Classes |
|---|---|
| **Card glow** | `.felixo-card-glow`, `-subtle`, `-intense-hover`, `-white`, `-intense` |
| **Texto glow** | `.text-felixo-purple-glow`, `.text-glow-white`, `.glowing-spinning-text` |
| **Input glow** | `.input-glowing-border` |
| **Intensidade** | `.felixo-glow-intensity-25/50/75/100/150` |
| **Transições** | `.animate-slide-right`, `.animate-slide-left` |
| **Tema** | Body, scrollbar, seleção |

### Passo 4: Montar o BackgroundParticles

```tsx
import BackgroundParticles from './components/BackgroundParticles';

function App() {
  return (
    <>
      <BackgroundParticles />
      <main className="relative z-10">
        {/* Seu conteúdo aqui — z-10 garante que fique acima das partículas */}
      </main>
    </>
  );
}
```

### Passo 5: Customizar cores

Para trocar roxo por outra cor, substitua `rgba(168, 85, 247, ...)` nos keyframes e `#C084FC` / `#A855F7` nas classes de texto. Use uma ferramenta de conversão hex → rgba.

---

## 6. Referência de arquivos (no projeto original)

| Arquivo | O que faz |
|---|---|
| `src/components/BackgroundParticles.tsx` | 35 partículas flutuantes com Framer Motion |
| `src/index.css` | Sistema de glow CSS + tema base + transições de página |
| `tailwind.config.js` | Cores e fonte do Felixo |

---

## Resumo da receita

1. **Partículas**: 35 círculos `motion.div` com posição/tamanho/timing randomizados
2. **Geração**: `useMemo` + `Array.from` para criar dados uma vez
3. **Animação**: `y: [0, -150]` + `opacity: [0, max, 0]` em loop infinito
4. **Não-intrusivo**: `pointer-events-none`, `aria-hidden`, `z-0`
5. **Glow de cards**: 5 variantes com `box-shadow` animado via keyframes
6. **Glow de texto**: Combinação de `text-shadow` + `filter: drop-shadow` com durações desalinhadas
7. **Intensidade**: `--felixo-glow-intensity` controla todos os efeitos via `calc()`
8. **Input glow**: Substitui outline padrão por anel roxo duplo
9. **Tema**: Body com gradiente escuro, scrollbar customizada, seleção roxa

---

> **Assinatura de Origem**
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design
> Data desta versão: 2026-05-23
> Sugestões e pull requests são bem-vindos.
