---
name: escrever-testes-que-valem
description: Escrever testes que pegam regressão de verdade em vez de inflar cobertura — testar comportamento e não implementação, cobrir a regra crítica e as bordas, e deixar a falha legível. Use ao adicionar teste a código novo ou legado, ou quando a suíte passa e os bugs continuam chegando.
---

# Testes que pegam regressão

Suíte verde com bug em produção significa que os testes medem a coisa errada.
Cobertura alta não é qualidade: é a medida de quanto código foi **executado**,
não de quanto foi **verificado**.

## O que testar primeiro (em ordem de valor)

1. **A regra que, se quebrar, alguém perde dinheiro, dado ou confiança.** No
   sistema de cobrança, é o cálculo. No de arquivos, é não perder arquivo.
2. **Bugs que já aconteceram.** Todo bug corrigido vira teste — é o único jeito
   de ele não voltar.
3. **Bordas**: vazio, nulo, um item, muitos itens, tamanho máximo, duplicata,
   ordem inesperada, unicode, fuso horário, número negativo.
4. **Idempotência e repetição**: rodar duas vezes produz o mesmo estado?
5. **Contratos entre camadas**: o formato que uma parte promete e outra consome.

## O que não testar

- Getter/setter trivial.
- Framework de terceiro (ele tem os testes dele).
- Detalhe de implementação: se o teste quebra quando você renomeia uma função
  privada sem mudar comportamento, ele mede a coisa errada.
- Mock que só verifica que um mock foi chamado — isso testa o mock.

## Como escrever

**Nome que diz a regra**, não o método:
- ❌ `test_processar()`
- ✅ `test_reimportar_o_mesmo_extrato_nao_duplica_lancamento()`

**Estrutura em três blocos** — preparar, agir, verificar — separados por linha
em branco. Quem lê deve entender sem rolar.

**Uma razão para falhar por teste.** Cinco asserções sobre coisas diferentes
viram um teste que ninguém sabe por que quebrou.

**Falha legível.** Quando quebrar, a mensagem tem que dizer o que se esperava e
o que veio. Um `assert x` sem contexto custa meia hora de investigação.

**Determinismo.** Nada de tempo real, aleatório sem semente, rede, ordem de
dicionário ou dependência da máquina. Teste intermitente é pior que teste
ausente: ele treina o time a ignorar vermelho.

**Sem rede e sem credencial.** Injete o cliente/dependência. Se testar exige
token, o desenho está acoplado — conserte o desenho.

## Para código legado sem teste

Use **testes de caracterização**: rode o código real, capture a saída, congele
como asserção. Eles não dizem que o comportamento está certo — dizem qual é.
É a rede que permite refatorar depois.

## Antes de dar por pronto

- O teste **falha** quando você quebra a regra de propósito? Se não falha, ele
  não protege nada. **Verifique isso**, é o passo que quase todo mundo pula.
- A suíte roda rápido o bastante para ser rodada sempre?
- Alguém que não escreveu o código entende o que a regra é, só lendo o teste?
