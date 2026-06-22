# Checklist de Teste Manual de Artefatos

Status: concluido.

## Objetivo

Definir um checklist mínimo para validar se o app gerado na release realmente funciona.

---

## Checklist geral (todos os SOs)

### Instalação/Abertura

- [ ] Baixar artefato da release do GitHub.
- [ ] Instalar ou abrir o app conforme o SO.
- [ ] Confirmar que o app abre sem erros.
- [ ] Confirmar que o nome "Felixo AI Core" aparece na barra de título.
- [ ] Confirmar que o ícone/logo está correto.

### Tela inicial

- [ ] A tela inicial carrega com o campo de prompt.
- [ ] A logo do Felixo aparece.
- [ ] A sidebar está funcional (projetos, modelos, configurações).

### Configurações básicas

- [ ] Abrir configurações do Felixo.
- [ ] Abrir configurações de modelos.
- [ ] Abrir configurações do orquestrador.
- [ ] As configurações são salvas e persistem ao reabrir.

### Dados do usuário

- [ ] O diretório de dados do usuário é criado corretamente:
  - Linux: `~/.config/felixo-ai-core/`
  - Windows: `%APPDATA%/felixo-ai-core/`
  - macOS: `~/Library/Application Support/felixo-ai-core/`
- [ ] Configurações são preservadas após fechar e reabrir o app.

### Terminal e CLIs

- [ ] Enviar um prompt (se CLI estiver instalada).
- [ ] A resposta aparece em streaming.
- [ ] O terminal integrado mostra eventos.
- [ ] O botão de parar funciona.

### Git (se instalado)

- [ ] Git é detectado no sistema.
- [ ] O painel Code mostra status do repositório.
- [ ] Branch atual é exibida.
- [ ] Arquivos modificados são listados.

### Providers (se instalados)

- [ ] Claude CLI é detectado (se instalado).
- [ ] Codex CLI é detectado (se instalado).
- [ ] Gemini CLI é detectado (se instalado).
- [ ] O app mostra status claro de "disponível" ou "indisponível".

### Funcionalidades básicas

- [ ] Novo chat limpa a sessão anterior.
- [ ] Bloco de notas funciona (criar, editar, salvar).
- [ ] Exportar chat funciona.
- [ ] Trocar tema funciona.
- [ ] Threads mostram nome do modelo e contexto.

### Encerramento

- [ ] O app fecha sem travar.
- [ ] Reabrir o app preserva configurações.
- [ ] Nenhum processo fica rodando após fechar.

---

## Checklist específico por SO

### Linux

- [ ] AppImage é executável (`chmod +x` se necessário).
- [ ] O app inicia a partir do AppImage.
- [ ] .deb instala corretamente via `sudo dpkg -i`.
- [ ] O app aparece no menu de aplicativos após instalação .deb.

### Windows

- [ ] O instalador .exe roda sem erros.
- [ ] SmartScreen pode alertar (esperado para app não assinado).
- [ ] O app abre após instalação.
- [ ] O app aparece em "Adicionar ou Remover Programas".
- [ ] Desinstalação funciona.

### macOS

- [ ] O .dmg abre e mostra o app.
- [ ] Drag-and-drop para Applications funciona.
- [ ] Gatekeeper pode alertar (esperado para app não notarizado).
- [ ] O app abre após contornar Gatekeeper (System Preferences → Security).

---

## Auto-update

- [ ] O app detecta atualizações (apenas em modo empacotado).
- [ ] O download de atualização progride.
- [ ] Após fechar e reabrir, a versão nova está ativa.

---

## Registro de bugs

Bugs de empacotamento encontrados devem ser registrados como:
- Issues no GitHub com label `packaging`.
- Pendências na tasklist com referência ao SO e artefato afetado.
