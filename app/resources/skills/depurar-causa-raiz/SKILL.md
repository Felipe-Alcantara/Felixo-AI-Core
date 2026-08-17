---
name: depurar-causa-raiz
description: Investigar um bug até a causa real em vez de suprimir o sintoma — reproduzir, isolar, provar a hipótese e só então corrigir. Use quando algo falha, se comporta diferente do esperado, funciona numa máquina e não em outra, ou quando a correção anterior não resolveu.
---

# Depurar até a causa, não até o sintoma

Correção que faz o sintoma sumir sem explicar a causa não é correção — é adiar
o problema para um momento pior, com menos contexto.

## Etapa 1 — Reproduza antes de teorizar

Sem reprodução confiável, você não sabe se corrigiu. Estabeleça:

- **Passos exatos** para provocar a falha.
- **Frequência**: sempre, às vezes, uma vez? Intermitente aponta para tempo,
  concorrência, cache, rede ou ordem de execução.
- **Fronteiras**: acontece em qual SO, versão, ambiente, tamanho de entrada,
  usuário? A diferença entre onde funciona e onde não funciona **é a pista**.

Se não conseguir reproduzir, diga isso — e investigue o que difere entre os
ambientes antes de mexer no código.

## Etapa 2 — Colete evidência antes de mudar qualquer coisa

- Mensagem de erro **inteira** e stack trace completo.
- Logs em volta do momento da falha, não só a linha do erro.
- O que mudou recentemente: `git log`, deploy, dependência, dado, configuração.
  A pergunta "funcionava antes?" vale mais que dez leituras de código.

## Etapa 3 — Formule hipóteses e ordene por custo de teste

Escreva 2 a 4 hipóteses plausíveis. Teste primeiro a **mais barata de
descartar**, não a mais provável. Descartar rápido estreita o campo.

Para cada uma, defina **antes** de testar: "se esta hipótese for verdadeira, eu
deveria observar X". Sem isso, qualquer resultado confirma qualquer coisa.

## Etapa 4 — Isole

- **Bissecção no tempo**: `git bisect` quando há uma versão que funcionava.
- **Bissecção no espaço**: remova metade do sistema (mock, entrada mínima,
  desligue o cache) e veja de que lado a falha fica.
- **Reduza a entrada** até o menor caso que ainda falha. O caso mínimo
  frequentemente já mostra a causa.

## Etapa 5 — Prove a causa

Você só encontrou a causa quando consegue:

1. **Explicar o mecanismo** — por que exatamente isso produz aquilo.
2. **Ligar e desligar o bug à vontade**, mexendo só na causa apontada.
3. Explicar **por que o sintoma aparecia daquele jeito** e não de outro,
   incluindo por que só naquele ambiente.

Se você não consegue os três, ainda é palpite. Diga que é palpite.

## Etapa 6 — Corrija na camada certa

Pergunte onde o problema **nasce**, não onde ele aparece:

- Tratar o sintoma na borda (retry, `try/except` genérico, valor default)
  quando a causa é de dados ou de contrato só esconde a falha.
- Se a causa é uma suposição errada, corrija a suposição — e procure **outros
  lugares** que fazem a mesma suposição. Bug raramente vem sozinho.

## Etapa 7 — Deixe o bug impossível de voltar

- **Escreva o teste que falha antes da correção** e passa depois. Sem ele, você
  não provou nada e a regressão volta.
- Se o bug era invisível, acrescente log ou erro explícito no ponto certo.
- Registre a **causa** no `IA.md` — correção sem causa registrada ensina nada.

## Armadilhas comuns

- **Corrigir o que você entende** em vez do que causa. Se a mudança "não devia
  ter efeito" e teve, você não entendeu o sistema — investigue isso.
- **Parar no primeiro achado plausível.** Coincidência é convincente.
- **Confiar na documentação** sobre o comportamento real. Meça.
- **Mudar várias coisas de uma vez** — aí você não sabe qual resolveu.
