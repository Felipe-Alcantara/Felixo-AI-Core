# Guia do Usuário Final — Felixo AI Core

Bem-vindo ao **Felixo AI Core**! Este guia foi feito para quem deseja baixar, instalar e usar o aplicativo final, sem precisar lidar com código-fonte ou ferramentas de desenvolvimento.

---

## 1. Modos de Uso: App vs. Desenvolvimento

O Felixo AI Core pode ser executado de duas formas:
- **Modo Aplicativo (este guia):** Você baixa um arquivo executável ou instalador (`.exe`, `.AppImage`, `.dmg`). É focado em uma experiência simples, "plug and play", onde o aplicativo gerencia suas próprias configurações internamente.
- **Modo Desenvolvimento:** Usado por programadores. Exige clonar o repositório, instalar o Node.js e rodar comandos no terminal. Se você só quer usar o Felixo, fique com o **Modo Aplicativo**.

---

## 2. Instalação por Sistema Operacional

Abaixo estão os passos para instalar a versão mais recente em seu computador.

### Linux
1. Acesse a página de **Releases** no GitHub do projeto.
2. Baixe o arquivo com extensão `.AppImage` (recomendado) ou `.deb`.
3. **Se usar AppImage:**
   - Clique com o botão direito no arquivo baixado e vá em "Propriedades".
   - Na aba "Permissões", marque a opção "Permitir execução do arquivo como um programa" (ou rode `chmod +x arquivo.AppImage` no terminal).
   - Dê um duplo clique para abrir.

### Windows
1. Acesse a página de **Releases** no GitHub.
2. Baixe o instalador `.exe`.
3. Dê um duplo clique no instalador.
   - *Nota:* Como o app pode ainda não possuir uma assinatura digital paga, o Windows Defender (SmartScreen) pode exibir um alerta de "Aplicativo Desconhecido". Clique em "Mais informações" e depois em "Executar assim mesmo".
4. O Felixo AI Core será instalado e um atalho será criado.

### macOS
1. Acesse a página de **Releases** no GitHub.
2. Baixe o arquivo `.dmg`.
3. Dê um duplo clique para montar a imagem.
4. Arraste o ícone do "Felixo AI Core" para a pasta "Aplicativos" (Applications).
5. **Atenção:** Na primeira vez que for abrir, o macOS pode bloquear por ser de um desenvolvedor não identificado. Para resolver:
   - Clique com o botão direito no ícone do app e escolha "Abrir".
   - Confirme clicando em "Abrir" na janela de aviso.

---

## 3. Requisitos de CLIs Externas (Providers)

O Felixo AI Core é uma interface e orquestrador. Para rodar comandos no seu computador, ele usa ferramentas que já devem estar instaladas no seu sistema (conhecidas como CLIs — *Command Line Interfaces*).

**O que você precisa ter instalado no seu computador para o Felixo aproveitar ao máximo:**
- **Git:** Para o Felixo conseguir versionar código e clonar repositórios.
- **Node.js, Python, etc:** Dependendo dos agentes que você usar, o Felixo pode precisar executar scripts nessas linguagens.
- **Ollama (Opcional):** Se você deseja rodar modelos de IA **localmente** no seu computador (sem internet), precisará instalar o Ollama separadamente.

---

## 4. Assinaturas de IA (Modelos)

**Importante:** O aplicativo do Felixo AI Core **não inclui** modelos de IA pagos embutidos. 
- Para usar o Claude (Anthropic), Gemini (Google) ou GPT (OpenAI), você precisará criar uma conta nas respectivas plataformas, gerar uma "Chave de API" (API Key) e inseri-la nas configurações do Felixo.
- O Felixo fará as conexões, mas os custos de uso das IAs (se houver) são cobrados pela plataforma escolhida, usando a sua chave.

---

## 5. Como Configurar Providers

Para configurar uma IA:
1. Abra o Felixo AI Core.
2. Vá até a tela de **Configurações** (geralmente no ícone de engrenagem).
3. Selecione a aba **Providers / IAs**.
4. Insira a sua chave de API no campo correspondente (ex: "OpenAI API Key").
5. O aplicativo irá salvar essa chave localmente e de forma segura no seu computador.

---

## 6. Limitações Conhecidas

- **Suporte macOS Intel:** O suporte atual é otimizado para Apple Silicon (M1/M2/M3). Processadores Intel podem enfrentar lentidão.
- **Ambientes Estritos:** Em ambientes corporativos (com antivírus bloqueando execução de scripts), o Felixo pode não conseguir executar algumas automações locais.
- **Modo Portátil Windows:** Ainda não há uma versão portátil oficial (`.zip` sem instalação).

---

## 7. Solução de Problemas

**O aplicativo não abre no Windows!**
- Verifique se o antivírus não moveu o executável para a quarentena. Adicione uma exceção se necessário.

**O Felixo diz que o Git não foi encontrado.**
- Instale o Git (https://git-scm.com/), abra o terminal do seu computador, digite `git --version` para confirmar se está instalado. Reinicie o Felixo AI Core em seguida.

**A IA está retornando erro de autenticação.**
- Verifique na tela de configurações se você não copiou um espaço em branco acidentalmente na sua chave de API e confirme se sua conta na provedora (OpenAI/Anthropic) tem créditos disponíveis.

**Onde encontro os logs para reportar um problema?**
- Linux: `~/.config/felixo/logs`
- Windows: `%APPDATA%\felixo\logs`
- macOS: `~/Library/Application Support/felixo/logs`
