# Guia do Usuário Final - Felixo AI Core

Status: concluido.
Última revisão: 2026-08-31.

Este guia é para quem quer instalar e usar o Felixo AI Core como aplicativo
desktop. O Felixo centraliza CLIs de IA instaladas no seu computador, como
Claude Code, Codex e Gemini, e organiza agentes, arquivos, notas, projetos e
ferramentas num canvas visual.

O canvas é o modo principal e recomendado. O modo de chat foi depreciado e
permanece acessível apenas para compatibilidade com sessões e exportações
antigas; novos fluxos devem ser iniciados por blocos e terminais do canvas.

## 1. Modos de uso

O Felixo AI Core pode ser usado de duas formas:

- **App instalado:** baixe um artefato em GitHub Releases e abra como aplicativo desktop. Este é o fluxo recomendado para usuários finais.
- **Código-fonte:** clone o repositório e rode `python3 start_app.py`. Este fluxo é voltado para desenvolvimento, testes e contribuição.

Em qualquer instalação, o app abre diretamente no canvas. O botão **Chat** da
barra continua disponível para consultar uma sessão legada, mas não é a
superfície indicada para iniciar trabalho novo.

No modo instalado, o auto-update fica ativo apenas quando o app está empacotado. No modo código-fonte, o launcher tenta atualizar a branch atual antes de iniciar; no macOS, o prompt de atualização forçada vem confirmado por padrão. A atualização manual continua disponível com `python3 start_app.py --update`.

## 2. Instalação por sistema operacional

Acesse a página de Releases do projeto:

https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases

### Linux

Artefatos configurados:

- `.AppImage` para `x64` e `arm64`.
- `.deb` para `x64`.

Use o AppImage quando quiser o fluxo mais simples e compatível com auto-update:

```bash
chmod +x Felixo-AI-Core-*.AppImage
./Felixo-AI-Core-*.AppImage
```

Use o `.deb` quando quiser instalação tradicional em Debian/Ubuntu:

```bash
sudo dpkg -i Felixo-AI-Core-*.deb
```

Observação: o `.deb` é útil para instalação tradicional, mas o fluxo de atualização dentro do app deve priorizar AppImage.

### Windows

Artefato configurado:

- `.exe` com instalador NSIS para `x64`.

Baixe o arquivo `Felixo-AI-Core-*-win-x64.exe`, execute o instalador e siga as etapas. Como a distribuição pública ainda pode não estar assinada digitalmente, o Windows SmartScreen pode exibir um alerta. Nesse caso, clique em **Mais informações** e depois em **Executar assim mesmo**, desde que você tenha baixado o arquivo da página oficial de Releases.

Ainda não há versão portátil oficial em `.zip` para Windows.

### macOS

Artefatos configurados:

- `.dmg`.
- `.zip`.

Baixe o arquivo adequado à arquitetura publicada na release, abra o `.dmg` e arraste o app para **Aplicativos**.

#### A primeira abertura é bloqueada — isso é esperado

A distribuição pública **não é assinada nem notarizada** pela Apple. O macOS marca todo arquivo baixado da internet com um atributo de quarentena e, como o app não tem assinatura reconhecida, o Gatekeeper recusa abri-lo.

A mensagem varia conforme a versão do macOS, e nem sempre ela deixa claro que se trata de bloqueio de segurança. Você pode ver:

- "Não é possível abrir porque a Apple não pode verificar se ele está livre de malware."
- "O app está danificado e não pode ser aberto."
- Uma janela pedindo para **escolher um aplicativo na App Store** para abrir o arquivo.

A terceira é a mais confusa: o macOS não reconhece o `.app` como aplicativo executável e o trata como um arquivo qualquer. Não significa que o Felixo precise ser instalado pela App Store, nem que o download esteja corrompido.

**Para abrir (escolha um caminho):**

*Caminho 1 — Ajustes do Sistema (macOS Ventura ou mais recente):*

1. Tente abrir o app normalmente e feche o aviso.
2. Vá em **Ajustes do Sistema > Privacidade e Segurança**.
3. Role até o final: haverá uma linha citando o Felixo AI Core, com o botão **Abrir Assim Mesmo**.
4. Clique nele e confirme com sua senha ou Touch ID.

Este passo só é necessário uma vez por versão instalada.

*Caminho 2 — Terminal (funciona em qualquer versão, inclusive quando o app aparece como "danificado"):*

