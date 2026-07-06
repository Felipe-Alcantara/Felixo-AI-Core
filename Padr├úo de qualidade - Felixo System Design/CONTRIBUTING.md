# 🤝 Contribuindo com o Felixo System Design

Obrigado por querer contribuir! Este repositório reúne padrões de design, qualidade e
documentação reutilizáveis. Ele é open source, e melhorar junto é exatamente a ideia.

Sinta-se à vontade para abrir issues, sugerir guias novos, corrigir documentação ou
propor padrões. Toda contribuição — por menor que seja — é bem-vinda.

---

## 📋 Índice

- [Como Contribuir](#-como-contribuir)
- [Padrões de Linguagem](#-padrões-de-linguagem-documentação-e-logs)
- [Padrões de Qualidade](#-padrões-de-qualidade)
- [Fluxo de Pull Request](#-fluxo-de-pull-request)
- [Código de Conduta](#-código-de-conduta)

---

## 🚀 Como Contribuir

1. **Faça um fork** do repositório.
2. **Crie uma branch** descritiva (`fix/...`, `feat/...`, `docs/...`).
3. **Faça suas mudanças** seguindo os padrões deste guia.
4. **Abra um Pull Request** explicando o que mudou e por quê.

Não tem certeza por onde começar? Abra uma issue descrevendo a ideia — a gente conversa
antes de você investir tempo no código.

---

## ✍️ Padrões de Linguagem (Documentação e Logs)

Como os projetos são **open source**, documentação e mensagens de log são lidas por um
público amplo: pessoas que chegam de fora, novos contribuidores e leitores em geral —
não apenas o time interno. Por isso, ao escrever:

- **Escreva para qualquer leitor.** Use linguagem geral e acessível, evitando jargão
  interno ou contexto que só o autor conhece.
- **Sem valores hardcoded.** Nada de caminhos locais, tokens, nomes de usuário, IDs ou
  URLs privadas chumbados no texto ou nos exemplos — use placeholders genéricos.
- **Enquadre o trabalho futuro como convite à contribuição**, em vez de soar como uma
  lista de tarefas interna:

| ❌ Evite (tom interno) | ✅ Prefira (tom open source) |
|------------------------|------------------------------|
| "Features futuras para implementar" | "Melhorias que o projeto poderia expandir" |
| "TODO: ainda falta fazer" | "Ideias para quem quiser contribuir" |
| "Coisas que preciso terminar" | "Próximos passos abertos à comunidade" |

O mesmo vale para **logs**: claros, neutros e úteis para qualquer pessoa entender o que
aconteceu, sem expor segredos nem depender de contexto privado.

> Referência completa: [`core/DESIGN_SYSTEM_README.md`](core/DESIGN_SYSTEM_README.md), seção 3.5.

---

## ✅ Padrões de Qualidade

Antes de abrir um PR, vale conferir o contrato curto de qualidade em
[`core/GUIA_MINIMO_QUALIDADE.md`](core/GUIA_MINIMO_QUALIDADE.md). Em resumo:

- Entenda o padrão existente antes de alterar — não invente convenções que o repositório
  já define.
- Mantenha responsabilidades separadas e prefira a solução mais simples que resolva o
  problema real.
- Não exponha segredos, dados sensíveis ou URLs privadas.
- Atualize README, guias ou `IA.md` quando a mudança exigir.
- Faça mudanças pequenas e rastreáveis, com escopo claro.

---

## 🔄 Fluxo de Pull Request

Um bom PR responde claramente:

- **O que mudou?**
- **Por que mudou?**
- **Como foi validado?**
- **Qual risco sobrou?**

Mantenha o PR focado: evite misturar refatoração ampla com novas funcionalidades sem
necessidade.

---

## 💬 Código de Conduta

Seja respeitoso e acolhedor. Este é um espaço para aprender e construir juntos —
contribuições de pessoas de todos os níveis de experiência são bem-vindas.

---

⭐ Se este projeto te ajudou, considere deixar uma estrela no GitHub!

> Repositório: [Felixo System Design](https://github.com/Felipe-Alcantara/Felixo-System-Design)
