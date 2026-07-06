# 🧭 GUIA-ONBOARDING-E-AJUDA-REUTILIZAVEL-DO-READING-TRACKER.md

> **O que é**: Um guia reutilizável para estruturar **onboarding de primeira visita** e um **centro de ajuda permanente** dentro da interface.
>
> **De onde vem**: Este padrão foi extraído do fluxo composto por `OnboardingTooltip` e `HelpModal` no projeto **Reading Tracker**.
>
> **Qual é o propósito dentro de `guias/`**: Transformar essa solução de UX em uma referência reaproveitável no `Felixo System Design`, para que futuras aplicações não precisem redesenhar do zero a camada de educação do usuário.
>
> **Quando usar**: Produtos com curva de aprendizado inicial, interfaces com múltiplas ações, dashboards, painéis administrativos e apps em que o usuário precise ser guiado sem atrito.

Este documento não é uma documentação geral do `Reading Tracker`. O objetivo aqui é separar o padrão de onboarding e ajuda da aplicação original, deixando claro o que pode ser reutilizado em outros contextos.

## Visão Geral

A interface do Reading Tracker foi projetada para ser amigável e informativa, especialmente para novos usuários. Isso é alcançado através de dois componentes principais:

1.  **Onboarding Tooltip**: Um guia visual que aparece na primeira visita do usuário.
2.  **Help Modal**: Um guia completo e detalhado sobre todas as funcionalidades do site.

## Implementação Detalhada

### 1. Onboarding para Novos Usuários (`OnboardingTooltip.jsx`)

O objetivo do onboarding é apresentar ao usuário a funcionalidade mais importante para começar: o botão de ajuda.

**Como Funciona:**

-   **Detecção de Primeira Visita**: No `App.jsx`, um `useEffect` verifica no `localStorage` se a chave `hasSeenOnboarding` existe.
    ```jsx
    useEffect(() => {
      const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
      if (!hasSeenOnboarding) {
        setShowOnboarding(true);
      }
    }, []);
    ```
-   **Exibição do Tooltip**: Se a chave não existir, o estado `showOnboarding` é definido como `true`, renderizando o componente `OnboardingTooltip`.
-   **Destaque Visual**: O `OnboardingTooltip` utiliza um "spotlight" (um fundo desfocado) e uma animação de pulso para focar a atenção do usuário no botão de ajuda.
-   **Interação e Fechamento**: O usuário pode fechar o tooltip clicando no botão "Entendi" ou no fundo desfocado. Ao fechar, a chave `hasSeenOnboarding` é salva no `localStorage`, garantindo que o tooltip não apareça novamente.
    ```jsx
    const handleClose = () => {
      setShowOnboarding(false);
      localStorage.setItem('hasSeenOnboarding', 'true');
    };
    ```

### 2. Guia de Funcionalidades (`HelpModal.jsx`)

O `HelpModal` é o centro de informações do aplicativo.

**Estrutura:**

-   **Acessibilidade**: É acionado por um botão flutuante (FAB) com um ícone de interrogação, sempre visível no canto da tela.
-   **Conteúdo Organizado**: O modal é dividido em seções claras e lógicas:
    -   **O que é o Reading Tracker?**: Uma introdução ao propósito do aplicativo.
    -   **Funcionalidades Principais**: Ícones e descrições curtas para cada recurso principal.
    -   **Como Usar - Passo a Passo**: Um guia prático para as ações mais comuns.
    -   **Sincronizar Entre Dispositivos**: Instruções claras sobre importação e exportação de dados.
    -   **Dicas de Produtividade**: Sugestões para o usuário tirar o máximo proveito do aplicativo.
-   **Componentização**: O `HelpModal` é construído com sub-componentes reutilizáveis como `Section` e `Feature`, facilitando a manutenção e a adição de novo conteúdo.

## Implementação Pronta (genérica, copiar e colar)

Versão genérica do padrão, pronta para qualquer projeto React + Tailwind, sem dependências externas. São três blocos: um hook de primeira visita, o tooltip de onboarding e o centro de ajuda com botão flutuante.

### 1. Hook `useFirstVisit` — detecção de primeira visita

```jsx
// hooks/useFirstVisit.js
import { useEffect, useState } from 'react';

// `id` permite vários onboardings independentes no mesmo app
export function useFirstVisit(id) {
  const [isFirstVisit, setIsFirstVisit] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(`hasSeen:${id}`)) {
      setIsFirstVisit(true);
    }
  }, [id]);

  const dismiss = () => {
    localStorage.setItem(`hasSeen:${id}`, 'true');
    setIsFirstVisit(false);
  };

  return [isFirstVisit, dismiss];
}
```

### 2. `OnboardingTooltip` — spotlight de primeira visita

Fundo desfocado cobrindo a tela inteira, card de boas-vindas e um anel pulsante posicionado sobre o elemento a destacar (por padrão, o botão de ajuda no canto inferior direito).