```bash
xattr -dr com.apple.quarantine "/Applications/Felixo AI Core.app"
```

O comando remove o atributo de quarentena do app já instalado. Depois disso ele abre normalmente pelo Launchpad ou pelo Finder.

*Caminho 3 — Botão direito (macOS mais antigos):*

Clique com o botão direito no app, escolha **Abrir** e confirme novamente em **Abrir**. Em versões recentes do macOS este caminho deixou de funcionar de forma confiável; use o caminho 1 ou 2.

> **Só faça isso com arquivos baixados da [página oficial de Releases](https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases).** Esses passos desativam uma proteção real do sistema — a verificação existe justamente para barrar software de origem desconhecida. Confira o `sha256` publicado na release se quiser validar o download.

Cada atualização baixada recria a quarentena, então o procedimento pode precisar ser repetido quando você instalar uma versão nova manualmente.

## 3. CLIs externas e contas de IA

O Felixo AI Core não inclui modelos de IA pagos. Ele detecta e executa CLIs disponíveis no sistema operacional e, no gerenciador de modelos, pode acionar instaladores oficiais via `npm` para Codex, Claude Code e Gemini.

Perfis padrão atuais:

- `Codex CLI` com comando `codex`.
- `Claude Code CLI` com comando `claude`.
- `Gemini CLI` com comando `gemini`.
- `Codex App Server` com comando `codex app-server`.
- `Gemini ACP` com comando `gemini --experimental-acp`.

CLIs e ferramentas detectadas pelo app:

- `claude`, `codex`, `gemini` e `ollama`, como providers de IA.
- `git`, para operações Git e contexto de repositório.
- `node` e `python3`, para runtimes auxiliares quando algum fluxo precisar deles.

Autentique cada CLI no terminal, seguindo a documentação oficial do provider. O Felixo pode abrir o comando de login em um terminal do sistema, mas a configuração de chaves/API, login ou assinatura continua acontecendo na própria CLI ou no ambiente do sistema, não em uma tela de API keys dentro do Felixo.

Links oficiais úteis:

- Claude Code: https://docs.anthropic.com/en/docs/claude-code/getting-started
- Codex CLI: https://developers.openai.com/codex/cli
- Gemini CLI: https://google-gemini.github.io/gemini-cli/docs/get-started/
- Git: https://git-scm.com/downloads
- Ollama: https://ollama.com/

Se uma CLI estiver instalada, mas não for detectada, confirme no terminal:

```bash
claude --version
codex --version
gemini --version
git --version
```

Se o comando funcionar no terminal, mas não no app, reinicie o Felixo. Em instalações fora do `PATH` padrão, defina `FELIXO_CLI_PATHS` com uma ou mais pastas extras onde os executáveis ficam instalados.

## 4. Configuração dentro do app

### Modelos

No canvas, abra **Ferramentas → Modelos** para abrir **Gerenciar modelos**.

Você pode:

- Ver os modelos/CLIs importados.
- Detectar CLIs oficiais instaladas.
- Instalar CLIs oficiais usando o instalador configurado para cada provider.
- Abrir login oficial da CLI no terminal do sistema.
- Adicionar uma CLI pelo comando, por exemplo `codex`, `claude` ou `gemini`.
- Remover modelos cadastrados.
- Clicar em um modelo no painel **Modelos** para configurar o modelo do provider e o effort quando o adapter suportar.

### Orquestrador

Abra **Ferramentas → Orquestrador** para ajustar:

- modo de operação;
- workflow padrão;
- skills;
- contexto personalizado;
- limites de agentes, turnos, tempo, custo estimado e tokens;
- modelos preferidos ou bloqueados para spawn;
- confirmação para ações sensíveis.

### Felixo

Abra **Ferramentas → Configurações** para ajustar:

- memórias globais do orquestrador;
- tema visual;
- informações locais do app, como quantidade de projetos, automações e runtime.

As configurações de CLIs ficam em **Modelos**. A área **Felixo** não é uma tela de cadastro de chaves de API.

### Projetos, Code, Notas e Exportação

