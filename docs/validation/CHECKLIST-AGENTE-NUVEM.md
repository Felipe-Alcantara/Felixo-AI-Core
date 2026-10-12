# Checklist manual — Agente na nuvem

Este roteiro **não roda no CI**: ele cria sessões reais do Claude Code na nuvem e gasta
crédito (ou o limite do plano). Faça numa pasta descartável e numa conta de teste ou com
o crédito de sessão na nuvem à vista. Os testes automáticos (parser, serviço, IPC, estado,
migração e exportação) cobrem a lógica; aqui ficam só as conferências que exigem o app e a
nuvem de verdade.

Requisitos: Claude Code 2.1.287 ou mais novo (`claude --cloud` e `claude --teleport`),
login de assinatura (claude.ai) e, para a etapa 2, uma pasta git nova que o Claude ainda
não conheça.

## Subir o app isolado

```bash
cd app
node electron/cli/felixo.cjs devtools launch --port 9333
node electron/cli/felixo.cjs devtools status        # espera "porta CDP: 9333"
```

A janela é invisível e o perfil é temporário; `devtools screenshot --out arquivo.png`
mostra a tela. A primeira carga compila o Vite e leva cerca de um minuto.

## Roteiro

1. **Criar o cartão.** Seção *Criar* → **Agente na nuvem**. Esperado: cartão em rascunho
   com o nome "Agente na nuvem" (também no dock de elementos), aviso do crédito e
   **Disparar na nuvem** desabilitado até haver tarefa e pasta.
2. **Pasta não confiada.** Aponte para uma pasta git nova e dispare. Esperado: nenhuma
   sessão criada; erro "O Claude ainda não confia nesta pasta", com **Abrir Claude nesta
   pasta** e **Tentar de novo** (sem confirmação extra).
3. **Disparo.** Numa pasta já confiada, tarefa curta ("Responda apenas ok"). Clique em
   **Disparar na nuvem**: a confirmação mostra conta, pasta e tarefa e esconde o
   formulário; **Confirmar e disparar**. Esperado: "Criando a sessão na nuvem…" por poucos
   segundos e depois o cartão **criado**, com título, ID e data. Confira a sessão em
   claude.ai/code.
4. **Um clique, uma sessão.** Em outro cartão, dê dois cliques rápidos em **Confirmar e
   disparar**. Esperado: uma única sessão em claude.ai/code.
5. **Persistência.** Recarregue o app. Esperado: o cartão volta criado, com o mesmo ID e
   sem **nenhuma sessão nova** em claude.ai/code.
6. **Follow-up.** Escreva uma mensagem e envie. Esperado: linha `✓` na lista de mensagens
   enviadas; a mensagem aparece na sessão em claude.ai/code.
7. **Abrir.** **Abrir** leva ao link `https://claude.ai/code/session_...` no navegador.
8. **Trazer para cá.** Esperado: um terminal "Claude · <título>" na mesma pasta, com a
   conversa da sessão carregada e **sem texto inicial** digitado pelo app.
9. **Nova sessão.** **Nova sessão** → **Criar novo rascunho**. Esperado: rascunho com a
   mesma tarefa, pasta e conta; a sessão anterior continua em claude.ai/code.
10. **Interrupção.** Dispare e feche o app antes de a sessão aparecer. Reabra. Esperado:
    cartão **interrompido** (nunca "disparando") e **nenhuma sessão nova** criada pelo
    app. Confira em claude.ai/code se a sessão chegou a existir.
11. **Canvas portátil.** Exporte o canvas e importe em outro perfil. Esperado: o cartão
    chega como rascunho, só com nome e tarefa.
12. **Crédito.** Em *Configurações > Uso*, o "Crédito incluído" cai (o painel mostra
    dólares inteiros; tarefas triviais custam centavos). Se só a barra semanal subir, a
    sessão está sendo cobrada do plano, e não do crédito de nuvem.
13. **Texto difícil.** Dispare uma tarefa com aspas, acento, emoji, `%PATH%` e uma quebra de
    linha (por exemplo, `Responda "ok" ✅ %PATH%` e, na linha de baixo, `fim`). Esperado: a
    sessão em claude.ai/code mostra o texto **exatamente** como foi escrito, sem variável
    expandida nem aspas comidas. Repita no follow-up.
14. **Hífen no início.** Escreva `--teste` na tarefa. Esperado: aviso "não pode começar com
    “-”" no campo (com `aria-invalid`), **Disparar na nuvem** desabilitado e nenhuma sessão
    criada. O mesmo vale para o campo de mensagem.
15. **Teclado.** Só com o teclado: abra a confirmação (o foco entra nela), pressione **Esc**
    (volta ao botão **Disparar na nuvem**) e confirme com **Enter**. Esperado: nenhum passo
    exige o mouse e, se a criação falhar, o foco vai para o aviso de erro.
16. **Log.** Abra o QA Logger depois de um disparo. Esperado: um evento do escopo
    `cloud-session` com operação, resultado e duração, **sem** tarefa, pasta nem ID.
17. **Banco existente.** Antes de abrir uma versão nova com um banco real, rode
    `node scripts/ensaiar-migracoes-em-copia.cjs` (em `app/`). Esperado: "Resultado: OK", a
    versão das migrações subindo e nenhuma tabela com menos linhas. O banco original não é
    alterado e a cópia temporária é apagada.

## Convite: Linux e macOS

Os testes automáticos rodam nos dois sistemas no CI, mas a criação real de sessão foi
conferida só no Windows. Se você usa Linux ou macOS, rode este roteiro e abra um PR
acrescentando uma linha em **Última execução** (sistema, versão do Claude Code e o que foi
observado). Em macOS, vale conferir sobretudo as etapas 3, 6 e 13, que passam pelo shell de
login; em Linux, a 2 e a 8.

## Encerrar

```bash
node electron/cli/felixo.cjs devtools quit
```

Arquive as sessões de teste em claude.ai/code.

## Última execução

2026-10-12, Windows 11, Claude Code 2.1.287, perfil isolado a partir do código-fonte,
com o Login do sistema. O que foi **observado** no app:

- Etapa 1: cartão em rascunho com o nome e o aviso do crédito (captura de tela).
- Etapa 2: o CLI parou na tela de confiança, o cartão mostrou o erro de confiança com os
  dois botões, e nenhuma sessão foi criada pelo app.
- Etapa 3: "Criando a sessão na nuvem…" e depois o cartão criado, com título, ID e data.
- Etapa 5: depois de recarregar, o cartão voltou criado com o **mesmo ID** e a mensagem.
- Etapa 6: o cartão registrou `✓` para o follow-up (o CLI imprimiu "Sent to cloud session").
- Etapa 8: nasceu um terminal "Claude · <título>" na pasta do cartão e a TUI mostrou o
  prompt vazio e o modelo.
- Etapa 9: **Nova sessão** devolveu o cartão a rascunho com tarefa, pasta e conta.

**Não conferido:** na etapa 5, que **nenhuma sessão nova** apareceu na lista do
claude.ai/code (só comparei o ID do cartão); na etapa 6, que a mensagem chegou à sessão
vista no claude.ai/code; as etapas 4 (duplo clique real), 7 (clique em **Abrir**, que
abriria o navegador), 10 (fechar o app no meio do disparo) e 11 (importar em outro
perfil); e a etapa 12 com precisão (o painel mostra dólares inteiros). As etapas 13 a 16
foram acrescentadas depois desta execução e ainda não foram feitas na nuvem real; a 17 foi
rodada contra o banco do perfil local (versão 18 → 19, nenhuma tabela com menos linhas).
Linux e macOS não foram executados.
