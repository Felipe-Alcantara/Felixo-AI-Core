# Guia de Instalação para Usuários Finais

Status: concluido.

## O que é o Felixo AI Core

O Felixo AI Core é um aplicativo desktop para orquestrar múltiplas IAs de terminal em uma única interface. Ele permite usar Claude, Codex, Gemini e outras IAs de forma integrada.

**Importante:** O app **não** inclui modelos de IA. Você precisa instalar e autenticar as CLIs separadamente.

---

## Instalação

### Linux

#### AppImage (recomendado)

1. Baixe o arquivo `Felixo-AI-Core-X.X.X-linux-x64.AppImage` da [página de Releases](https://github.com/Felipe-Alcantara/Felixo-AI-Core/releases).
2. Torne o arquivo executável:
   ```bash
   chmod +x Felixo-AI-Core-*.AppImage
   ```
3. Execute:
   ```bash
   ./Felixo-AI-Core-*.AppImage
   ```

O AppImage roda diretamente, sem instalação.

#### .deb (Debian/Ubuntu)

1. Baixe o arquivo `Felixo-AI-Core-X.X.X-linux-x64.deb`.
2. Instale:
   ```bash
   sudo dpkg -i Felixo-AI-Core-*.deb
   ```
3. Abra pelo menu de aplicativos ou pelo terminal:
   ```bash
   felixo-ai-core
   ```

### Windows

1. Baixe o arquivo `Felixo-AI-Core-X.X.X-win-x64.exe`.
2. Execute o instalador.
3. O Windows SmartScreen pode alertar porque o app não é assinado. Clique em "Mais informações" → "Executar assim mesmo".
4. Siga as instruções do instalador.
5. Abra o app pelo menu Iniciar ou atalho na área de trabalho.

### macOS

1. Baixe o arquivo `Felixo-AI-Core-X.X.X-mac-arm64.dmg` (Apple Silicon) ou `mac-x64.dmg` (Intel).
2. Abra o .dmg e arraste o app para a pasta Aplicativos.
3. Na primeira execução, o macOS pode bloquear o app por não ser notarizado.
4. Vá em **Preferências do Sistema → Segurança e Privacidade** e clique em "Abrir assim mesmo".

---

## Configuração de CLIs de IA

O Felixo AI Core usa CLIs instaladas no seu sistema. Para usar um modelo, você precisa ter a CLI correspondente instalada e autenticada.

### Claude CLI (Anthropic)

```bash
npm install -g @anthropic-ai/claude-code
claude --version
# Configure sua conta:
claude configure
```

Requisitos: Node.js 22+, conta Anthropic.

### Codex CLI (OpenAI)

```bash
npm install -g @openai/codex
codex --version
# Configure sua API key:
export OPENAI_API_KEY=sua-chave-aqui
```

Requisitos: Node.js 22+, API key OpenAI.

### Gemini CLI (Google)

```bash
npm install -g @google/gemini-cli
gemini --version
# Configure sua conta:
gemini configure
```

Requisitos: Node.js 22+, conta Google com acesso ao Gemini.

---

## Diferença entre app baixado e modo desenvolvimento

| Aspecto | App baixado | Modo desenvolvimento |
|---------|-----------|---------------------|
| Instalação | Baixar e executar | Clonar repo, instalar deps |
| Atualização | Automática (silenciosa) | Manual (`git pull`) |
| Uso | Direto, sem código | Requer Node.js e terminal |
| Para quem | Usuários finais | Desenvolvedores/contribuidores |

---

## Requisitos das CLIs externas

O app detecta CLIs automaticamente. O status é mostrado na tela de configurações:

- ✅ **Disponível**: CLI instalada e detectada.
- ❌ **Indisponível**: CLI não encontrada no sistema.
- ⚠️ **Erro/Sem login**: CLI encontrada mas não autenticada.

---

## O que o app NÃO inclui

- ❌ Modelos de IA pagos — você precisa ter assinatura/API key própria.
- ❌ CLIs pré-instaladas — instale separadamente.
- ❌ Assinatura de código (por enquanto) — alertas de segurança do SO são esperados.

---

## Limitações conhecidas

| Limitação | SO | Solução |
|-----------|-----|---------|
| SmartScreen alerta | Windows | Clique "Executar assim mesmo" |
| Gatekeeper bloqueia | macOS | Permitir em Segurança e Privacidade |
| CLI não detectada | Todos | Instalar CLI e verificar PATH |
| .deb não auto-atualiza | Linux | Usar AppImage ou reinstalar |

---

## Solução de problemas

### O app não abre

1. Verifique se o download foi concluído corretamente.
2. No Linux: verifique se o AppImage tem permissão de execução.
3. No macOS: verifique as configurações de Segurança.
4. No Windows: desative temporariamente o antivírus.

### CLIs não são detectadas

1. Instale a CLI conforme instruções acima.
2. Feche e reabra o Felixo AI Core.
3. Verifique se a CLI funciona no terminal: `claude --version`, `codex --version`, `gemini --version`.

### O app trava ou não responde

1. Feche o app completamente.
2. Reabra o app.
3. Se o problema persistir, reporte em [Issues](https://github.com/Felipe-Alcantara/Felixo-AI-Core/issues).

### Atualizações

O app verifica atualizações automaticamente. Quando uma atualização está disponível:
1. O download acontece em segundo plano.
2. A atualização é instalada ao fechar o app.
3. Na próxima abertura, a versão nova estará ativa.