- **Projetos:** adicione um repositório individual ou detecte vários repositórios dentro de um workspace. A lista aparece em ordem alfabética, e o mesmo vale para os arquivos ao abrir um projeto (pastas primeiro). A ordenação ignora acento e maiúscula — `Álbum` fica junto de `alfa`, não no fim — e compara número por valor, então `projeto2` vem antes de `projeto10`.

  Ao navegar os arquivos de um projeto, **clicar num arquivo o abre num editor de terminal** para ler e editar ali mesmo. O editor é o do seu `$VISUAL`/`$EDITOR`, se você tiver um configurado; senão o app usa o primeiro que encontrar instalado (`nano`, `micro`, `vim`, `vi`; `notepad` no Windows). Passando o mouse sobre a linha aparecem duas ações extras: **rodar num terminal**, oferecida só em arquivos que o app sabe executar (`.py`, `.js`, `.ts`, `.sh`, `.ps1`, executáveis), e **abrir num bloco do canvas**, para deixar o arquivo visível enquanto você trabalha em outra coisa.
- **Code:** veja status, branch, diff e commits recentes dos projetos ativos. O painel atual é read-only.
- **Notas:** registre notas associadas ao uso do app/projetos. Elas são a
  superfície de memória recomendada no canvas; o modo de chat legado também
  consegue consultar as notas persistidas.
- **Exportar:** exporte sessões de chat legadas em JSON compacto, Markdown ou
  texto simples.

Para usar um arquivo de um projeto no canvas, a pasta precisa ter sido escolhida
no seletor nativo de projetos. Caminhos digitados ou enviados por outro fluxo
nao viram raizes de projeto; o app resolve a pasta real e bloqueia a raiz do
disco, pastas inexistentes e links que saiam dela. Arquivos fora dos projetos
continuam podendo ser escolhidos explicitamente pelo seletor de arquivos.

### Abrir arquivos de texto no canvas

Um bloco de arquivo pode apontar para um arquivo que já existe no disco, para ler e editar sem sair do canvas. Duas formas de abrir:

- na aba **Projetos**, navegue até o arquivo e use o botão de abrir no canvas (ao lado do de rodar);
- no botão **Arquivo** da barra, escolha **Abrir arquivo existente…** para pegar qualquer arquivo pelo seletor do sistema.

O bloco não é dono desse arquivo: ele não cria nem apaga nada, só lê e grava no lugar. O caminho aparece logo abaixo do título, e o bloco acompanha o arquivo ao vivo — se um agente editar por fora, o conteúdo se atualiza sozinho.

No topo do bloco, o lápis alterna entre editar e visualizar. Em `.md`, `.markdown` e `.mdx` a visualização mostra o markdown formatado; em qualquer outro arquivo mostra o texto como está, em fonte monoespaçada, preservando indentação e quebras de linha — formatar markdown num `.py` comeria justamente a indentação, que ali é o programa.

Por segurança, o app só abre arquivos que estejam dentro de um projeto registrado ou que você tenha escolhido no seletor. As escolhas do seletor valem enquanto o app estiver aberto: ao reabrir, um bloco apontando para fora dos projetos pede que você escolha o arquivo de novo.

### Nomes dos blocos

- Todo bloco (terminal, nota, arquivo, grupo) pode ser **renomeado pelo cabeçalho** — clique no título e digite.
- Ao **criar** um bloco, os botões da barra (Nota, Arquivo, Grupo) abrem um campo de nome opcional; o menu do Terminal também tem o campo "Nome". Deixar vazio usa o nome padrão.
- O nome alimenta a **Pesquisa** do canvas e, em terminais com agente, é informado ao próprio agente na inicialização: ele sabe seu nome, o diretório/projeto em que está e que trabalha num ambiente multi-agente (deve se identificar nos arquivos compartilhados e não assumir que está sozinho no repositório).
- Renomear um terminal **depois** que o agente já iniciou envia uma única atualização de nome ao agente quando a edição é confirmada.

### Abrir agentes e seguir planos

