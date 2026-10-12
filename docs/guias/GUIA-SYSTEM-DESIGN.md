# Guia da sincronização do Felixo System Design

Como o app sincroniza o padrão de qualidade do Felixo System Design com segurança: o que o Git pode pedir, quando, e o que acontece com repositórios privados.

## Sincronização segura do Felixo System Design

O guia obrigatório é sincronizado pelo processo principal com `git`, usando
`execFile` sem shell. Repositórios privados continuam funcionando com o
credential helper do Git, Keychain do macOS, Credential Manager do Windows ou
outro mecanismo seguro configurado no sistema; não coloque usuário, senha ou
token na URL do repositório. Se uma URL antiga contiver credenciais, o app as
remove antes de persistir a configuração ou iniciar o Git.

O Git só pode **pedir login** quando você clica (Sincronizar, adicionar ou tirar um
guia, voltar ao padrão, "Usar estes guias"): aí a janela de login do sistema pode
abrir. A sincronização automática nunca pede: se um guia precisar de login (é
privado, ou o endereço está errado), ela falha na hora, o app mostra um aviso com o
botão **Fazer login e sincronizar** e os agentes seguem com o último conteúdo.

Falhas de clone/fetch/reset mostram somente a etapa, o código, o branch e o
destino sem userinfo. Tokens, parâmetros sensíveis, cabeçalhos de autorização,
stderr cru e a linha de comando completa são redigidos antes de `lastError`, do
QA Logger e da resposta ao renderer.

Os guias têm um contrato único em `electron/core/system-design-source.cjs` (camada
do usuário) e `electron/core/system-design-project.cjs` (camada de projeto):

- **Seus guias:** uma lista; dá para seguir dois padrões ao mesmo tempo (ex.: Felixo +
  Doktor). Só a escolha explícita é gravada, e uma lista escolhida nunca é trocada por
  um novo padrão do app. Cada guia tem cache, índice e estado próprios.
- **Guias do projeto:** um projeto pode trazer os seus por três caminhos que somam: um
  arquivo versionado, uma pasta `Padrão de qualidade - <nome>/` na raiz do repositório
  ou uma escolha feita no app. Quando o projeto traz guias, eles valem nos terminais
  daquele projeto **no lugar** dos seus, e o lembrete e a tela avisam isso.

O arquivo do repositório é lido do disco, mas vem de fora: ele aparece em
**Configurações → System Design → Por projeto** com as URLs que pede e só passa a
valer (e a ser buscado) depois de **Usar estes guias**. Se o arquivo mudar, a
confirmação cai. Formato:

```json
{ "guias": [ { "url": "https://github.com/conta/guia", "branch": "main" } ] }
```

O app só lê projetos registrados em **Projetos** (ou pastas escolhidas no seletor) e
não segue link simbólico. Configurações antigas são migradas sem reset.

Para voltar de uma fonte escolhida à fonte padrão do app, abra **Configurações →
System Design** e use **Voltar ao padrão do app**; a tela troca a configuração e
inicia a sincronização. Se uma sincronização falhar, a tela e o prompt informam qual
fonte ficou entregue e mantêm o último conteúdo sincronizado. A interface não guarda
histórico nem permite selecionar um SHA anterior.

Os guias também podem ser lidos dentro do app. Em **Configurações → Felixo System
Design → Ver índice**, clicar num guia (ou usar Enter/Espaço) o abre renderizado logo
abaixo do item, numa moldura com rolagem própria. Fica um guia aberto por vez, e clicar
de novo o fecha. O conteúdo vem do cache da última sincronização, então a leitura
funciona sem rede. Pelo teclado, Tab entra no texto e as setas ou PageDown rolam. A
mesma seção aparece nas Configurações do canvas e no modal de Configurações do chat.

---

---

Voltar ao [README](../../README.md).
