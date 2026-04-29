# 🧭 GUIA-ONBOARDING-E-AJUDA-REUTILIZAVEL-DO-READING-TRACKER.md

> **O que é**: Um guia reutilizável para estruturar **onboarding de primeira visita** e um **centro de ajuda permanente** dentro da interface.
>
> **De onde vem**: Este padrão foi extraído do fluxo composto por `OnboardingTooltip` e `HelpModal` no projeto **Reading Tracker**.
>
> **Qual é o propósito dentro de `Utils/`**: Transformar essa solução de UX em uma referência reaproveitável no `Felixo System Design`, para que futuras aplicações não precisem redesenhar do zero a camada de educação do usuário.
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

## Padronização para Outros Projetos

A abordagem utilizada no Reading Tracker pode ser facilmente adaptada para criar interfaces amigáveis e padronizadas em outros sites.

### Estratégia de Reutilização

1.  **Criar um Componente de Onboarding Genérico**:
    -   Desenvolva um componente `OnboardingWrapper` que receba como `props` o `id` do onboarding (para a chave do `localStorage`) e o elemento a ser destacado.
    -   O `wrapper` conteria a lógica de verificação do `localStorage` e o estado de visibilidade.

2.  **Desenvolver um `HelpSystem` Modular**:
    -   Crie um componente `HelpModal` genérico que aceite um array de seções como `prop`.
    -   Cada objeto de seção poderia ter um `título`, `ícone` e `conteúdo` (que pode ser texto, uma lista ou componentes customizados).
    -   Isso permitiria que cada site definisse seu próprio conteúdo de ajuda de forma declarativa.

### Exemplo de Estrutura de Dados para um `HelpSystem`

```javascript
const helpContent = [
  {
    title: 'Primeiros Passos',
    icon: 'Rocket',
    content: <p>Bem-vindo ao nosso site! Aqui está como você pode começar...</p>
  },
  {
    title: 'Recursos Avançados',
    icon: 'Zap',
    content: (
      <ul>
        <li>Recurso 1: Descrição...</li>
        <li>Recurso 2: Descrição...</li>
      </ul>
    )
  }
];

<HelpModal content={helpContent} />;
```

## Conclusão

A combinação de um onboarding não intrusivo e um sistema de ajuda abrangente cria uma experiência de usuário positiva, reduz a curva de aprendizado e aumenta o engajamento. Ao padronizar esses componentes, é possível acelerar o desenvolvimento de novas aplicações, mantendo um alto padrão de qualidade na interface e na experiência do usuário.

---

> **Assinatura de Origem**  
> Este arquivo foi criado por **Felipe Martin** e faz parte do repositório **Felixo System Design**.  
> Origem: https://github.com/Felipe-Alcantara/Felixo-System-Design  
> Data desta versão: 2026-03-23  
> Sugestões e pull requests são bem-vindos.