- O botão grande **Agente** abre imediatamente outro terminal com as últimas configurações reutilizáveis: CLI, modelo, esforço, permissões, projeto e arquivo de planejamento. O nome do terminal continua pontual para evitar criar vários blocos com o mesmo nome sem intenção.
- A seta ao lado de **Agente** abre as configurações completas. Em **Arquivo de planejamento**, informe um caminho ou selecione qualquer tipo de arquivo no explorador.
- Quando houver um arquivo de planejamento, o agente recebe no primeiro prompt a instrução para lê-lo antes de começar e seguir suas funções, etapas e decisões. O conteúdo do arquivo não é copiado para o app; o agente recebe apenas o caminho e decide como lê-lo.
- Ao montar uma **Fila** e iniciar vários agentes de uma vez, os blocos entram em uma grade próxima de quadrada, crescendo por linhas e colunas e evitando os blocos já existentes no canvas.
- O botão **Organizar**, ao lado de **Agente**, também monta essa matriz para agentes já abertos em momentos diferentes. Ele move apenas agentes no nível principal do canvas; shells, arquivos, notas, grupos e agentes dentro de grupos permanecem onde estão.
- Ao reiniciar o aplicativo, um terminal de agente que já existia recebe `/resume` seguido de Enter como primeira instrução, em vez do prompt inicial, para retomar a conversa anterior.
- O prompt inicial de contexto (padrão de qualidade, identidade no canvas, arquivos ligados) é **digitado sem Enter**: ele fica na linha de entrada do agente esperando que você escreva o pedido depois dele, e vai junto quando você enviar. Só `/resume` e a passagem de responsabilidade são enviados sozinhos, porque carregam uma instrução de verdade.
- Esse contexto é digitado quando a CLI mostra que a entrada dela está pronta, e não num tempo fixo depois da abertura — em agentes que abrem uma tela de aviso ou de confiança antes do prompt, ele espera essa tela ser respondida. Em modo yolo, o app responde sozinho o aviso do Claude Code, que aparece uma vez por máquina.

### Colar imagens em um agente

Cole com o atalho normal do sistema (`Ctrl+V`, ou `Cmd+V` no macOS) dentro do terminal do agente. Se houver uma imagem na área de transferência, o app a salva junto dos outros anexos e digita o caminho do arquivo na linha de entrada, seguido de um espaço, para você continuar escrevendo o pedido. Colar texto continua funcionando como antes.

Vale tanto para uma imagem copiada (captura de tela, "copiar imagem" no navegador) quanto para um arquivo de imagem copiado no gerenciador de arquivos. O app lê a área de transferência pelo próprio sistema operacional, então não é preciso instalar `xclip` ou `wl-paste` no Linux, e o atalho é o mesmo em todos os sistemas e para qualquer CLI de agente — que passa a receber sempre um caminho de arquivo, a única forma de imagem que um terminal consegue transportar.

### Notificações dos agentes

O botão **Notificações** registra, enquanto o app estiver aberto, agentes que terminaram um trabalho, encerraram a sessão ou estão aguardando aprovação/resposta. Quando há itens, ele recebe borda vermelha e um contador externo, sem cobrir o ícone ou o texto. O painel abre ao lado do botão com animação; cada item mostra o agente e a última mensagem útil do terminal. Clique nele para abrir o terminal e remover o aviso. O histórico é limpo ao fechar o app.
Quando uma nova notificação surgir, o app reproduz um alerta sonoro curto; notificações já existentes ao iniciar não repetem o som.

### Conectar agentes

Ao arrastar uma conexão entre dois blocos de agentes, ambos recebem uma instrução de colaboração. Se usam o mesmo diretório de trabalho, o app informa que atuam no mesmo projeto; caso usem diretórios diferentes, a conexão declara que os contextos são relacionados. A conexão não copia conversas entre terminais: use arquivos `.md` e notas do canvas para coordenar decisões, progresso e bloqueios.

### Ferramentas do canvas

O menu **Ferramentas** (canto superior esquerdo do canvas) reúne painéis que flutuam sobre o quadro sem escondê-lo: Pesquisar, Projetos, Notas, Modelos, Prompts, Skills, Git, Fetch All e Configurações. Escolher uma ferramenta fecha o menu e abre o painel correspondente. Se as configurações de **Agente** ou **Notificações** também estiverem abertas, elas se deslocam para a coluna seguinte para não cobrir as opções de Ferramentas. A barra pode ser recolhida; nesse estado, as notificações continuam acessíveis ao lado do botão de expansão.

