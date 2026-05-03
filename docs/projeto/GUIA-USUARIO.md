# Guia de Instalação e Uso do Felixo AI Core

Status: CONCLUIDO.

Este documento destina-se a usuários finais que desejam baixar, instalar e utilizar o aplicativo Felixo AI Core, sem a necessidade de interagir com o código-fonte.

---

## 1. O que é o Felixo AI Core?

O Felixo AI Core é um ambiente de orquestração multi-agente que permite interagir com diferentes modelos de IA (como Claude, Codex, Gemini, etc.) e coordenar tarefas complexas. 

**Importante:** O aplicativo em si é a interface e o motor de orquestração. Ele **não** inclui automaticamente assinaturas de IA ou modelos pagos embutidos. Você precisará ter as ferramentas de linha de comando (CLIs) dos provedores instaladas e autenticadas em sua máquina.

---

## 2. Diferença entre o App Baixado e o Modo Desenvolvimento

* **App Baixado (Empacotado):** É um aplicativo executável pronto para uso (`.exe`, `.AppImage`, `.dmg`). Você instala como qualquer outro programa. Ele gerencia as próprias configurações, usa diretórios de dados padrão do sistema operacional para logs/cache e é a forma recomendada para a maioria dos usuários.
* **Modo Desenvolvimento:** Requer clonar o código via Git, instalar dependências usando Node.js/npm e iniciar via terminal. Voltado para quem quer contribuir com o projeto.

---

## 3. Guias de Instalação por Sistema Operacional

### Instalação no Windows

1. Acesse a página de Releases do repositório.
2. Baixe o arquivo com extensão `.exe` (ex: `Felixo-AI-Core-Setup-x.x.x.exe`).
3. Dê um duplo clique no arquivo baixado.
4. Siga as instruções do instalador na tela.
5. Após concluir, procure por "Felixo AI Core" no Menu Iniciar para abrir o app.

*Aviso: O Windows pode exibir um alerta de segurança ("O Windows protegeu o seu computador") devido à ausência temporária de uma assinatura digital (certificado). Você pode clicar em "Mais informações" e depois em "Executar mesmo assim".*

### Instalação no Linux

1. Acesse a página de Releases do repositório.
2. Baixe o arquivo `.AppImage` ou `.deb`.
   * **Usando .AppImage:** 
     1. Clique com o botão direito no arquivo baixado e vá em "Propriedades".
     2. Na aba "Permissões", marque a opção "Permitir execução do arquivo como um programa".
     3. Dê dois cliques para rodar.
   * **Usando .deb (Debian/Ubuntu):**
     1. Dê dois cliques para abrir no instalador de pacotes ou rode no terminal: `sudo dpkg -i felixo-ai-core_x.x.x_amd64.deb`.

### Instalação no macOS

1. Acesse a página de Releases.
2. Baixe o arquivo `.dmg`.
3. Dê duplo clique no `.dmg` para montá-lo.
4. Arraste o ícone do Felixo AI Core para a pasta "Aplicativos" (Applications).
5. Vá até a pasta Aplicativos e abra o app.

*Aviso: Ao abrir pela primeira vez, o macOS pode bloquear a execução por ser de um "desenvolvedor não verificado". Para contornar, vá em "Preferências do Sistema" > "Segurança e Privacidade" > aba "Geral" e clique em "Abrir Mesmo Assim" ao lado do aviso do Felixo.*

---

## 4. Requisitos e Configuração de CLIs Externas

Para que o Felixo AI Core consiga conversar com as IAs, ele precisa que você tenha as ferramentas oficiais instaladas e autenticadas.

* **Claude Code CLI (Anthropic):** Instale via npm (`npm install -g @anthropic-ai/claude-code`) e autentique.
* **Codex CLI / OpenAI:** Instale a CLI oficial caso aplicável.
* **Gemini CLI (Google):** Instale e configure o acesso à API.
* **Ollama (Modelos Locais):** Instale o Ollama (ollama.com) e baixe os modelos desejados (`ollama run llama3`, por exemplo).

No aplicativo:
1. Vá na aba **Modelos** ou nas configurações do Orquestrador.
2. O sistema detectará automaticamente as CLIs no seu PATH.
3. Se alguma não for detectada, você pode configurá-la manualmente apontando o caminho do executável.

---

## 5. Limitações Conhecidas

* Algumas ações no terminal interno podem ser limitadas no modo empacotado, especialmente se tentarem modificar diretórios protegidos do sistema operacional.
* A detecção automática das CLIs pode falhar se você tiver instalado via gerenciadores de pacotes muito específicos ou fora do PATH global (como no macOS com Homebrew sem link no `/usr/local/bin`).
* No Windows, a execução de comandos Unix dentro das threads dependerá do que o ambiente Windows possui (recomenda-se Git Bash ou WSL disponíveis).

---

## 6. Solução de Problemas

* **O app abre mas os modelos dizem "Bloqueado" ou "Indisponível":** Verifique se você instalou a CLI correspondente e fez o login nela via seu terminal nativo (fora do Felixo). 
* **Tela em branco ao iniciar:** Tente limpar os dados do aplicativo apagando a pasta de dados nas configurações do seu SO (no Linux: `~/.config/felixo-ai-core`).
* **Erros de permissão:** Execute o app como administrador (Windows) ou verifique as permissões da pasta de trabalho (Linux/macOS).
