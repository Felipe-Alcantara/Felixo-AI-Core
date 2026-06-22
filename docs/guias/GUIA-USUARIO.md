# Guia do Usuário Final - Felixo AI Core

Status: concluido.
Última revisão: 2026-05-04.

Este guia é para quem quer instalar e usar o Felixo AI Core como aplicativo desktop. O Felixo centraliza CLIs de IA instaladas no seu computador, como Claude Code, Codex e Gemini, e oferece uma interface para conversar, selecionar projetos, acompanhar execução, usar notas, exportar chats e configurar o orquestrador.

## 1. Modos de uso

O Felixo AI Core pode ser usado de duas formas:

- **App instalado:** baixe um artefato em GitHub Releases e abra como aplicativo desktop. Este é o fluxo recomendado para usuários finais.
- **Código-fonte:** clone o repositório e rode `python3 start_app.py`. Este fluxo é voltado para desenvolvimento, testes e contribuição.

No modo instalado, o auto-update fica ativo apenas quando o app está empacotado. No modo código-fonte, a atualização é manual com `python3 start_app.py --update`.

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

Baixe o arquivo adequado à arquitetura publicada na release, abra o `.dmg` e arraste o app para **Aplicativos**. Como a distribuição pública ainda pode não estar notarizada, o Gatekeeper pode bloquear a primeira execução. Para abrir, clique com o botão direito no app, escolha **Abrir** e confirme novamente em **Abrir**.

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

Na sidebar, use o botão de configuração em **Modelos** para abrir **Gerenciar modelos**.

Você pode:

- Ver os modelos/CLIs importados.
- Detectar CLIs oficiais instaladas.
- Instalar CLIs oficiais usando o instalador configurado para cada provider.
- Abrir login oficial da CLI no terminal do sistema.
- Adicionar uma CLI pelo comando, por exemplo `codex`, `claude` ou `gemini`.
- Remover modelos cadastrados.
- Clicar em um modelo na sidebar para configurar modelo do provider e effort quando o adapter suportar.

### Orquestrador

Use **Orquestrador** na sidebar para ajustar:

- modo de operação;
- workflow padrão;
- skills;
- contexto personalizado;
- limites de agentes, turnos, tempo, custo estimado e tokens;
- modelos preferidos ou bloqueados para spawn;
- confirmação para ações sensíveis.

### Felixo

Use **Felixo** no rodapé da sidebar para ajustar:

- memórias globais do orquestrador;
- tema visual;
- informações locais do app, como quantidade de projetos, automações e runtime.

As configurações de CLIs ficam em **Modelos**. A área **Felixo** não é uma tela de cadastro de chaves de API.

### Projetos, Code, Notas e Exportação

- **Projetos:** adicione um repositório individual ou detecte vários repositórios dentro de um workspace.
- **Code:** veja status, branch, diff e commits recentes dos projetos ativos. O painel atual é read-only.
- **Notas:** registre notas associadas ao uso do app/projetos.
- **Exportar:** exporte chats em JSON compacto, Markdown ou texto simples.

## 5. Dados locais, banco e logs

O app resolve diretórios pelo `app.getPath()` do Electron e cria subpastas para configurações, banco, exports, notas, relatórios e logs.

Locais comuns de dados do app:

- Linux: `~/.config/felixo-ai-core/`
- Windows: `%APPDATA%\felixo-ai-core\`
- macOS: `~/Library/Application Support/felixo-ai-core/`

Arquivos e pastas úteis:

- Banco SQLite: `database/felixo.sqlite` dentro do diretório de dados do app.
- Logs do Electron: pasta `logs` dentro do diretório de dados/logs resolvido pelo Electron.
- QA Logger: painel dentro do app com eventos recentes de execução, mantido em memória durante a sessão.

Se estiver reportando um problema, inclua a versão do app, sistema operacional, CLI usada e o erro exibido no Terminal ou no QA Logger.

## 6. Limitações conhecidas

- O app depende das CLIs externas estarem instaladas, autenticadas e acessíveis no `PATH`.
- Auto-update fica ativo apenas no app empacotado, não no `npm run dev` nem no modo código-fonte.
- No Linux, prefira AppImage para o fluxo de auto-update. `.deb` exige reinstalação/atualização tradicional.
- Windows e macOS ainda podem exibir alertas de segurança enquanto a distribuição pública não tiver assinatura/notarização completa.
- Ambientes corporativos com antivírus, bloqueio de shell ou políticas rígidas podem impedir automações locais.
- O painel Code atual é read-only; ações Git com escrita ainda dependem de política de confirmação.

## 7. Solução de problemas

**O app não abre no Windows.**

Verifique se o instalador veio da página oficial de Releases, se o antivírus não colocou o executável em quarentena e se o SmartScreen permitiu a execução.

**O app não abre no Linux.**

Se estiver usando AppImage, confirme a permissão de execução com `chmod +x Felixo-AI-Core-*.AppImage`.

**O macOS bloqueou a primeira abertura.**

Clique com o botão direito no app, escolha **Abrir** e confirme. Se necessário, libere o app em **Ajustes do Sistema > Privacidade e Segurança**.

**Uma CLI não foi detectada.**

Rode `claude --version`, `codex --version`, `gemini --version` ou `git --version` no terminal. Se funcionar fora do app, reinicie o Felixo ou configure `FELIXO_CLI_PATHS`.

**A IA retorna erro de login/autenticação.**

Abra a CLI diretamente no terminal e refaça o login ou a configuração conforme o provider. O Felixo apenas chama a CLI já autenticada.

**A atualização não aparece.**

Confirme que você está usando o app empacotado. No modo código-fonte, atualize manualmente com `python3 start_app.py --update`.