- **Notas** tem duas seções: **Notas no canvas** lista os blocos de nota do quadro — clicar num item centraliza e seleciona o bloco, e "Nova nota" cria um bloco direto no canvas; **Notas salvas** são as notas persistidas, editáveis ali mesmo e também legíveis pelo modo de chat legado.
- **Git** mostra branch e status do projeto escolhido, com stage all e commit; erros do repositório aparecem no próprio painel, e o botão de atualizar recarrega o status.
- **Fetch All** varre os discos locais atrás de todos os repositórios Git, faz `fetch` em cada um e monta um plano: o que só precisa de pull, o que precisa de push, o que tem pendência e o que já está atualizado. A varredura só lê. Pull (sempre `--ff-only`), push e o commit automático dos repositórios cuja única pendência é commitar acontecem num segundo passo, depois de você revisar o plano e confirmar — e o estado de cada repositório é conferido de novo imediatamente antes de qualquer escrita. Cada passada gera um relatório em Markdown na pasta de relatórios do app. A varredura **rápida** reaproveita a lista da última varredura completa (é mais rápida, mas não encontra repositórios novos), e o ícone ao lado de um repositório passa a **ignorar** aquela pasta nas próximas varreduras — a lista de ignoradas fica no rodapé do painel.
- Se uma execução confirmada falhar, o painel mostra o diagnóstico, mantém o pedido pendente e preserva o plano para uma nova revisão; o pedido só sai da fila depois que `resultado.ok` confirma a execução.

No Windows, o Fetch All considera as unidades locais fixas e removíveis que
respondem como diretórios; unidades de rede ficam fora. No macOS, volumes
virtuais, `/System/Volumes` e pastas `Library/CloudStorage` ficam fora para
evitar varredura duplicada ou I/O de rede desnecessário.

Agentes abertos pelo canvas também podem consultar essa ferramenta pelo terminal:
`felixo fetch-all varrer`, `estado` e `ver-pedido` apenas informam; para pedir
uma sincronização, usam `felixo fetch-all pedir-execucao` (ou `--com-commit`).
O pedido aparece no painel **Fetch All**, mas nunca executa pull, push ou commit
sozinho: você primeiro faz uma varredura, revisa o plano atual e confirma a
aplicação na tela. O comando usa o mesmo perfil de dados do app, inclusive no
macOS e no Windows, para que o pedido chegue ao painel correto.

### Navegação no canvas

- **Selecionar / Mover tela:** o botão da barra (ou a tecla `Q`, com o canvas em foco) alterna entre arrastar uma caixa de seleção e arrastar a tela. Dentro do conteúdo de um bloco (nota, terminal, arquivo), o arrasto não move a tela — interaja normalmente com o bloco.
- **Scroll:** a roda do mouse sobre o conteúdo de um bloco rola o conteúdo; sobre o fundo do canvas, controla o zoom.
- **Ver tudo:** enquadra todos os blocos na tela de uma vez.
- Blocos fora da área visível não são renderizados, o que mantém o canvas leve mesmo com muitos terminais abertos.

### Canvas portátil

Use **Exportar** na barra do canvas para gerar um arquivo `.fxcanvas`. Esse arquivo é
um manifesto portátil que registra blocos, conexões e o conteúdo dos arquivos `.md`
associados aos blocos de arquivo.

Para levar o canvas a outro computador:

1. Clique em **Exportar** e salve o arquivo `.fxcanvas`.
2. Transfira esse arquivo para o outro computador.
3. No Felixo do computador de destino, clique em **Importar** e selecione o manifesto.
4. Confira o aviso e confirme a substituição do canvas atual.

A importação valida o manifesto antes da confirmação e recria os `.md` registrados na
pasta local do Felixo. Arquivos registrados que estavam ausentes são recriados vazios.
Caminhos de projeto, argumentos de terminal e comandos desconhecidos não são
transportados, pois dependem da máquina de origem ou poderiam executar instruções não
confiáveis.

O botão **Limpar** pede confirmação e exclui permanentemente todos os blocos,
conexões e arquivos `.md` pertencentes ao canvas. Essa ação não remove outros tipos de
arquivo que eventualmente estejam na pasta de dados.

## 5. Dados locais, banco e logs

O app resolve diretórios pelo `app.getPath()` do Electron e cria subpastas para configurações, banco, exports, notas, relatórios, logs, scratchpads do canvas e arquivos temporários de contexto entregues aos agentes.

Locais comuns de dados do app:

