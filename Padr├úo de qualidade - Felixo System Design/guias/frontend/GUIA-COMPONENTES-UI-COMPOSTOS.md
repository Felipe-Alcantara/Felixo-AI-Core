# 🧩 GUIA-COMPONENTES-UI-COMPOSTOS-REUTILIZAVEIS-DO-FELIPE-SALA-BOARD.md

> **O que é**: Um guia reutilizável para construir um **kit de componentes UI compostos** com Card (compound component), Button (variantes + tamanhos), Badge e utilitário de classnames — tudo em TypeScript, Tailwind CSS e zero dependências externas.
>
> **De onde vem**: Este padrão foi extraído da pasta `src/components/ui/` do projeto **Felipe Sala Board**.
>
> **Qual é o propósito dentro de `guias/`**: Registrar essa solução como um bloco reaproveitável do `Felixo System Design`, separando o padrão técnico do restante do produto original.
>
> **Quando usar**: Qualquer projeto React + Tailwind que precise de componentes base consistentes sem instalar bibliotecas pesadas como shadcn/ui, Radix ou Material UI. Ideal para projetos escolares, MVPs e protótipos rápidos.

Este documento não tenta explicar o `Felipe Sala Board` inteiro. O foco aqui é isolar os 4 componentes UI e o padrão de composição que resolveram esse caso de uso e podem ser transportados para outros projetos.

---

## Visão geral

O kit contém **4 peças** exportadas de um barrel file:

| Componente | Tipo | O que faz |
|---|---|---|
| **cx** | Utilitário | Junta classes CSS condicionalmente (substitui `clsx`) |
| **Card** | Compound component | Container com subcomponentes (Header, Content, Footer, Title, Description) |
| **Button** | Componente com variantes | 4 variantes × 3 tamanhos + estado ativo |
| **Badge** | Componente simples | Pill inline para tags e labels |

### Barrel file

```typescript
// ui/index.ts
export { default as Button } from './Button';
export { default as Badge } from './Badge';
export { Card, CardHeader, CardContent, CardFooter, CardTitle, CardDescription } from './Card';
export { cx } from './cx';
```

---

## 1. cx — Utilitário de classnames

```typescript
// ui/cx.ts
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
```

### Por que não usar `clsx` ou `classnames`?

- **Zero dependências**: 1 linha de código vs 1 pacote no `node_modules`
- **Tipagem nativa**: Aceita `string | false | null | undefined` sem configuração
- **Suficiente**: Cobre 95% dos casos de uso (classes condicionais com `&&` ou ternário)

### Uso

```tsx
<div className={cx(
  'rounded-xl border p-4',                    // sempre
  isActive && 'ring-2 ring-purple-500',       // condicional (false → filtrado)
  variant === 'dark' ? 'bg-black' : 'bg-white', // ternário
  className                                    // passado por prop (pode ser undefined)
)} />
```

---

## 2. Card — Compound Component

### O que é compound component?

Um componente que expõe subcomponentes composáveis. O consumidor monta a estrutura que precisa:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Meu Card</CardTitle>
    <CardDescription>Descrição curta</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Conteúdo principal</p>
  </CardContent>
  <CardFooter>
    <Button>Ação</Button>
  </CardFooter>
</Card>
```

### Implementação

```typescript
// ui/Card.tsx
import { HTMLAttributes } from 'react';
import { cx } from './cx';

type DivProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...rest }: DivProps) {
  return (
    <div
      className={cx('rounded-3xl border bg-zinc-950/50 border-white/10', className)}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: DivProps) {
  return <div className={cx('p-5 border-b border-white/5', className)} {...rest} />;
}

export function CardContent({ className, ...rest }: DivProps) {
  return <div className={cx('p-5', className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: DivProps) {
  return (
    <div
      className={cx('p-5 border-t border-white/5 flex items-center gap-3', className)}
      {...rest}
    />
  );
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cx('text-base font-semibold', className)} {...rest} />;
}

export function CardDescription({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx('text-xs text-zinc-400', className)} {...rest} />;
}
```

### Pontos-chave

- **Cada subcomponente aceita `className`** → O consumidor pode customizar qualquer parte
- **`...rest`** → Passa todos os atributos HTML nativos (onClick, id, role, etc.)
- **Sem estado interno** → Pura composição visual, sem lógica
- **`rounded-3xl`** → Bordas bem arredondadas para o visual Felixo
- **`bg-zinc-950/50`** → Background escuro semi-transparente com glassmorphism
- **`border-white/10`** → Borda sutil que define limites sem peso visual
- **`border-b border-white/5`** → Separadores internos muito sutis

### Anatomia visual

```
┌─────────────────────────── Card ───────────────────────────┐
│                    rounded-3xl border                       │
│ ┌─────────────────── CardHeader ──────────────────────────┐│
│ │ p-5 border-b border-white/5                             ││
│ │ ┌── CardTitle ──┐ ┌── CardDescription ──┐               ││
│ │ │ text-base     │ │ text-xs text-zinc-400│               ││
│ │ │ font-semibold │ │                      │               ││
│ │ └───────────────┘ └──────────────────────┘               ││
│ └─────────────────────────────────────────────────────────┘│
│ ┌─────────────────── CardContent ─────────────────────────┐│
│ │ p-5                                                      ││
│ │ (conteúdo livre)                                         ││
│ └─────────────────────────────────────────────────────────┘│
│ ┌─────────────────── CardFooter ──────────────────────────┐│
│ │ p-5 border-t border-white/5 flex items-center gap-3     ││
│ └─────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

---

## 3. Button — Variantes e tamanhos

### Implementação

```typescript
// ui/Button.tsx
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cx } from './cx';

type Variant = 'default' | 'outline' | 'ghost' | 'secondary';
type Size = 'sm' | 'md' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  active?: boolean;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-2xl text-sm font-medium transition shadow-sm border';

const variants: Record<Variant, string> = {
  default: 'bg-white text-black border-white/10 hover:bg-zinc-100',
  outline: 'bg-transparent text-white border-white/20 hover:bg-white/5',
  ghost: 'bg-transparent text-white border-transparent hover:bg-white/5',
  secondary: 'bg-zinc-800 text-white border-white/10 hover:bg-zinc-700'
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3',
  md: 'h-10 px-4',
  icon: 'h-12 w-12 p-2'
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', active = false, className, ...rest },
  ref
) {
  const activeRing = active ? 'ring-2 ring-felixo-purple/60 border-felixo-purple/40' : '';
  return (
    <button
      ref={ref}
      className={cx(base, variants[variant], sizes[size], activeRing, className)}
      {...rest}
    />
  );
});

export default Button;
```

### Matriz de variantes

| Variante | Background | Texto | Borda | Hover |
|---|---|---|---|---|
| **default** | Branco | Preto | white/10 | zinc-100 |
| **outline** | Transparente | Branco | white/20 | white/5 |
| **ghost** | Transparente | Branco | Transparente | white/5 |
| **secondary** | zinc-800 | Branco | white/10 | zinc-700 |

### Tamanhos

| Tamanho | Altura | Padding | Uso |
|---|---|---|---|
| **sm** | h-9 (36px) | px-3 | Botões secundários, ações inline |
| **md** | h-10 (40px) | px-4 | Padrão |
| **icon** | h-12 w-12 (48px) | p-2 | Botões com ícone, sem texto |

### Estado ativo

```tsx
<Button variant="outline" active={selectedTab === 'home'}>Home</Button>
```

Quando `active={true}`, aplica `ring-2 ring-felixo-purple/60` — anel roxo ao redor do botão.

### Pontos-chave

- **`forwardRef`** → Permite que o componente pai acesse a ref do botão nativo (necessário para tooltips, menus dropdown, etc.)
- **`Record<Variant, string>`** → Mapa tipado para garantir que todas as variantes tenham classes
- **`rounded-2xl`** → Arredondamento consistente com o Card (que usa `rounded-3xl`)

---

## 4. Badge — Componente simples

```typescript
// ui/Badge.tsx
import { HTMLAttributes } from 'react';
import { cx } from './cx';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {}

export default function Badge({ className, ...rest }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border border-white/10',
        className
      )}
      {...rest}
    />
  );
}
```

### Uso

```tsx
<Badge className="bg-green-500/20 text-green-300">Concluído</Badge>
<Badge className="bg-yellow-500/20 text-yellow-300">Em andamento</Badge>
<Badge className="bg-red-500/20 text-red-300">Atrasado</Badge>
```

**Design**: O Badge define apenas a estrutura (pill, padding, fonte). A cor é responsabilidade do consumidor via `className`. Isso evita uma explosão de variantes internas.

---

## 5. Como reutilizar em outro projeto

### Passo 1: Criar a pasta de componentes

```
src/
  components/
    ui/
      cx.ts
      Card.tsx
      Button.tsx
      Badge.tsx
      index.ts
```

### Passo 2: Copiar os 5 arquivos

Copie os arquivos exatamente como estão. Eles são independentes entre si (exceto que Card e Button importam `cx`).

### Passo 3: Registrar a cor Felixo no Tailwind (se usar estado ativo)

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        'felixo-purple': '#C084FC',
        'felixo-purple-bright': '#A855F7'
      }
    }
  }
};
```

Se não usar a cor Felixo, troque `ring-felixo-purple/60` no Button por qualquer cor Tailwind.

### Passo 4: Customizar

| O que | Onde mexer |
|---|---|
| **Arredondamento** | Troque `rounded-3xl` (Card) e `rounded-2xl` (Button) |
| **Padding** | Ajuste `p-5` nos subcomponentes do Card |
| **Cor ativa** | Troque `ring-felixo-purple/60` no Button |
| **Cor de fundo** | Troque `bg-zinc-950/50` no Card |
| **Borda** | Troque `border-white/10` e `border-white/5` |
| **Nova variante** | Adicione entrada no `variants` do Button |
| **Novo tamanho** | Adicione entrada no `sizes` do Button |

### Passo 5: Usar

```tsx
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, cx } from './components/ui';