```jsx
// components/OnboardingTooltip.jsx
export default function OnboardingTooltip({
  title = 'Bem-vindo!',
  text = 'Toque no botão de ajuda sempre que precisar de um guia completo.',
  buttonLabel = 'Entendi',
  onClose,
}) {
  return (
    <div className="fixed inset-0 z-50">
      {/* fundo desfocado; clicar fora também fecha */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* anel pulsante sobre o alvo (ajuste a posição para o seu layout) */}
      <div className="pointer-events-none absolute bottom-4 right-4 h-16 w-16 animate-ping rounded-full border-4 border-blue-400" />

      {/* card de orientação apontando para o alvo */}
      <div className="absolute bottom-24 right-6 w-72 rounded-xl bg-white p-4 shadow-2xl">
        <h3 className="mb-1 font-bold text-gray-900">{title}</h3>
        <p className="mb-3 text-sm text-gray-600">{text}</p>
        <button
          onClick={onClose}
          className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
```

### 3. `HelpSystem` — botão flutuante + modal de ajuda declarativo

Recebe um array de seções (`title`, `icon` opcional, `content`), para que cada projeto defina o próprio conteúdo sem mexer no componente.

```jsx
// components/HelpSystem.jsx
import { useState } from 'react';

export default function HelpSystem({ title = 'Central de Ajuda', sections }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* FAB sempre visível */}
      <button
        aria-label="Abrir ajuda"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white shadow-lg transition hover:scale-105 hover:bg-blue-700"
      >
        ?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">{title}</h2>
              <button
                aria-label="Fechar ajuda"
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            {sections.map((section) => (
              <section key={section.title} className="mb-4">
                <h3 className="mb-1 font-semibold text-gray-800">
                  {section.icon ? `${section.icon} ` : ''}
                  {section.title}
                </h3>
                <div className="text-sm text-gray-600">{section.content}</div>
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
```

### 4. Integração no `App`

```jsx
import { useFirstVisit } from './hooks/useFirstVisit';
import OnboardingTooltip from './components/OnboardingTooltip';
import HelpSystem from './components/HelpSystem';

const helpContent = [
  {
    title: 'Primeiros Passos',
    icon: '🚀',
    content: <p>Bem-vindo! Aqui está como você pode começar...</p>,
  },
  {
    title: 'Recursos Avançados',
    icon: '⚡',
    content: (
      <ul className="list-disc pl-5">
        <li>Recurso 1: descrição...</li>
        <li>Recurso 2: descrição...</li>
      </ul>
    ),
  },
];

export default function App() {
  const [isFirstVisit, dismissOnboarding] = useFirstVisit('app-intro');

  return (
    <>
      {/* ...resto da aplicação... */}
      <HelpSystem sections={helpContent} />
      {isFirstVisit && <OnboardingTooltip onClose={dismissOnboarding} />}
    </>
  );
}
```

## Como reutilizar em outro projeto

1. Copie o hook e os dois componentes para o projeto.
2. Defina o `helpContent` com as seções do seu produto (texto, listas ou componentes próprios).
3. Escolha um `id` de onboarding por fluxo — trocar o `id` reativa o onboarding para todos (útil ao lançar uma funcionalidade nova).
4. Ajuste a posição do anel pulsante do `OnboardingTooltip` para o elemento que você quer destacar.

Opções de adaptação comuns:

- **Sem Tailwind**: converta as classes para CSS próprio; a lógica não muda.
- **Múltiplos passos**: transforme `title`/`text` do tooltip em um array e avance o índice no botão, persistindo no mesmo `localStorage`.
- **Ícones**: troque os emojis por uma biblioteca como `lucide-react` se o projeto já a utiliza.

## Resumo da receita

1. **Hook `useFirstVisit(id)`** — lê `localStorage` no mount; `dismiss()` grava a chave e esconde.
2. **`OnboardingTooltip`** — overlay com blur + anel pulsante no alvo + card com botão "Entendi".
3. **`HelpSystem`** — FAB fixo com "?" que abre um modal de seções declarativas.
4. **Integração** — `HelpSystem` sempre montado; tooltip renderizado só quando `isFirstVisit`.

Ingredientes-chave: chave por fluxo no `localStorage` (`hasSeen:<id>`), conteúdo de ajuda como dado (array de seções) e fechamento por clique fora ou botão.

## Conclusão

A combinação de um onboarding não intrusivo e um sistema de ajuda abrangente cria uma experiência de usuário positiva, reduz a curva de aprendizado e aumenta o engajamento. Ao padronizar esses componentes, é possível acelerar o desenvolvimento de novas aplicações, mantendo um alto padrão de qualidade na interface e na experiência do usuário.

---

> **Assinatura de Origem**  
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.  
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design  
> Data desta versão: 2026-03-23  
> Sugestões e pull requests são bem-vindos.