- Linux: `~/.config/felixo-ai-core/`
- Windows: `%APPDATA%\felixo-ai-core\`
- macOS: `~/Library/Application Support/felixo-ai-core/`

Os arquivos em `context-deliveries/` são artefatos temporários somente leitura:
o app os cria fora do repositório para entregar prompts longos sem digitá-los
inteiros na PTY, remove-os quando a sessão termina e limpa sobras com mais de
24 horas na inicialização. Eles não são os scratchpads editáveis de
`canvas-files/` e não devem ser versionados.
Se o processo do app não conseguir criar um arquivo, o terminal volta ao
fallback inline e mostra um aviso; uma restrição de leitura imposta pela CLI
é reportada pela própria instrução entregue ao agente, porque o app não tem
como observar a sandbox de cada CLI.

Arquivos e pastas úteis:

- Banco SQLite: `database/felixo.sqlite` dentro do diretório de dados do app.
- Arquivos Markdown do canvas: pasta `canvas-files` dentro do diretório de dados do app.
- Logs do Electron: pasta `logs` dentro do diretório de dados/logs resolvido pelo Electron.
- QA Logger: painel dentro do app com eventos recentes de execução, mantido em memória durante a sessão.

Se estiver reportando um problema, inclua a versão do app, sistema operacional, CLI usada e o erro exibido no Terminal ou no QA Logger.

## 6. Limitações conhecidas

- O app depende das CLIs externas estarem instaladas, autenticadas e acessíveis no `PATH`.
- O modo de chat está depreciado: pode ser usado para compatibilidade e exportação de histórico, mas não recebe novos fluxos de produto; use o canvas para trabalho novo.
- O auto-update silencioso também existe no launcher do código-fonte; no macOS, o prompt de atualização forçada vem confirmado por padrão. `npm run dev` direto não executa atualização Git.
- No Linux, prefira AppImage para o fluxo de auto-update. `.deb` exige reinstalação/atualização tradicional.
- **macOS bloqueia a primeira execução.** Os artefatos não são assinados nem notarizados, então o Gatekeeper barra o app até que ele seja liberado manualmente (ver a [seção de instalação para macOS](#macos)). Não há como evitar isso sem uma conta paga do Apple Developer Program.
- No Windows, o SmartScreen pode exibir um alerta enquanto a distribuição não tiver assinatura, mas o app abre após confirmar.
- Ambientes corporativos com antivírus, bloqueio de shell ou políticas rígidas podem impedir automações locais.
- O painel Code atual é read-only; ações Git com escrita ainda dependem de política de confirmação.

## 7. Solução de problemas

**O app não abre no Windows.**

Verifique se o instalador veio da página oficial de Releases, se o antivírus não colocou o executável em quarentena e se o SmartScreen permitiu a execução.

**O app não abre no Linux.**

Se estiver usando AppImage, confirme a permissão de execução com `chmod +x Felixo-AI-Core-*.AppImage`.

**O macOS bloqueou a primeira abertura.**

Esperado: a distribuição pública ainda não é notarizada. Libere o app em **Ajustes do Sistema > Privacidade e Segurança > Abrir Assim Mesmo**, ou rode `xattr -dr com.apple.quarantine "/Applications/Felixo AI Core.app"`. O procedimento completo está na [seção de instalação para macOS](#macos).

**O macOS pede para escolher um aplicativo na App Store.**

É o mesmo bloqueio acima, com outra mensagem: o sistema não reconhece o `.app` como executável porque ele não tem assinatura. O Felixo não é distribuído pela App Store e não precisa de nenhum aplicativo adicional — siga os passos da [seção de instalação para macOS](#macos).

**O macOS diz que o app está "danificado".**

Também é o mesmo bloqueio, e o download não está corrompido. Neste caso o botão **Abrir Assim Mesmo** costuma não aparecer; use `xattr -dr com.apple.quarantine "/Applications/Felixo AI Core.app"`.

**Uma CLI não foi detectada.**

Rode `claude --version`, `codex --version`, `gemini --version` ou `git --version` no terminal. Se funcionar fora do app, reinicie o Felixo ou configure `FELIXO_CLI_PATHS`.

**Um arquivo `.PY` não inicia no macOS.**

O Felixo executa arquivos Python com `python3`, inclusive quando a extensão
está em maiúsculas. Confirme `python3 --version` no Terminal, instale o Python
3 se necessário e reinicie o app para que o shell de login carregue o PATH.

**A IA retorna erro de login/autenticação.**

Abra a CLI diretamente no terminal e refaça o login ou a configuração conforme o provider. O Felixo apenas chama a CLI já autenticada.

**A atualização não aparece.**

No app empacotado, o update usa GitHub Releases. No código-fonte, use o
launcher; no macOS, confirme o prompt padrão de atualização forçada. Também é
possível atualizar manualmente com `python3 start_app.py --update`.