function MyComponent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Projeto Final</CardTitle>
        <Badge className="bg-purple-500/20 text-purple-300">React</Badge>
      </CardHeader>
      <CardContent>
        <p>Descrição do projeto</p>
      </CardContent>
      <Button variant="outline" size="sm">Ver mais</Button>
    </Card>
  );
}
```

---

## 6. Dependências

| Dependência | Obrigatória? | Para quê? |
|---|---|---|
| React | Sim | JSX e hooks |
| TypeScript | Recomendado | Tipagem de props e variantes |
| Tailwind CSS | Sim | Todas as classes utilitárias |

**Zero** dependências externas de UI (sem clsx, class-variance-authority, etc.).

---

## 7. Referência de arquivos (no projeto original)

| Arquivo | O que faz |
|---|---|
| `src/components/ui/cx.ts` | Utilitário de classnames (1 linha) |
| `src/components/ui/Card.tsx` | Compound component Card com 6 subcomponentes |
| `src/components/ui/Button.tsx` | Button com 4 variantes, 3 tamanhos e estado ativo |
| `src/components/ui/Badge.tsx` | Badge pill simples |
| `src/components/ui/index.ts` | Barrel file com todos os exports |

---

## Resumo da receita

1. **cx**: `classes.filter(Boolean).join(' ')` — substitui clsx em 1 linha
2. **Card**: Compound component com Header/Content/Footer/Title/Description
3. **Button**: `Record<Variant, string>` + `Record<Size, string>` + `forwardRef`
4. **Badge**: Estrutura pill, cor via className do consumidor
5. **Composição**: Cada componente aceita className e rest props
6. **Sem estado**: Todos os componentes são puramente visuais
7. **Consistência**: Arredondamentos, paddings e bordas padronizados
8. **Dark-first**: Projetados para tema escuro com bordas `white/10`

---

> **Assinatura de Origem**
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design
> Data desta versão: 2026-05-23
> Sugestões e pull requests são bem-vindos.
